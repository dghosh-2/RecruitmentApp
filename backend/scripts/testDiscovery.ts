/**
 * Manual smoke test for careers-source discovery.
 * Usage: npx tsx scripts/testDiscovery.ts "Company Name" ["Another Co"]
 * Read-only: hits public ATS APIs (and OpenAI web search when configured).
 */
import { discoverCareersSource } from '../src/scraping/discovery.js';

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('Usage: npx tsx scripts/testDiscovery.ts "Company Name" ...');
  process.exit(1);
}

for (const name of names) {
  const result = await discoverCareersSource(name);
  console.log(`\n=== ${name} ===`);
  console.log(result ?? 'NOT FOUND -> manual URL needed');
}
