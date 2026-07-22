import type { RequestHandler } from 'express';
import type { LiveStore } from '../../redis/liveStore';
import { AppError } from '../errors';

/**
 * Redis-backed fixed-window limiter keyed by client IP — shared state, so it
 * holds across multiple backend nodes later. Fails open on Redis errors
 * (availability over strictness for a party-game platform).
 */
export function rateLimit(store: LiveStore, prefix: string, limit: number, windowMs: number): RequestHandler {
  return async (req, _res, next) => {
    try {
      const count = await store.rateHit(prefix, req.ip ?? 'unknown', windowMs);
      if (count > limit) return next(new AppError(429, 'RATE_LIMITED', 'Too many requests — slow down'));
      next();
    } catch {
      next();
    }
  };
}
