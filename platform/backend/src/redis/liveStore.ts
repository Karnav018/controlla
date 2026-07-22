import type { ControllerLayout, LastGameResults, PresenceState, SessionStatus } from '../protocol';
import type { RedisClient } from './client';
import { kState, kPlayers, kScores, kTimers, kGamestate, kSocket, kCode, kJoinToken, sessionKeys } from './keys';

/** The live (hot-path) representation of a player, stored as JSON in the players hash. */
export interface RedisPlayer {
  nickname: string;
  avatar?: string;
  presence: PresenceState;
  ready: boolean;
  /** '' means no socket bound — see lua.ts convention. */
  socketId: string;
  everConnected: boolean;
  joinedAt: number;
  layout?: ControllerLayout | null;
}

export interface SessionStateHash {
  code: string;
  status: SessionStatus;
  hostConnected: boolean;
  hostSocketId: string;
  joinUrl: string;
  serverSeq: number;
  /** '' when no game is running. */
  currentGameId: string;
  currentInstanceId: string;
  /** Results of the most recent game — the lobby results screen; null mid-game. */
  lastResults: LastGameResults | null;
}

export type ReconnectResult =
  | { status: 'left' }
  | { status: 'first' | 'resumed' | 'rebound'; oldSocketId: string };

export interface SessionSnapshotRaw {
  state: SessionStateHash;
  players: Record<string, RedisPlayer>;
  scores: Record<string, number>;
  gamestate: unknown | null;
  seq: number;
}

/**
 * Every Redis access in the backend goes through this class — no raw redis
 * calls elsewhere. Keys map 1:1 to docs/IMPLEMENTATION_PLAN.md §7.
 */
export class LiveStore {
  constructor(private redis: RedisClient) {}

  // ── session lifecycle ────────────────────────────────────────────────

  async initSession(sessionId: string, code: string): Promise<void> {
    await this.redis
      .multi()
      .hset(kState(sessionId), {
        code,
        status: 'lobby',
        hostConnected: '0',
        hostSocketId: '',
        joinUrl: '',
        serverSeq: '0',
        currentGameId: '',
        currentInstanceId: '',
        lastResults: ''
      })
      .set(kCode(code), sessionId)
      .exec();
  }

  async sessionExists(sessionId: string): Promise<boolean> {
    return (await this.redis.exists(kState(sessionId))) === 1;
  }

  async getState(sessionId: string): Promise<SessionStateHash | null> {
    const raw = await this.redis.hgetall(kState(sessionId));
    if (!raw || Object.keys(raw).length === 0) return null;
    return this.parseState(raw);
  }

  parseState(raw: Record<string, string>): SessionStateHash {
    return {
      code: raw.code ?? '',
      status: (raw.status ?? 'lobby') as SessionStatus,
      hostConnected: raw.hostConnected === '1',
      hostSocketId: raw.hostSocketId ?? '',
      joinUrl: raw.joinUrl ?? '',
      serverSeq: Number(raw.serverSeq ?? 0),
      currentGameId: raw.currentGameId ?? '',
      currentInstanceId: raw.currentInstanceId ?? '',
      lastResults: raw.lastResults ? (JSON.parse(raw.lastResults) as LastGameResults) : null
    };
  }

  /** Atomically flip into a running game; the previous results screen is over. */
  async setCurrentGame(sessionId: string, gameId: string, instanceId: string): Promise<void> {
    await this.redis.hset(kState(sessionId), {
      status: 'playing',
      currentGameId: gameId,
      currentInstanceId: instanceId,
      lastResults: ''
    });
  }

  /** What the lobby results screen shows; survives host refreshes via snapshots. */
  async setLastResults(sessionId: string, results: LastGameResults): Promise<void> {
    await this.redis.hset(kState(sessionId), 'lastResults', JSON.stringify(results));
  }

  /** Back to lobby: clear the game pointer, its host state, and every player layout. */
  async clearCurrentGame(sessionId: string): Promise<void> {
    await this.redis
      .multi()
      .hset(kState(sessionId), { status: 'lobby', currentGameId: '', currentInstanceId: '' })
      .del(kGamestate(sessionId))
      .exec();
    const players = await this.getPlayers(sessionId);
    for (const [playerId, p] of Object.entries(players)) {
      if (p.layout) {
        p.layout = null;
        await this.putPlayer(sessionId, playerId, p);
      }
    }
  }

  /** SCAN for all session state hashes — used by game-recovery at boot. */
  async scanStateKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', 'session:*:state', 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }

  async setStatus(sessionId: string, status: SessionStatus): Promise<void> {
    await this.redis.hset(kState(sessionId), 'status', status);
  }

  async setJoinUrl(sessionId: string, joinUrl: string): Promise<void> {
    await this.redis.hset(kState(sessionId), 'joinUrl', joinUrl);
  }

  async setHostConnection(sessionId: string, socketId: string): Promise<void> {
    await this.redis.hset(kState(sessionId), {
      hostConnected: socketId ? '1' : '0',
      hostSocketId: socketId
    });
  }

  async getHostSocketId(sessionId: string): Promise<string> {
    return (await this.redis.hget(kState(sessionId), 'hostSocketId')) ?? '';
  }

  /** Clear host connection only if this socket still owns it (stale-disconnect guard). */
  async clearHostConnectionIf(sessionId: string, socketId: string): Promise<boolean> {
    const current = await this.getHostSocketId(sessionId);
    if (current !== socketId) return false;
    await this.setHostConnection(sessionId, '');
    return true;
  }

  async resolveCode(code: string): Promise<string | null> {
    return this.redis.get(kCode(code));
  }

  /** Reserve a join code; false if already taken. */
  async reserveCode(code: string, sessionId: string): Promise<boolean> {
    return (await this.redis.setnx(kCode(code), sessionId)) === 1;
  }

  async destroySession(sessionId: string, code: string): Promise<void> {
    await this.redis
      .multi()
      .del(...sessionKeys(sessionId))
      .del(kCode(code))
      .exec();
  }

  /** Sliding TTL — all session keys move in lockstep (a partial expiry = ghost session). */
  async touchSession(sessionId: string, ttlMs: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const key of sessionKeys(sessionId)) pipeline.pexpire(key, ttlMs);
    await pipeline.exec();
  }

  // ── players ──────────────────────────────────────────────────────────

  async putPlayer(sessionId: string, playerId: string, player: RedisPlayer): Promise<void> {
    await this.redis.hset(kPlayers(sessionId), playerId, JSON.stringify(player));
  }

  async getPlayer(sessionId: string, playerId: string): Promise<RedisPlayer | null> {
    const raw = await this.redis.hget(kPlayers(sessionId), playerId);
    return raw ? (JSON.parse(raw) as RedisPlayer) : null;
  }

  async getPlayers(sessionId: string): Promise<Record<string, RedisPlayer>> {
    const raw = await this.redis.hgetall(kPlayers(sessionId));
    const out: Record<string, RedisPlayer> = {};
    for (const [id, json] of Object.entries(raw)) out[id] = JSON.parse(json) as RedisPlayer;
    return out;
  }

  async removePlayer(sessionId: string, playerId: string): Promise<void> {
    await this.redis
      .multi()
      .hdel(kPlayers(sessionId), playerId)
      .hdel(kScores(sessionId), playerId)
      .exec();
  }

  async setPlayerReady(sessionId: string, playerId: string, ready: boolean): Promise<boolean> {
    const p = await this.getPlayer(sessionId, playerId);
    if (!p) return false;
    p.ready = ready;
    await this.putPlayer(sessionId, playerId, p);
    return true;
  }

  async setPlayerLayout(sessionId: string, playerId: string, layout: ControllerLayout): Promise<boolean> {
    const p = await this.getPlayer(sessionId, playerId);
    if (!p) return false;
    p.layout = layout;
    await this.putPlayer(sessionId, playerId, p);
    return true;
  }

  /** Atomic disconnect transition — see DISCONNECT_LUA. */
  async disconnectPlayer(sessionId: string, playerId: string, socketId: string, graceAtMs: number): Promise<boolean> {
    const res = await this.redis.playerDisconnect(kPlayers(sessionId), kTimers(sessionId), playerId, socketId, graceAtMs);
    return res === 1;
  }

  /** Atomic reconnect/rebind transition — see RECONNECT_LUA. */
  async reconnectPlayer(sessionId: string, playerId: string, socketId: string): Promise<ReconnectResult> {
    const raw = await this.redis.playerReconnect(kPlayers(sessionId), kTimers(sessionId), playerId, socketId);
    return JSON.parse(raw) as ReconnectResult;
  }

  // ── scores / gamestate ───────────────────────────────────────────────

  async getScores(sessionId: string): Promise<Record<string, number>> {
    const raw = await this.redis.hgetall(kScores(sessionId));
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(raw)) out[id] = Number(v);
    return out;
  }

  async addScore(sessionId: string, playerId: string, delta: number): Promise<number> {
    return this.redis.hincrby(kScores(sessionId), playerId, delta);
  }

  async getScore(sessionId: string, playerId: string): Promise<number> {
    return Number((await this.redis.hget(kScores(sessionId), playerId)) ?? 0);
  }

  async setGamestate(sessionId: string, state: unknown): Promise<void> {
    await this.redis.set(kGamestate(sessionId), JSON.stringify(state));
  }

  async getGamestate(sessionId: string): Promise<unknown | null> {
    const raw = await this.redis.get(kGamestate(sessionId));
    return raw ? JSON.parse(raw) : null;
  }

  // ── sockets ──────────────────────────────────────────────────────────

  async bindSocket(socketId: string, sessionId: string, who: string, ttlMs: number): Promise<void> {
    await this.redis.set(kSocket(socketId), `${sessionId}:${who}`, 'PX', ttlMs);
  }

  async unbindSocket(socketId: string): Promise<void> {
    await this.redis.del(kSocket(socketId));
  }

  // ── rate limiting (fixed window) ─────────────────────────────────────

  /** Returns the hit count for this window; first hit arms the window TTL. */
  async rateHit(prefix: string, id: string, windowMs: number): Promise<number> {
    const windowStart = Math.floor(Date.now() / windowMs);
    const key = `rl:${prefix}:${id}:${windowStart}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.pexpire(key, windowMs);
    return count;
  }

  // ── join tokens ──────────────────────────────────────────────────────

  async storeJoinToken(jti: string, sessionId: string, ttlMs: number): Promise<void> {
    await this.redis.set(kJoinToken(jti), sessionId, 'PX', ttlMs);
  }

  /** Validate-only (GET, never GETDEL) — many phones scan the same QR frame. */
  async checkJoinToken(jti: string): Promise<string | null> {
    return this.redis.get(kJoinToken(jti));
  }

  // ── seq + snapshot reads ─────────────────────────────────────────────

  async nextServerSeq(sessionId: string): Promise<number> {
    return this.redis.hincrby(kState(sessionId), 'serverSeq', 1);
  }

  /**
   * One MULTI: all snapshot reads AND the seq increment happen atomically,
   * so the snapshot's seq is consistent with what it contains.
   */
  async readSnapshot(sessionId: string): Promise<SessionSnapshotRaw | null> {
    const res = await this.redis
      .multi()
      .hgetall(kState(sessionId))
      .hgetall(kPlayers(sessionId))
      .hgetall(kScores(sessionId))
      .get(kGamestate(sessionId))
      .hincrby(kState(sessionId), 'serverSeq', 1)
      .exec();
    if (!res) return null;
    const [stateRaw, playersRaw, scoresRaw, gamestateRaw, seqRaw] = res.map((r) => r?.[1]);
    const stateObj = stateRaw as Record<string, string>;
    if (!stateObj || Object.keys(stateObj).length === 0) return null;

    const players: Record<string, RedisPlayer> = {};
    for (const [id, json] of Object.entries((playersRaw as Record<string, string>) ?? {})) {
      players[id] = JSON.parse(json) as RedisPlayer;
    }
    const scores: Record<string, number> = {};
    for (const [id, v] of Object.entries((scoresRaw as Record<string, string>) ?? {})) {
      scores[id] = Number(v);
    }
    return {
      state: this.parseState(stateObj),
      players,
      scores,
      gamestate: gamestateRaw ? JSON.parse(gamestateRaw as string) : null,
      seq: Number(seqRaw)
    };
  }

  // ── timers (zset access used by TimerService) ────────────────────────

  async addTimer(sessionId: string, member: string, fireAtMs: number): Promise<void> {
    await this.redis.zadd(kTimers(sessionId), fireAtMs, member);
  }

  async removeTimer(sessionId: string, member: string): Promise<void> {
    await this.redis.zrem(kTimers(sessionId), member);
  }

  /** Pop-if-due; the returned true is the exclusive license to fire. */
  async popDueTimer(sessionId: string, member: string, nowMs: number): Promise<boolean> {
    return (await this.redis.popDueTimer(kTimers(sessionId), member, nowMs)) === 1;
  }

  async listTimers(sessionId: string): Promise<Array<{ member: string; fireAtMs: number }>> {
    const flat = await this.redis.zrange(kTimers(sessionId), 0, -1, 'WITHSCORES');
    const out: Array<{ member: string; fireAtMs: number }> = [];
    for (let i = 0; i < flat.length; i += 2) {
      out.push({ member: flat[i]!, fireAtMs: Number(flat[i + 1]) });
    }
    return out;
  }

  async listDueTimers(sessionId: string, nowMs: number): Promise<string[]> {
    return this.redis.zrangebyscore(kTimers(sessionId), 0, nowMs);
  }

  /** SCAN for all timer zsets — used by boot recovery and the sweep loop. */
  async scanTimerKeys(): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', 'session:*:timers', 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }
}
