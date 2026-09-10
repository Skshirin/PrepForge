// ============================================================================
// Auth Middleware
// ============================================================================
//
// Attaches req.user from session and returns 401 for unauthenticated requests.
// Uses express-session with userId stored in session.

import { Request, Response, NextFunction } from 'express';
import { User, IUser } from '../models';
import { verifyAuthToken } from '../utils';

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
 * Supports dual authentication:
 *   1. Cookie-based session (req.session.userId)
 *   2. Header-based Bearer token (Authorization: Bearer <token> or X-Auth-Token)
 * 
 * Attaches authenticated user to req.user.
 * Returns 401 if neither is valid or user not found.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let userId = req.session?.userId;

    // If no session cookie, check Authorization: Bearer <token> or X-Auth-Token header
    if (!userId) {
      const authHeader = req.headers.authorization || (req.headers['x-auth-token'] as string);
      if (authHeader) {
        const rawToken = authHeader.startsWith('Bearer ')
          ? authHeader.substring(7).trim()
          : authHeader.trim();
        const verifiedId = verifyAuthToken(rawToken);
        if (verifiedId) {
          userId = verifiedId;
        }
      }
    }

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
      // Session or token references a nonexistent/deleted user
      if (req.session) {
        req.session.destroy(() => {});
      }
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Session expired. Please log in again.',
        },
      });
      return;
    }

    req.user = user;
    if (req.session && !req.session.userId) {
      req.session.userId = user._id.toString();
    }
    next();
  } catch (err) {
    next(err);
  }
}
