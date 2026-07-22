import jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'node:crypto';
import type { Config } from '../config';
import type { LiveStore } from '../redis/liveStore';

export interface ClientClaims {
  role: 'host' | 'player';
  sessionId: string;
  playerId?: string;
}

/**
 * Three JWT kinds, distinguished by the `role` claim:
 * - host:   issued at session create; sha256 stored in Mongo for REST auth.
 * - player: the resume credential — issued at /join, lives in the phone's
 *           localStorage, authenticates every socket connection.
 * - join:   short-lived QR token; jti tracked in Redis so rotation + session
 *           end invalidate outstanding QRs. Shared, never single-use.
 */
export class TokenService {
  constructor(
    private cfg: Config,
    private store: LiveStore
  ) {}

  private sign(claims: object, ttlMs: number): string {
    return jwt.sign(claims, this.cfg.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: Math.ceil(ttlMs / 1000)
    });
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  issueHostToken(sessionId: string): string {
    return this.sign({ role: 'host', sid: sessionId }, this.cfg.SESSION_TTL_MS);
  }

  issuePlayerToken(sessionId: string, playerId: string): string {
    return this.sign({ role: 'player', sid: sessionId, pid: playerId }, this.cfg.SESSION_TTL_MS);
  }

  async issueJoinToken(sessionId: string): Promise<{ token: string; jti: string }> {
    const jti = randomUUID();
    const token = this.sign({ role: 'join', sid: sessionId, jti }, this.cfg.JOIN_TOKEN_TTL_MS);
    await this.store.storeJoinToken(jti, sessionId, this.cfg.JOIN_TOKEN_TTL_MS);
    return { token, jti };
  }

  /** Returns the sessionId the join token grants access to, or null. */
  async verifyJoinToken(token: string): Promise<string | null> {
    const payload = this.verifyRaw(token);
    if (!payload || payload.role !== 'join' || typeof payload.sid !== 'string' || typeof payload.jti !== 'string') {
      return null;
    }
    const stored = await this.store.checkJoinToken(payload.jti);
    return stored === payload.sid ? payload.sid : null;
  }

  private static ADMIN_TTL_MS = 12 * 60 * 60 * 1000;

  issueAdminToken(email: string): string {
    return this.sign({ role: 'admin', sub: email }, TokenService.ADMIN_TTL_MS);
  }

  verifyAdminToken(token: string): boolean {
    const payload = this.verifyRaw(token);
    return payload?.role === 'admin';
  }

  verifyClientToken(token: string): ClientClaims | null {
    const payload = this.verifyRaw(token);
    if (!payload || typeof payload.sid !== 'string') return null;
    if (payload.role === 'host') return { role: 'host', sessionId: payload.sid };
    if (payload.role === 'player' && typeof payload.pid === 'string') {
      return { role: 'player', sessionId: payload.sid, playerId: payload.pid };
    }
    return null; // join tokens are NOT client tokens — role confusion is a bug
  }

  private verifyRaw(token: string): Record<string, unknown> | null {
    try {
      const payload = jwt.verify(token, this.cfg.JWT_SECRET, { algorithms: ['HS256'] });
      return typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
