import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as listingService from '../services/listingService.js';
import * as authService from '../services/authService.js';

const router = Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const user = authService.getUserById(req.user!.id);

  const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
  const status = req.query.status as 'new' | 'seen' | 'deleted' | 'active' | undefined;
  const employmentType = req.query.employmentType as
    | 'internship'
    | 'full_time'
    | 'part_time'
    | 'contract'
    | 'unknown'
    | undefined;
  // applyPreference=false lets the UI show everything regardless of user preference.
  const applyPreference = req.query.applyPreference !== 'false';

  res.json({
    listings: listingService.listListings(req.user!.id, {
      companyId,
      status,
      employmentType,
      preference: applyPreference ? user.preference : undefined,
    }),
  });
});

const statusSchema = z.object({ status: z.enum(['new', 'seen', 'deleted']) });

router.patch('/:id', validateBody(statusSchema), (req, res) => {
  res.json({
    listing: listingService.updateListingStatus(req.user!.id, Number(req.params.id), req.body.status),
  });
});

// Delete = soft delete. The row is kept so a re-scrape never resurrects it.
router.delete('/:id', (req, res) => {
  listingService.updateListingStatus(req.user!.id, Number(req.params.id), 'deleted');
  res.status(204).end();
});

const markSeenSchema = z.object({ companyId: z.number().int().positive().optional() });

router.post('/mark-seen', validateBody(markSeenSchema), (req, res) => {
  const changed = listingService.markAllSeen(req.user!.id, req.body.companyId);
  res.json({ updated: changed });
});

export default router;
