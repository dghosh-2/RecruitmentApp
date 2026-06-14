import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export interface EmailProvider {
  name: string;
  send(message: EmailMessage): Promise<void>;
}

/**
 * Console provider — the default in development.
 * To add a real provider (e.g. Resend): implement EmailProvider in a new file,
 * branch on env.emailProvider here, and set EMAIL_PROVIDER + the API key in .env.
 */
const consoleProvider: EmailProvider = {
  name: 'console',
  async send(message) {
    logger.info('Email (console provider — not actually sent)', {
      to: message.to,
      subject: message.subject,
    });
  },
};

export function getEmailProvider(): EmailProvider {
  // Future: if (env.emailProvider === 'resend' && env.resendApiKey) return resendProvider;
  return consoleProvider;
}

export async function sendNewListingsDigest(
  to: string,
  companyName: string,
  listings: { title: string; url: string | null; location: string | null }[]
): Promise<void> {
  const items = listings
    .map(
      (l) =>
        `<li><a href="${l.url ?? env.appUrl}">${l.title}</a>${l.location ? ` — ${l.location}` : ''}</li>`
    )
    .join('');

  await getEmailProvider().send({
    to,
    subject: `${listings.length} new opening${listings.length === 1 ? '' : 's'} at ${companyName}`,
    html: `<h2>New openings at ${companyName}</h2><ul>${items}</ul><p><a href="${env.appUrl}">Open RecruiterPro</a></p>`,
  });
}
