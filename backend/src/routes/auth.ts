import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as authService from '../services/authService.js';

const router = Router();

const preferenceSchema = z.enum(['internship', 'full_time', 'both']);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  preference: preferenceSchema.default('both'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateSchema = z.object({
  preference: preferenceSchema.optional(),
  notifyEmail: z.boolean().optional(),
});

router.post('/register', validateBody(registerSchema), (req, res) => {
  const { email, password, preference } = req.body;
  res.status(201).json(authService.register(email, password, preference));
});

router.post('/login', validateBody(loginSchema), (req, res) => {
  const { email, password } = req.body;
  res.json(authService.login(email, password));
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: authService.getUserById(req.user!.id) });
});

router.patch('/me', requireAuth, validateBody(updateSchema), (req, res) => {
  res.json({ user: authService.updateProfile(req.user!.id, req.body) });
});

export default router;
