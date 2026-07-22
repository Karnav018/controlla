import { randomUUID } from 'node:crypto';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { JoinRequest, JoinResponse, PlayerPublic } from '../protocol';
import type { LiveStore } from '../redis/liveStore';
import type { PluginRuntimePort } from '../bus/types';
import type { RoomEmitter } from '../ws/emitter';
import type { TimerService } from './timerService';
import type { TokenService } from './tokenService';
import { GameSession } from '../db/models/gameSession';
import { AppError } from '../http/errors';

export class PlayerService {
  constructor(
    private cfg: Config,
    private store: LiveStore,
    private tokens: TokenService,
    private timers: TimerService,
    private emitter: RoomEmitter,
    private runtime: PluginRuntimePort,
    private log: Logger
  ) {}

  async join(sessionId: string, req: JoinRequest): Promise<JoinResponse> {
    const state = await this.store.getState(sessionId);
    if (!state || state.status === 'ended') throw new AppError(404, 'SESSION_NOT_FOUND');

    // QR path carries a joinToken; typed-code fallback (§4.4) arrives without one.
    if (req.joinToken !== undefined) {
      const granted = await this.tokens.verifyJoinToken(req.joinToken);
      if (granted !== sessionId) throw new AppError(401, 'INVALID_JOIN_TOKEN');
    }

    const playerId = randomUUID();
    await this.store.putPlayer(sessionId, playerId, {
      nickname: req.nickname,
      avatar: req.avatar,
      presence: 'disconnected',
      ready: false,
      socketId: '',
      everConnected: false,
      joinedAt: Date.now()
    });
    // Ghost-join protection: joined-but-never-connected seats expire through
    // the normal grace path.
    await this.timers.schedule(sessionId, 'grace', playerId, Date.now() + this.cfg.GRACE_PERIOD_MS);
    await GameSession.updateOne(
      { _id: sessionId },
      { $push: { players: { playerId, nickname: req.nickname, avatar: req.avatar, joinedAt: new Date() } } }
    );
    await this.runtime.onPlayerJoin(sessionId, playerId);
    await this.store.touchSession(sessionId, this.cfg.SESSION_TTL_MS);
    this.log.info({ sessionId, playerId }, 'player joined');
    return { playerId, playerToken: this.tokens.issuePlayerToken(sessionId, playerId) };
  }

  /** Explicit departure (REST /leave or LEAVE event) — immediate, no grace. */
  async leave(sessionId: string, playerId: string): Promise<void> {
    const player = await this.store.getPlayer(sessionId, playerId);
    if (!player) return;
    await this.timers.cancel(sessionId, 'grace', playerId);
    await this.store.removePlayer(sessionId, playerId);
    await GameSession.updateOne(
      { _id: sessionId, 'players.playerId': playerId },
      { $set: { 'players.$.leftAt': new Date() } }
    );
    await this.emitter.emitToSession(sessionId, 'PLAYER_LEFT', { playerId });
    await this.runtime.onPlayerLeave(sessionId, playerId);
    if (player.socketId) {
      await this.emitter.kickSocketById(player.socketId, 'LEFT', 'You left the session');
    }
    this.log.info({ sessionId, playerId }, 'player left');
  }

  async setReady(sessionId: string, playerId: string, ready: boolean): Promise<void> {
    const updated = await this.store.setPlayerReady(sessionId, playerId, ready);
    if (!updated) return;
    await this.emitter.emitToSession(sessionId, 'PLAYER_READY', { playerId, ready });
  }

  async listPlayers(sessionId: string): Promise<PlayerPublic[]> {
    if (!(await this.store.sessionExists(sessionId))) throw new AppError(404, 'SESSION_NOT_FOUND');
    const [players, scores] = await Promise.all([
      this.store.getPlayers(sessionId),
      this.store.getScores(sessionId)
    ]);
    return Object.entries(players).map(([id, p]) => ({
      playerId: id,
      nickname: p.nickname,
      avatar: p.avatar,
      presence: p.presence,
      ready: p.ready,
      score: scores[id] ?? 0
    }));
  }
}
