// ============================================================================
// Auth Routes
// ============================================================================
//
// POST /api/auth/register — create user, start session
// POST /api/auth/login    — verify password, start session
// POST /api/auth/logout   — destroy session
// GET  /api/auth/me       — return current user or 401

import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { User } from '../models';
import { requireAuth } from '../middleware';

const router = Router();

// ---- Validation schemas ----------------------------------------------------

const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

// ---- Constants -------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

// ---- POST /api/auth/register -----------------------------------------------

router.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid registration data.',
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const { email, password } = parsed.data;

      // Check if email already exists
      const existing = await User.findOne({ email });
      if (existing) {
        res.status(409).json({
          error: {
            code: 'EMAIL_EXISTS',
            message: 'An account with this email already exists.',
          },
        });
        return;
      }

      // Hash password and create user
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = await User.create({ email, passwordHash });

      // Start session
      req.session.userId = user._id.toString();

      res.status(201).json({
        user: {
          id: user._id,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---- POST /api/auth/login --------------------------------------------------

router.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid login data.',
            details: parsed.error.flatten().fieldErrors,
          },
        });
        return;
      }

      const { email, password } = parsed.data;

      // Find user by email (include passwordHash for comparison)
      const user = await User.findOne({ email });
      if (!user) {
        res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          },
        });
        return;
      }

      // Compare password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        res.status(401).json({
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid email or password.',
          },
        });
        return;
      }

      // Start session
      req.session.userId = user._id.toString();

      res.json({
        user: {
          id: user._id,
          email: user.email,
          createdAt: user.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---- POST /api/auth/logout -------------------------------------------------

router.post(
  '/logout',
  (req: Request, res: Response, next: NextFunction): void => {
    req.session.destroy((err) => {
      if (err) {
        return next(err);
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully.' });
    });
  }
);

// ---- GET /api/auth/me ------------------------------------------------------

router.get(
  '/me',
  requireAuth,
  (req: Request, res: Response): void => {
    const user = req.user!;
    res.json({
      user: {
        id: user._id,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  }
);

export { router as authRouter };
export default router;
