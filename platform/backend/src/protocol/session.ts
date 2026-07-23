import type { ControllerLayout } from './layout';

export type SessionStatus = 'lobby' | 'playing' | 'ended';
export type PresenceState = 'connected' | 'disconnected';

/** What any client is allowed to know about a player. */
export interface PlayerPublic {
  playerId: string;
  nickname: string;
  avatar?: string;
  presence: PresenceState;
  ready: boolean;
  score: number;
  joinedAt?: number;
}

/**
 * The SESSION_STATE snapshot payload. The universal contract: any client can
 * rebuild its entire view from one of these; deltas apply only when
 * delta.seq > snapshot.seq.
 */
/** What finishGame leaves behind for the results screen. */
export interface LastGameResults {
  gameId: string;
  instanceId: string;
  finishedAt: number;
  results: unknown; // GameResults shape — rankings + aborted/detail, owned by the plugin
}

export interface SessionStatePayload {
  sessionId: string;
  code: string;
  status: SessionStatus;
  hostConnected: boolean;
  players: PlayerPublic[];
  /** The running game instance, when status is 'playing'. */
  game: { gameId: string; instanceId: string } | null;
  /**
   * Results of the most recent game, shown in the lobby between games.
   * Null while a game is running or before the first game — a host that
   * refreshes on the results screen rebuilds it from this snapshot field.
   */
  lastResults: LastGameResults | null;
  /** Host view only — carries the current rotating QR join URL. */
  joinUrl?: string;
  /** Player view only — who you are. */
  you?: { playerId: string };
}

export interface ControllerLayoutPayload {
  /** null = no game layout; the controller shows the platform lobby UI. */
  layout: ControllerLayout | null;
}

export interface GameStatePayload {
  state: unknown;
}
