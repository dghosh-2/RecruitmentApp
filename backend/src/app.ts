import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth.js';
import companyRoutes from './routes/companies.js';
import industryRoutes from './routes/industries.js';
import listingRoutes from './routes/listings.js';
import searchRoutes from './routes/search.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { hasOpenAI } from './config/env.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, openaiConfigured: hasOpenAI() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/industries', industryRoutes);
  app.use('/api/companies', companyRoutes);
  app.use('/api/listings', listingRoutes);
  app.use('/api/search', searchRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
