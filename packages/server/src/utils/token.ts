// ============================================================================
// Auth Token Utility (HMAC SHA-256)
// ============================================================================
//
// Provides lightweight signed Bearer tokens as a fallback for cross-domain
// authentication (e.g. Vercel frontend <-> Render backend) where modern browsers
// block third-party cookies by default.

import crypto from 'crypto';

const SESSION_SECRET = process.env.SESSION_SECRET || 'trao-interview-kit-insecure-dev-secret';

/**
 * Creates a signed auth token containing userId and expiration timestamp.
 * Token format: base64url(userId:expiresAt:signature)
 */
export function createAuthToken(userId: string, expiresInDays = 14): string {
  const expiresAt = Date.now() + expiresInDays * 24 * 60 * 60 * 1000;
  const data = `${userId}:${expiresAt}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('hex');
  return Buffer.from(`${data}:${sig}`).toString('base64url');
}

/**
 * Verifies a signed auth token and returns the userId if valid and not expired.
 * Returns null if invalid, expired, or tampered with.
 */
export function verifyAuthToken(token: string): string | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;

    const [userId, expiresAtStr, sig] = parts;
    if (!userId || !expiresAtStr || !sig) return null;

    const expiresAt = parseInt(expiresAtStr, 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      return null; // Expired
    }

    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${userId}:${expiresAt}`)
      .digest('hex');

    // Timing-safe comparison to prevent side-channel attacks
    const sigBuf = Buffer.from(sig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');

    if (sigBuf.length !== expectedBuf.length) {
      return null;
    }

    if (crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return userId;
    }

    return null;
  } catch {
    return null;
  }
}
