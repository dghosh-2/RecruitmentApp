import OpenAI from 'openai';
import { env, hasOpenAI } from '../config/env.js';

let client: OpenAI | null = null;
let clientKey = '';

export function getOpenAI(): OpenAI {
  if (!hasOpenAI()) {
    throw new Error(
      'OPENAI_API_KEY is not configured. Add it to the root .env file (and save it) to enable AI discovery and extraction.'
    );
  }
  // .env is hot-reloaded; rebuild the client if the key changed.
  if (!client || clientKey !== env.openaiApiKey) {
    client = new OpenAI({ apiKey: env.openaiApiKey });
    clientKey = env.openaiApiKey;
  }
  return client;
}
