import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as industryService from '../services/industryService.js';

const router = Router();
router.use(requireAuth);

const nameSchema = z.object({ name: z.string().trim().min(1).max(80) });

router.get('/', (req, res) => {
  res.json({ industries: industryService.listIndustries(req.user!.id) });
});

router.post('/', validateBody(nameSchema), (req, res) => {
  res.status(201).json({ industry: industryService.createIndustry(req.user!.id, req.body.name) });
});

router.patch('/:id', validateBody(nameSchema), (req, res) => {
  res.json({
    industry: industryService.renameIndustry(req.user!.id, Number(req.params.id), req.body.name),
  });
});

router.delete('/:id', (req, res) => {
  industryService.deleteIndustry(req.user!.id, Number(req.params.id));
  res.status(204).end();
});

export default router;
