import type { Socket } from 'socket.io';
import type { PlayerPublic, SessionStatePayload } from '../protocol';
import type { LiveStore, SessionSnapshotRaw, RedisPlayer } from '../redis/liveStore';
import type { RoomEmitter } from '../ws/emitter';
import type { SocketData } from '../ws/types';

/**
 * Assembles SESSION_STATE snapshots. The snapshot+deltas rule lives here and
 * in RoomEmitter: assembly happens under the session emit lock, and the
 * snapshot's seq is consumed atomically with its Redis reads (one MULTI), so
 * no delta reflecting pre-snapshot state can carry a higher seq.
 */
export class SnapshotService {
  constructor(
    private store: LiveStore,
    private emitter: RoomEmitter
  ) {}

  toPublic(playerId: string, p: RedisPlayer, score: number): PlayerPublic {
    return {
      playerId,
      nickname: p.nickname,
      avatar: p.avatar,
      presence: p.presence,
      ready: p.ready,
      score,
      joinedAt: p.joinedAt
    };
  }

  private buildPayload(
    sessionId: string,
    snap: SessionSnapshotRaw,
    view: { role: 'host' } | { role: 'player'; playerId: string }
  ): SessionStatePayload {
    const players = Object.entries(snap.players)
      .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))
      .map(([id, p]) => this.toPublic(id, p, snap.scores[id] ?? 0));
    const payload: SessionStatePayload = {
      sessionId,
      code: snap.state.code,
      status: snap.state.status,
      hostConnected: snap.state.hostConnected,
      players,
      game: snap.state.currentGameId
        ? { gameId: snap.state.currentGameId, instanceId: snap.state.currentInstanceId }
        : null,
      lastResults: snap.state.lastResults
    };
    if (view.role === 'host') payload.joinUrl = snap.state.joinUrl;
    else payload.you = { playerId: view.playerId };
    return payload;
  }

  /** Full resync for one socket: SESSION_STATE, then GAME_STATE / CONTROLLER_LAYOUT when playing. */
  async sendToSocket(socket: Socket): Promise<void> {
    const { sessionId, role, playerId } = socket.data as SocketData;
    await this.emitter.locked(sessionId, async (raw) => {
      const snap = await this.store.readSnapshot(sessionId);
      if (!snap) return;
      const view = role === 'host' ? ({ role: 'host' } as const) : ({ role: 'player', playerId } as const);
      raw.toSocket(socket, 'SESSION_STATE', this.buildPayload(sessionId, snap, view), snap.seq);
      if (snap.state.status === 'playing') {
        if (role === 'host' && snap.gamestate !== null) {
          raw.toSocket(socket, 'GAME_STATE', { state: snap.gamestate }, await raw.nextSeq());
        }
        if (role === 'player') {
          const layout = snap.players[playerId]?.layout;
          if (layout) raw.toSocket(socket, 'CONTROLLER_LAYOUT', { layout }, await raw.nextSeq());
        }
      }
    });
  }

  /** Re-snapshot the host room — how QR rotation delivers the fresh joinUrl (no invented event). */
  async sendToHostRoom(sessionId: string): Promise<void> {
    await this.emitter.locked(sessionId, async (raw) => {
      const snap = await this.store.readSnapshot(sessionId);
      if (!snap) return;
      raw.toHost('SESSION_STATE', this.buildPayload(sessionId, snap, { role: 'host' }), snap.seq);
    });
  }
}
