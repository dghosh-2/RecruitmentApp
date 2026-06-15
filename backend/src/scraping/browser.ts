import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true }).catch((err) => {
      browserPromise = null;
      throw new Error(
        `Failed to launch Chromium (run "npx playwright install chromium"): ${err.message}`
      );
    });
  }
  return browserPromise;
}

// We only ever read visible text + anchors, so images/media/fonts are pure
// download cost. Stylesheets and scripts are kept: scripts hydrate JS-rendered
// boards, and dropping CSS would let display:none content leak into innerText.
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

// Trackers/analytics keep sockets open and stall page-load detection without
// ever contributing listings. Blocking them speeds up settling, never content.
const BLOCKED_HOST_FRAGMENTS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'facebook.net',
  'facebook.com/tr',
  'hotjar.com',
  'segment.com',
  'segment.io',
  'fullstory.com',
  'mixpanel.com',
  'intercom.io',
  'intercomcdn.com',
  'sentry.io',
  'cdn.amplitude.com',
];

async function newScrapeContext(): Promise<BrowserContext> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  });

  // Abort unnecessary requests at the network layer for every page in this
  // context. This cuts page weight dramatically and lets the page settle sooner.
  await context.route('**/*', (route) => {
    const request = route.request();
    if (BLOCKED_RESOURCE_TYPES.has(request.resourceType())) {
      return route.abort();
    }
    const url = request.url();
    if (BLOCKED_HOST_FRAGMENTS.some((fragment) => url.includes(fragment))) {
      return route.abort();
    }
    return route.continue();
  });

  return context;
}

export interface RenderedPage {
  finalUrl: string;
  /** Visible text content, capped for prompt size. */
  text: string;
  /** All anchors on the page so the model can resolve job + pagination URLs. */
  links: { text: string; href: string }[];
}

/**
 * Wait for client-hydrated listings to settle by polling the anchor count until
 * it stops growing, rather than waiting on `networkidle`. Career boards often
 * inject listings after load, but `networkidle` can hang near its cap on pages
 * that hold open sockets (chat widgets, long-polling). This returns as soon as
 * the DOM is stable, with a hard ceiling so a noisy page can't stall the crawl.
 */
async function waitForAnchorsToSettle(page: Page): Promise<void> {
  const maxWaitMs = 8000;
  const intervalMs = 350;
  const stableReadsNeeded = 2;
  const deadline = Date.now() + maxWaitMs;

  let lastCount = -1;
  let stableReads = 0;

  while (Date.now() < deadline) {
    const count = await page
      .evaluate(() => document.querySelectorAll('a[href]').length)
      .catch(() => lastCount);

    if (count === lastCount) {
      stableReads += 1;
      if (stableReads >= stableReadsNeeded) return;
    } else {
      stableReads = 0;
      lastCount = count;
    }

    await page.waitForTimeout(intervalMs);
  }
}

async function renderInContext(context: BrowserContext, url: string): Promise<RenderedPage> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: env.scrapeTimeoutMs });
    await waitForAnchorsToSettle(page);

    const finalUrl = page.url();
    const text = await page.evaluate(() => document.body?.innerText ?? '');
    const links = await page.evaluate(() => {
      const out: { text: string; href: string }[] = [];
      for (const a of Array.from(document.querySelectorAll('a[href]'))) {
        // getAttribute + manual resolution: SVG <a> elements have a non-string
        // .href (SVGAnimatedString), and getAttribute can return non-string
        // values on exotic nodes — coerce defensively so one bad anchor can
        // never throw and abort the whole page's extraction.
        try {
          const raw = a.getAttribute('href');
          if (typeof raw !== 'string' || raw === '') continue;
          const href = new URL(raw, window.location.href).toString();
          if (!href.startsWith('http')) continue;
          out.push({
            text: (a.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
            href,
          });
        } catch {
          /* unresolvable href (e.g. javascript:, mailto:, malformed) — skip it */
        }
      }
      return out;
    });

    return {
      finalUrl,
      text: text.replace(/\n{3,}/g, '\n\n').slice(0, 24000),
      links: links.slice(0, 400),
    };
  } finally {
    await page.close();
  }
}

/**
 * A render session reuses one browser context (with resource blocking installed
 * once) across every page of a single scrape, avoiding repeated context setup
 * when following pagination. Always `close()` it when the crawl finishes.
 */
export interface RenderSession {
  render(url: string): Promise<RenderedPage>;
  close(): Promise<void>;
}

export async function createRenderSession(): Promise<RenderSession> {
  const context = await newScrapeContext();
  return {
    render: (url: string) => renderInContext(context, url),
    close: () => context.close(),
  };
}

/** Render a single page in its own short-lived context. */
export async function renderPage(url: string): Promise<RenderedPage> {
  const session = await createRenderSession();
  try {
    return await session.render(url);
  } finally {
    await session.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch (err) {
      logger.warn('Error closing browser', { error: err instanceof Error ? err.message : String(err) });
    }
    browserPromise = null;
  }
}
