import { createApp } from './app.js';
import { env, hasOpenAI } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { closeBrowser } from './scraping/browser.js';
import { recoverInterruptedScrapes } from './services/scrapeRunService.js';
import { recoverInterruptedSearches } from './services/searchService.js';
import { logger } from './utils/logger.js';

runMigrations();
recoverInterruptedScrapes();
recoverInterruptedSearches();

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`API listening on http://localhost:${env.port}`, {
    openaiConfigured: hasOpenAI(),
  });
  if (!hasOpenAI()) {
    logger.warn(
      'OPENAI_API_KEY not set — careers-page discovery and AI extraction are disabled. ' +
        'ATS-hosted boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workable) still work.'
    );
  }
});

async function shutdown() {
  logger.info('Shutting down');
  await closeBrowser();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
