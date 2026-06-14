import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as companyService from '../services/companyService.js';
import * as industryService from '../services/industryService.js';
import { listScrapeRuns } from '../services/scrapeRunService.js';
import { enqueueDiscoveryAndScrape, enqueueScrape } from '../scraping/pipeline.js';
import { resolveManualUrl } from '../scraping/discovery.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  industryId: z.number().int().positive(),
  careersUrl: z.string().url().optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  industryId: z.number().int().positive().optional(),
  careersUrl: z.string().url().nullable().optional(),
  internCareersUrl: z.string().url().nullable().optional(),
});

const scrapeSchema = z.object({
  mode: z.enum(['all', 'internship']).default('all'),
});

router.get('/', (req, res) => {
  const industryId = req.query.industryId ? Number(req.query.industryId) : undefined;
  res.json({ companies: companyService.listCompanies(req.user!.id, industryId) });
});

router.get('/:id', (req, res) => {
  const company = companyService.getCompany(req.user!.id, Number(req.params.id));
  res.json({ company, scrapeRuns: listScrapeRuns(Number(req.params.id)) });
});

// Create a company, then discover its careers source and run a first scrape
// in the background. The UI polls GET /companies to watch progress.
router.post('/', validateBody(createSchema), (req, res) => {
  const { name, industryId, careersUrl } = req.body;
  industryService.assertIndustryOwned(req.user!.id, industryId);

  const company = companyService.createCompany(req.user!.id, industryId, name, careersUrl);
  enqueueDiscoveryAndScrape(company.id);

  res.status(201).json({ company });
});

router.patch('/:id', validateBody(updateSchema), (req, res) => {
  const companyId = Number(req.params.id);
  if (req.body.industryId !== undefined) {
    industryService.assertIndustryOwned(req.user!.id, req.body.industryId);
  }

  let company = companyService.updateCompany(req.user!.id, companyId, req.body);

  // Manual careers URL supplied: detect ATS and kick off a scrape right away.
  if (typeof req.body.careersUrl === 'string') {
    const resolved = resolveManualUrl(req.body.careersUrl);
    companyService.setDiscoveryResult(companyId, {
      status: 'found',
      careersUrl: resolved.careersUrl,
      atsType: resolved.atsType,
      atsSlug: resolved.atsSlug,
      method: 'manual',
    });
    enqueueScrape(companyId);
    company = companyService.getCompany(req.user!.id, companyId);
  }

  res.json({ company });
});

router.delete('/:id', (req, res) => {
  companyService.deleteCompany(req.user!.id, Number(req.params.id));
  res.status(204).end();
});

// Throw away the current careers source and re-run discovery + scrape.
// Lets users fix companies that were matched to the wrong job board.
router.post('/:id/rediscover', (req, res) => {
  const companyId = Number(req.params.id);
  companyService.getCompany(req.user!.id, companyId); // ownership check
  companyService.clearCareersSource(companyId);
  enqueueDiscoveryAndScrape(companyId);
  res.json({ company: companyService.getCompany(req.user!.id, companyId) });
});

// Asynchronous scrape: big boards (Apple-scale) take minutes, so the request
// returns immediately and the UI polls last_scrape_status until it settles.
// Body { mode: 'internship' } scrapes only intern/early-career roles.
router.post('/:id/scrape', validateBody(scrapeSchema), (req, res) => {
  const companyId = Number(req.params.id);
  companyService.getCompany(req.user!.id, companyId); // ownership check
  companyService.setScrapeStatus(companyId, 'running');
  enqueueScrape(companyId, req.body.mode);
  res.status(202).json({ company: companyService.getCompany(req.user!.id, companyId) });
});

// Fire-and-forget scrape of every company; the UI polls for status changes.
router.post('/scrape-all', validateBody(scrapeSchema), (req, res) => {
  const companies = companyService.listCompanies(req.user!.id);
  for (const company of companies) {
    companyService.setScrapeStatus(company.id, 'running');
    enqueueScrape(company.id, req.body.mode);
  }
  res.json({ queued: companies.length });
});

export default router;
