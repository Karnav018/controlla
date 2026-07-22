import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { TokenService } from '../../services/tokenService';
import { AppError } from '../errors';

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Operator auth for /admin: POST /admin/login (email+password from config,
 * compared timing-safe) issues a short-lived admin JWT; every other /admin
 * route requires it. Deliberately separate from host/player tokens — the
 * role claim is 'admin' and nothing else accepts it.
 */
export function requireAdmin(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token || !tokens.verifyAdminToken(token)) {
      return next(new AppError(401, 'ADMIN_UNAUTHORIZED', 'Sign in as an operator'));
    }
    next();
  };
}
