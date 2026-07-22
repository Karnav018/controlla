import type { Socket } from 'socket.io';
import type { Config } from '../config';
import type { Logger } from '../logger';
import { ClientEnvelopeSchema, WIRE_EVENT } from '../protocol';
import type { EventBus } from '../bus/eventBus';
import type { RoomEmitter } from '../ws/emitter';
import { AppError } from '../http/errors';
import type { SocketData } from './types';

interface InboundDeps {
  cfg: Config;
  bus: EventBus;
  emitter: RoomEmitter;
  log: Logger;
}

/**
 * Per-socket inbound pipeline: zod envelope validation → identity check →
 * client-seq guard (per connection) → token-bucket rate limit (drop, never
 * disconnect) → EventBus dispatch. PING is answered with an ack carrying the
 * server clock — RTT/2 is the latency metric; envelope ts is never trusted
 * for one-way latency (client clock skew).
 */
export function attachInbound(socket: Socket, deps: InboundDeps): void {
  const { cfg, bus, emitter, log } = deps;
  const bucket = { tokens: cfg.WS_INPUT_BURST, last: Date.now() };

  socket.on(WIRE_EVENT, (raw: unknown, ack?: (res: unknown) => void) => {
    void handle(raw, ack);
  });

  async function handle(raw: unknown, ack?: (res: unknown) => void): Promise<void> {
    const parsed = ClientEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      log.debug({ socketId: socket.id }, 'dropped invalid envelope');
      return;
    }
    const env = parsed.data;
    const data = socket.data as SocketData;

    const expectedSender = data.role === 'host' ? 'host' : data.playerId;
    if (env.sessionId !== data.sessionId || env.senderId !== expectedSender) {
      log.warn({ socketId: socket.id, type: env.type }, 'dropped envelope with mismatched identity');
      return;
    }

    // Strictly-increasing per connection; duplicates and stale replays drop silently.
    if (env.seq <= data.lastSeq) return;
    data.lastSeq = env.seq;

    if (env.type === 'PING') {
      if (typeof ack === 'function') ack({ ts: Date.now() });
      return;
    }

    const now = Date.now();
    bucket.tokens = Math.min(
      cfg.WS_INPUT_BURST,
      bucket.tokens + ((now - bucket.last) / 1000) * cfg.WS_INPUT_RATE_PER_SEC
    );
    bucket.last = now;
    if (bucket.tokens < 1) return; // flood: drop, don't disconnect
    bucket.tokens -= 1;

    try {
      await bus.dispatch(socket, env);
    } catch (err) {
      if (err instanceof AppError) {
        await emitter.notifySocket(socket, err.code, err.message);
      } else {
        log.error({ err, type: env.type }, 'dispatch failed');
      }
    }
  }
}
