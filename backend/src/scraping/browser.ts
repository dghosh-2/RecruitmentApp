import { chromium, type Browser } from 'playwright';
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

export interface RenderedPage {
  finalUrl: string;
  /** Visible text content, capped for prompt size. */
  text: string;
  /** All anchors on the page so the model can resolve job + pagination URLs. */
  links: { text: string; href: string }[];
}

export async function renderPage(url: string): Promise<RenderedPage> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: env.scrapeTimeoutMs });
    // Career boards often hydrate listings client-side after load.
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1000);

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
    await context.close();
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
