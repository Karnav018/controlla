import { z } from 'zod';
import { PROTOCOL_VERSION } from './envelope';

/** Client → server payloads, validated at the gateway. */

export const ControllerInputSchema = z.object({
  controlId: z.string().min(1).max(64),
  action: z.string().min(1).max(32), // e.g. 'press', 'release', 'submit', 'change', 'stroke'
  // 2000 chars fits a full quantized stroke chunk from the canvas component.
  value: z.union([z.string().max(2000), z.number(), z.boolean()]).optional()
});
export type ControllerInput = z.infer<typeof ControllerInputSchema>;

export const HostCommandSchema = z.object({
  command: z.enum(['START_SESSION', 'END_SESSION', 'SELECT_GAME', 'END_GAME']),
  gameId: z.string().max(64).optional(),
  /** Per-game options (e.g. round duration); validated by the plugin itself. */
  options: z.unknown().optional()
});
export type HostCommand = z.infer<typeof HostCommandSchema>;

const base = {
  v: z.literal(PROTOCOL_VERSION),
  sessionId: z.string().min(1),
  senderId: z.string().min(1),
  seq: z.number().int().positive(),
  ts: z.number()
};

/** The full, typed client envelope — unknown types fail validation and are dropped. */
export const ClientEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('PLAYER_READY'), payload: z.object({ ready: z.boolean() }) }),
  z.object({ ...base, type: z.literal('CONTROLLER_INPUT'), payload: ControllerInputSchema }),
  z.object({ ...base, type: z.literal('HOST_COMMAND'), payload: HostCommandSchema }),
  z.object({ ...base, type: z.literal('LEAVE'), payload: z.object({}).optional() }),
  z.object({ ...base, type: z.literal('PING'), payload: z.object({}).optional() })
]);
export type ClientEnvelope = z.infer<typeof ClientEnvelopeSchema>;

/** Server → client payload types (constructed server-side; typed, not validated). */

export interface NotificationPayload {
  code: string;
  message: string;
}

export interface PlayerRefPayload {
  playerId: string;
}

export interface PlayerReadyPayload {
  playerId: string;
  ready: boolean;
}
