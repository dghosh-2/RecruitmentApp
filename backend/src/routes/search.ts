import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { enqueueAutoSearch } from '../search/autoPipeline.js';
import { enqueueSearch } from '../search/pipeline.js';
import * as searchService from '../services/searchService.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  query: z.string().trim().min(3).max(500),
  mode: z.enum(['fast', 'thorough']).default('thorough'),
  // 'discover' = company suggestions only (Discover page);
  // 'auto' = the all-in-one Assistant: discover + scrape internships end to end.
  kind: z.enum(['discover', 'auto']).default('discover'),
});

// Start a natural-language run. The pipeline runs in the background; the response
// returns immediately (202) and the UI polls GET /search/:id until status
// settles. `mode` selects discovery depth ('fast'/'thorough'); `kind` selects
// whether to also scrape the discovered companies for internships ('auto').
router.post('/', validateBody(createSchema), (req, res) => {
  const search = searchService.createSearch(
    req.user!.id,
    req.body.query,
    req.body.mode,
    req.body.kind
  );
  if (req.body.kind === 'auto') {
    enqueueAutoSearch(search.id);
  } else {
    enqueueSearch(search.id);
  }
  res.status(202).json({ search });
});

router.get('/', (req, res) => {
  res.json({ searches: searchService.listSearches(req.user!.id) });
});

router.get('/:id', (req, res) => {
  res.json({ search: searchService.getSearch(req.user!.id, Number(req.params.id)) });
});

export default router;
