import { randomUUID, randomInt } from 'node:crypto';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { CreateSessionResponse, SessionResultsResponse, SessionSummary } from '../protocol';
import { GameInstance } from '../db/models/gameInstance';
import type { LiveStore } from '../redis/liveStore';
import type { PluginRuntimePort } from '../bus/types';
import type { RoomEmitter } from '../ws/emitter';
import type { SnapshotService } from './snapshotService';
import type { TimerService } from './timerService';
import type { TokenService } from './tokenService';
import { GameSession } from '../db/models/gameSession';
import { AppError } from '../http/errors';
import { rankingsFromScores } from '../sdk/types';
// GAME_STARTED/GAME_FINISHED and Mongo status transitions during gameplay are
// owned by the Plugin Runtime; this service owns session-level lifecycle only.

/** Unambiguous alphabet — no I/O/0/1. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export class SessionService {
  constructor(
    private cfg: Config,
    private store: LiveStore,
    private tokens: TokenService,
    private timers: TimerService,
    private emitter: RoomEmitter,
    private snapshot: SnapshotService,
    private runtime: PluginRuntimePort,
    private log: Logger
  ) {}

  buildJoinUrl(code: string, joinToken: string): string {
    return `${this.cfg.PUBLIC_WEB_URL}/play/${code}?t=${joinToken}`;
  }

  private async issueJoinUrl(sessionId: string, code: string): Promise<string> {
    const { token } = await this.tokens.issueJoinToken(sessionId);
    const joinUrl = this.buildJoinUrl(code, token);
    await this.store.setJoinUrl(sessionId, joinUrl);
    return joinUrl;
  }

  async createSession(): Promise<CreateSessionResponse> {
    const sessionId = randomUUID();
    let code: string | null = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateCode();
      if (await this.store.reserveCode(candidate, sessionId)) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new AppError(503, 'CODE_SPACE_EXHAUSTED', 'Could not allocate a join code');

    const hostToken = this.tokens.issueHostToken(sessionId);
    await GameSession.create({
      _id: sessionId,
      code,
      hostTokenHash: this.tokens.hashToken(hostToken),
      status: 'lobby',
      active: true,
      players: []
    });
    await this.store.initSession(sessionId, code);
    const joinUrl = await this.issueJoinUrl(sessionId, code);
    await this.timers.schedule(sessionId, 'joinRotate', 'qr', Date.now() + this.cfg.JOIN_TOKEN_ROTATE_MS);
    await this.store.touchSession(sessionId, this.cfg.SESSION_TTL_MS);
    this.log.info({ sessionId, code }, 'session created');
    return { sessionId, code, joinUrl, hostToken };
  }

  /**
   * joinRotate timer handler. Rotation deliberately does NOT touch the
   * sliding TTL — an idle lobby must still expire; the handler just goes
   * quiet once the session's Redis state is gone.
   */
  async handleJoinRotate(sessionId: string): Promise<void> {
    const state = await this.store.getState(sessionId);
    if (!state || state.status === 'ended') return;
    await this.issueJoinUrl(sessionId, state.code);
    await this.snapshot.sendToHostRoom(sessionId);
    await this.timers.schedule(sessionId, 'joinRotate', 'qr', Date.now() + this.cfg.JOIN_TOKEN_ROTATE_MS);
  }

  async getSummary(sessionId: string, isHost: boolean): Promise<SessionSummary> {
    const state = await this.store.getState(sessionId);
    if (!state) throw new AppError(404, 'SESSION_NOT_FOUND');
    const players = await this.store.getPlayers(sessionId);
    const summary: SessionSummary = {
      sessionId,
      code: state.code,
      status: state.status,
      playerCount: Object.keys(players).length,
      game: state.currentGameId
        ? { gameId: state.currentGameId, instanceId: state.currentInstanceId }
        : null
    };
    if (isHost) summary.joinUrl = state.joinUrl;
    return summary;
  }

  async resolveCode(code: string): Promise<string | null> {
    return this.store.resolveCode(code);
  }

  /**
   * Durable game history (works for live AND ended sessions — Mongo is the
   * record), newest first via the {sessionId, startedAt} index. The live
   * leaderboard rides along while the session's Redis state exists.
   */
  async getResults(sessionId: string): Promise<SessionResultsResponse> {
    const sessionExists = await GameSession.exists({ _id: sessionId });
    if (!sessionExists) throw new AppError(404, 'SESSION_NOT_FOUND');

    const instances = await GameInstance.find({ sessionId }).sort({ startedAt: -1 }).lean();
    const response: SessionResultsResponse = {
      sessionId,
      games: instances.map((i) => ({
        instanceId: i._id,
        gameId: i.pluginId,
        pluginVersion: i.pluginVersion,
        startedAt: i.startedAt.toISOString(),
        finishedAt: i.finishedAt ? i.finishedAt.toISOString() : null,
        results: i.results ?? null
      }))
    };

    if (await this.store.sessionExists(sessionId)) {
      const [players, scores] = await Promise.all([
        this.store.getPlayers(sessionId),
        this.store.getScores(sessionId)
      ]);
      response.leaderboard = Object.entries(players)
        .map(([playerId, p]) => ({ playerId, nickname: p.nickname, score: scores[playerId] ?? 0 }))
        .sort((a, b) => b.score - a.score);
    }
    return response;
  }

  /** Start a game from the lobby. The platform is game-agnostic — gameId is required. */
  async startSession(sessionId: string, gameId: string, options?: unknown): Promise<void> {
    const state = await this.store.getState(sessionId);
    if (!state) throw new AppError(404, 'SESSION_NOT_FOUND');
    if (state.status !== 'lobby') throw new AppError(409, 'ALREADY_STARTED');
    await this.runtime.startGame(sessionId, gameId, options);
  }

  /** Switch games anytime — a running game is aborted by the runtime first. */
  async selectGame(sessionId: string, gameId: string, options?: unknown): Promise<void> {
    if (!(await this.store.sessionExists(sessionId))) throw new AppError(404, 'SESSION_NOT_FOUND');
    await this.runtime.startGame(sessionId, gameId, options);
  }

  /**
   * Host force-finishes the running game ("End game · see results"). The
   * standings come from the session scoreboard, so the results screen is
   * meaningful even when the plugin didn't get to declare a winner.
   */
  async endCurrentGame(sessionId: string): Promise<void> {
    const state = await this.store.getState(sessionId);
    if (!state) throw new AppError(404, 'SESSION_NOT_FOUND');
    if (state.status !== 'playing') throw new AppError(409, 'NO_GAME_RUNNING');
    const scores = await this.store.getScores(sessionId);
    await this.runtime.finishGame(sessionId, {
      rankings: rankingsFromScores(scores),
      detail: 'host-ended'
    });
  }

  async endSession(sessionId: string): Promise<void> {
    const state = await this.store.getState(sessionId);
    if (!state) {
      // Redis already gone (expired) — make sure the durable record agrees.
      await GameSession.updateOne(
        { _id: sessionId, status: { $ne: 'ended' } },
        { status: 'ended', active: false, endedAt: new Date() }
      );
      return;
    }
    // Emit BEFORE destroying keys: the envelope seq lives in the state hash.
    await this.emitter.emitToSession(sessionId, 'SESSION_ENDED', {});
    await this.runtime.onSessionEnd(sessionId);
    await GameSession.updateOne(
      { _id: sessionId },
      { status: 'ended', active: false, endedAt: new Date() }
    );
    this.timers.cancelAllLocal(sessionId);
    await this.store.destroySession(sessionId, state.code);
    this.emitter.disconnectRoom(sessionId);
    this.log.info({ sessionId }, 'session ended');
  }
}
