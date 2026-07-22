import type { Socket } from 'socket.io';
import type { LiveStore } from '../redis/liveStore';
import type { TokenService } from '../services/tokenService';
import type { SocketData } from './types';

/**
 * io.use() middleware. Token rides handshake.auth (never the query string —
 * query strings leak into proxy/access logs). Kept O(1): JWT verify + one
 * Redis existence check; everything heavier happens in the connection handler.
 * Failures surface client-side as connect_error with a machine-readable message.
 */
export function socketAuthMiddleware(tokens: TokenService, store: LiveStore) {
  return async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
    try {
      const token = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
      if (typeof token !== 'string') return next(new Error('UNAUTHORIZED'));
      const claims = tokens.verifyClientToken(token);
      if (!claims) return next(new Error('UNAUTHORIZED'));
      if (!(await store.sessionExists(claims.sessionId))) return next(new Error('SESSION_NOT_FOUND'));
      const data: SocketData = {
        sessionId: claims.sessionId,
        role: claims.role,
        playerId: claims.playerId ?? '',
        lastSeq: 0
      };
      socket.data = data;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  };
}
