import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const projectRoot = path.resolve(backendRoot, '..');

const envFiles = [path.join(projectRoot, '.env'), path.join(backendRoot, '.env')];

// override:true makes the file authoritative — stale values inherited from the
// parent shell (e.g. a placeholder exported before the file was edited) lose.
function loadEnvFiles(): void {
  for (const candidate of envFiles) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: true });
    }
  }
}

loadEnvFiles();

function str(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function int(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function computeEnv() {
  return {
    nodeEnv: str('NODE_ENV', 'development'),
    port: int('PORT', 4000),

    databasePath: path.isAbsolute(str('DATABASE_PATH', 'data/recruiterpro.db'))
      ? str('DATABASE_PATH', 'data/recruiterpro.db')
      : path.join(backendRoot, str('DATABASE_PATH', 'data/recruiterpro.db')),

    jwtSecret: str('JWT_SECRET', 'dev-only-secret-replace-with-long-random-string'),
    jwtExpiresIn: str('JWT_EXPIRES_IN', '7d'),

    openaiApiKey: process.env.OPENAI_API_KEY?.startsWith('sk-REPLACE')
      ? ''
      : (process.env.OPENAI_API_KEY ?? ''),
    openaiModel: str('OPENAI_MODEL', 'gpt-4o'),

    scrapeMaxPages: int('SCRAPE_MAX_PAGES', 30),
    scrapeTimeoutMs: int('SCRAPE_TIMEOUT_MS', 30000),
    scrapeConcurrency: int('SCRAPE_CONCURRENCY', 2),

    emailProvider: str('EMAIL_PROVIDER', 'console'),
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    emailFrom: str('EMAIL_FROM', 'RecruiterPro <noreply@example.com>'),

    appUrl: str('APP_URL', 'http://localhost:5173'),
  };
}

export const env = computeEnv();

export function hasOpenAI(): boolean {
  return env.openaiApiKey.length > 0;
}

// Hot-reload .env on save so editing the OpenAI key (or scrape limits) takes
// effect without restarting the dev server. Structural settings like PORT and
// DATABASE_PATH still require a restart.
for (const file of envFiles) {
  if (fs.existsSync(file)) {
    // unref: don't keep short-lived CLI processes (migrate, scripts) alive.
    fs.watchFile(file, { interval: 2000 }, () => {
      loadEnvFiles();
      Object.assign(env, computeEnv());
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: 'info',
          message: 'Reloaded .env',
          openaiConfigured: hasOpenAI(),
        })
      );
    }).unref();
  }
}
