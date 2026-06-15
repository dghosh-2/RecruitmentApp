import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { enqueueSearch } from '../search/pipeline.js';
import * as searchService from '../services/searchService.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  query: z.string().trim().min(3).max(500),
  mode: z.enum(['fast', 'thorough']).default('thorough'),
});

// Start a natural-language company-discovery search. The multi-agent pipeline
// runs in the background; the response returns immediately (202) and the UI
// polls GET /search/:id until status settles. `mode` selects discovery depth:
// 'fast' (small fan-out, no orchestrator LLM calls) or 'thorough'.
router.post('/', validateBody(createSchema), (req, res) => {
  const search = searchService.createSearch(req.user!.id, req.body.query, req.body.mode);
  enqueueSearch(search.id);
  res.status(202).json({ search });
});

router.get('/', (req, res) => {
  res.json({ searches: searchService.listSearches(req.user!.id) });
});

router.get('/:id', (req, res) => {
  res.json({ search: searchService.getSearch(req.user!.id, Number(req.params.id)) });
});

export default router;
