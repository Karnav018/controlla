import type { Server, Socket } from 'socket.io';
import type { Envelope, ServerEventType } from '../protocol';
import { WIRE_EVENT, PROTOCOL_VERSION } from '../protocol';
import type { Logger } from '../logger';
import type { LiveStore } from '../redis/liveStore';
import { roomSession, roomHost, roomPlayer } from './rooms';

/**
 * THE only outbound path (enforced by scripts/check-emitter-only.sh).
 * Every message carries a stamped envelope whose seq comes from
 * HINCRBY session:{id}:state.serverSeq — persisted, so the
 * "apply delta iff delta.seq > snapshot.seq" client contract survives
 * server restarts. A per-session promise chain serializes emissions so a
 * snapshot's seq can never race a delta's.
 */

export interface RawEmit {
  nextSeq(): Promise<number>;
  toSocket(socket: Socket, type: ServerEventType, payload: unknown, seq: number): void;
  toSession(type: ServerEventType, payload: unknown, seq: number): void;
  toHost(type: ServerEventType, payload: unknown, seq: number): void;
  toPlayer(playerId: string, type: ServerEventType, payload: unknown, seq: number): void;
}

export class RoomEmitter {
  private io: Server | null = null;
  private locks = new Map<string, Promise<unknown>>();

  constructor(
    private store: LiveStore,
    private log: Logger
  ) {}

  bind(io: Server): void {
    this.io = io;
  }

  withSessionLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(sessionId) ?? Promise.resolve();
    const run = prev.then(() => fn());
    this.locks.set(
      sessionId,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }

  private envelope(sessionId: string, type: ServerEventType, payload: unknown, seq: number): Envelope {
    return { v: PROTOCOL_VERSION, type, sessionId, senderId: 'server', seq, ts: Date.now(), payload };
  }

  /**
   * Run fn under the session lock with raw emit access — for the snapshot
   * service, which must pair its Redis reads with the seq it emits.
   */
  locked(sessionId: string, fn: (raw: RawEmit) => Promise<void>): Promise<void> {
    return this.withSessionLock(sessionId, () => {
      const raw: RawEmit = {
        nextSeq: () => this.store.nextServerSeq(sessionId),
        toSocket: (socket, type, payload, seq) => {
          socket.emit(WIRE_EVENT, this.envelope(sessionId, type, payload, seq));
        },
        toSession: (type, payload, seq) => {
          this.io?.to(roomSession(sessionId)).emit(WIRE_EVENT, this.envelope(sessionId, type, payload, seq));
        },
        toHost: (type, payload, seq) => {
          this.io?.to(roomHost(sessionId)).emit(WIRE_EVENT, this.envelope(sessionId, type, payload, seq));
        },
        toPlayer: (playerId, type, payload, seq) => {
          this.io
            ?.to(roomPlayer(sessionId, playerId))
            .emit(WIRE_EVENT, this.envelope(sessionId, type, payload, seq));
        }
      };
      return fn(raw);
    });
  }

  emitToSession(sessionId: string, type: ServerEventType, payload: unknown): Promise<void> {
    return this.locked(sessionId, async (raw) => raw.toSession(type, payload, await raw.nextSeq()));
  }

  emitToHost(sessionId: string, type: ServerEventType, payload: unknown): Promise<void> {
    return this.locked(sessionId, async (raw) => raw.toHost(type, payload, await raw.nextSeq()));
  }

  emitToPlayer(sessionId: string, playerId: string, type: ServerEventType, payload: unknown): Promise<void> {
    return this.locked(sessionId, async (raw) => raw.toPlayer(playerId, type, payload, await raw.nextSeq()));
  }

  async notifySocket(socket: Socket, code: string, message: string): Promise<void> {
    const sessionId = (socket.data as { sessionId?: string }).sessionId;
    if (!sessionId) return;
    await this.locked(sessionId, async (raw) =>
      raw.toSocket(socket, 'NOTIFICATION', { code, message }, await raw.nextSeq())
    );
  }

  async notifyAndDisconnect(socket: Socket, code: string, message: string): Promise<void> {
    try {
      await this.notifySocket(socket, code, message);
    } finally {
      socket.disconnect(true);
    }
  }

  async kickSocketById(socketId: string, code: string, message: string): Promise<void> {
    const socket = this.io?.sockets.sockets.get(socketId);
    if (!socket) return;
    await this.notifyAndDisconnect(socket, code, message);
  }

  disconnectRoom(sessionId: string): void {
    this.io?.in(roomSession(sessionId)).disconnectSockets(true);
  }
}
