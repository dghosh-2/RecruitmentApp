/**
 * Manual smoke test for the AI extraction path (Playwright + OpenAI).
 * Usage: npx tsx scripts/testExtraction.ts <careers-url>
 * Read-only: renders the page and extracts listings without touching the DB.
 */
import { extractListingsWithAI } from '../src/scraping/aiExtractor.js';
import { closeBrowser } from '../src/scraping/browser.js';

const url = process.argv[2];
if (!url) {
  console.error('Usage: npx tsx scripts/testExtraction.ts <careers-url>');
  process.exit(1);
}

const result = await extractListingsWithAI(url);
console.log(`\npages crawled: ${result.pagesCrawled}, listings: ${result.listings.length}`);
for (const listing of result.listings.slice(0, 15)) {
  console.log(`- [${listing.employmentType ?? 'unknown'}] ${listing.title} (${listing.location ?? 'n/a'})`);
}
if (result.listings.length > 15) console.log(`... and ${result.listings.length - 15} more`);

await closeBrowser();
