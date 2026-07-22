import type { Socket } from 'socket.io';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { LiveStore } from '../redis/liveStore';
import type { PluginRuntimePort } from '../bus/types';
import type { RoomEmitter } from '../ws/emitter';
import type { SnapshotService } from './snapshotService';
import type { TimerService } from './timerService';
import type { SocketData } from '../ws/types';
import { roomSession, roomHost, roomPlayer } from '../ws/rooms';
import { GameSession } from '../db/models/gameSession';

/**
 * The most important flow in the codebase: connect classification,
 * disconnect + grace scheduling, duplicate-tab takeover, grace expiry.
 * All presence transitions go through atomic Lua (see redis/lua.ts).
 */
export class PresenceService {
  constructor(
    private cfg: Config,
    private store: LiveStore,
    private timers: TimerService,
    private emitter: RoomEmitter,
    private snapshot: SnapshotService,
    private runtime: PluginRuntimePort,
    private log: Logger
  ) {}

  async handleConnect(socket: Socket): Promise<void> {
    const { sessionId, role, playerId } = socket.data as SocketData;
    try {
      if (role === 'host') {
        await this.store.setHostConnection(sessionId, socket.id);
        await this.store.bindSocket(socket.id, sessionId, 'host', this.cfg.SESSION_TTL_MS);
        await socket.join([roomSession(sessionId), roomHost(sessionId)]);
        await this.snapshot.sendToSocket(socket);
        await this.store.touchSession(sessionId, this.cfg.SESSION_TTL_MS);
        return;
      }

      const result = await this.store.reconnectPlayer(sessionId, playerId, socket.id);
      if (result.status === 'left') {
        // Grace already expired — the seat is gone; the client must re-join.
        await this.emitter.notifyAndDisconnect(socket, 'NOT_IN_SESSION', 'Your seat expired — rejoin the session');
        return;
      }
      // The Lua script already ZREM'd the grace entry; clear the local trigger too.
      this.timers.clearLocal(sessionId, `grace:${playerId}`);

      if (result.status === 'rebound' && result.oldSocketId) {
        // Duplicate tab: newest wins, quietly — nothing was disconnected, so no events.
        await this.emitter.kickSocketById(result.oldSocketId, 'SUPERSEDED', 'Controller opened somewhere newer');
      }

      await this.store.bindSocket(socket.id, sessionId, playerId, this.cfg.SESSION_TTL_MS);
      await socket.join([roomSession(sessionId), roomPlayer(sessionId, playerId)]);

      if (result.status === 'first') {
        const p = await this.store.getPlayer(sessionId, playerId);
        if (p) {
          await this.emitter.emitToSession(sessionId, 'PLAYER_CONNECTED', {
            player: this.snapshot.toPublic(playerId, p, 0)
          });
        }
      } else if (result.status === 'resumed') {
        await this.emitter.emitToSession(sessionId, 'PLAYER_RECONNECTED', { playerId });
        await this.runtime.onPlayerReconnect(sessionId, playerId);
      }

      await this.snapshot.sendToSocket(socket);
      await this.store.touchSession(sessionId, this.cfg.SESSION_TTL_MS);
    } catch (err) {
      this.log.error({ err, sessionId, role, playerId }, 'handleConnect failed');
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket): Promise<void> {
    const data = socket.data as Partial<SocketData>;
    const { sessionId, role, playerId } = data;
    if (!sessionId || !role) return;
    try {
      await this.store.unbindSocket(socket.id);

      if (role === 'host') {
        // Only clear if this socket still owns the host seat (a newer host may have taken over).
        await this.store.clearHostConnectionIf(sessionId, socket.id);
        return;
      }

      const graceAt = Date.now() + this.cfg.GRACE_PERIOD_MS;
      const marked = await this.store.disconnectPlayer(sessionId, playerId!, socket.id, graceAt);
      if (!marked) return; // stale disconnect — a newer socket owns the seat
      // The ZADD happened atomically inside the Lua script; arm only the local trigger.
      this.timers.armLocal(sessionId, `grace:${playerId}`, graceAt);
      await this.emitter.emitToSession(sessionId, 'PLAYER_DISCONNECTED', { playerId });
    } catch (err) {
      this.log.error({ err, sessionId, role, playerId }, 'handleDisconnect failed');
    }
  }

  /** grace timer handler — the only path that turns a disconnect into a real departure. */
  async expireGrace(sessionId: string, playerId: string): Promise<void> {
    const player = await this.store.getPlayer(sessionId, playerId);
    if (!player || player.presence === 'connected') return; // defense in depth
    await this.store.removePlayer(sessionId, playerId);
    await GameSession.updateOne(
      { _id: sessionId, 'players.playerId': playerId },
      { $set: { 'players.$.leftAt': new Date() } }
    );
    await this.emitter.emitToSession(sessionId, 'PLAYER_LEFT', { playerId });
    await this.runtime.onPlayerLeave(sessionId, playerId);
    this.log.info({ sessionId, playerId }, 'grace expired — player left');
  }
}
