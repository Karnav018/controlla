import type { Request, RequestHandler } from 'express';
import type { TokenService } from '../../services/tokenService';
import { GameSession } from '../../db/models/gameSession';
import { AppError } from '../errors';

function bearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

/**
 * Host-only commands are verified server-side, never by client role claims:
 * role must be 'host', the token's sid must match the route param, AND the
 * token's sha256 must match the hash minted at session creation (Mongo) —
 * so a leaked signing key alone can't forge host access to a live session.
 */
export function requireHost(tokens: TokenService): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = bearer(req);
      const claims = token ? tokens.verifyClientToken(token) : null;
      if (!token || !claims || claims.role !== 'host' || claims.sessionId !== req.params.id) {
        throw new AppError(403, 'FORBIDDEN');
      }
      const doc = await GameSession.findById(claims.sessionId).select('hostTokenHash').lean();
      if (!doc || doc.hostTokenHash !== tokens.hashToken(token)) throw new AppError(403, 'FORBIDDEN');
      res.locals.sessionId = claims.sessionId;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requirePlayer(tokens: TokenService): RequestHandler {
  return (req, res, next) => {
    const token = bearer(req);
    const claims = token ? tokens.verifyClientToken(token) : null;
    if (!claims || claims.role !== 'player' || claims.sessionId !== req.params.id || !claims.playerId) {
      return next(new AppError(403, 'FORBIDDEN'));
    }
    res.locals.playerId = claims.playerId;
    next();
  };
}

/** GET /sessions/:id is public, but a valid host token unlocks the joinUrl. */
export function detectHost(tokens: TokenService): RequestHandler {
  return async (req, res, next) => {
    res.locals.isHost = false;
    try {
      const token = bearer(req);
      const claims = token ? tokens.verifyClientToken(token) : null;
      if (token && claims?.role === 'host' && claims.sessionId === req.params.id) {
        const doc = await GameSession.findById(claims.sessionId).select('hostTokenHash').lean();
        res.locals.isHost = !!doc && doc.hostTokenHash === tokens.hashToken(token);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
