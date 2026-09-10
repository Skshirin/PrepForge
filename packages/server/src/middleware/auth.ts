// ============================================================================
// Auth Middleware
// ============================================================================
//
// Attaches req.user from session and returns 401 for unauthenticated requests.
// Uses express-session with userId stored in session.

import { Request, Response, NextFunction } from 'express';
import { User, IUser } from '../models';

// Extend express-session to include userId
declare module 'express-session' {
  interface SessionData {
    userId?: string;
  }
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
    }
  }
}

/**
 * Auth guard middleware.
 * Looks up session.userId, loads the user, and attaches to req.user.
 * Returns 401 if no valid session or user not found.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.session?.userId;

    if (!userId) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required. Please log in.',
        },
      });
      return;
    }

    const user = await User.findById(userId).select('-passwordHash');

    if (!user) {
      // Session references a deleted user — destroy the stale session
      req.session.destroy(() => {});
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session expired. Please log in again.',
        },
      });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
