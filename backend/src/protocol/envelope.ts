import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

/**
 * Every WebSocket message, both directions, rides this envelope.
 * - seq: per-sender monotonic counter (client: per socket connection;
 *        server: per session, persisted in Redis so it survives restarts).
 * - ts:  sender clock in ms — feeds latency metrics, never trusted for auth.
 */
export interface Envelope<T = unknown> {
  v: typeof PROTOCOL_VERSION;
  type: string;
  sessionId: string;
  senderId: string; // playerId | 'host' | 'server'
  seq: number;
  ts: number;
  payload: T;
}

export const EnvelopeSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.string().min(1),
  sessionId: z.string().min(1),
  senderId: z.string().min(1),
  seq: z.number().int().nonnegative(),
  ts: z.number(),
  payload: z.unknown()
});
