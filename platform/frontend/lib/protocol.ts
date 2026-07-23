/**
 * Mirror of the backend protocol contract (backend/src/protocol) — just the
 * pieces the host screen consumes. Extracting the backend protocol into a
 * shared package is the planned follow-up; until then this file is kept in
 * lockstep by hand.
 */

export const WIRE_EVENT = 'msg';
export const PROTOCOL_VERSION = 1 as const;

export interface Envelope<T = unknown> {
  v: typeof PROTOCOL_VERSION;
  type: string;
  sessionId: string;
  senderId: string;
  seq: number;
  ts: number;
  payload: T;
}

export type SessionStatus = 'lobby' | 'playing' | 'ended';
export type PresenceState = 'connected' | 'disconnected';

export interface PlayerPublic {
  playerId: string;
  nickname: string;
  avatar?: string;
  presence: PresenceState;
  ready: boolean;
  score: number;
  joinedAt?: number;
}

export interface GameRanking {
  playerId: string;
  score: number;
  rank: number;
}

export interface GameResults {
  rankings: GameRanking[];
  aborted?: boolean;
  detail?: unknown;
}

export interface LastGameResults {
  gameId: string;
  instanceId: string;
  finishedAt: number;
  results: GameResults;
}

export interface SessionStatePayload {
  sessionId: string;
  code: string;
  status: SessionStatus;
  hostConnected: boolean;
  players: PlayerPublic[];
  game: { gameId: string; instanceId: string } | null;
  lastResults: LastGameResults | null;
  joinUrl?: string;
  you?: { playerId: string };
}

export type LayoutComponent =
  | { kind: 'buttons'; id: string; buttons: Array<{ id: string; label: string }> }
  | { kind: 'dpad'; id: string }
  | { kind: 'text-input'; id: string; placeholder?: string; maxLength?: number }
  | { kind: 'choice-list'; id: string; choices: Array<{ id: string; label: string }> }
  | { kind: 'label'; id: string; text: string }
  | { kind: 'slider'; id: string; min: number; max: number; step?: number }
  | { kind: 'canvas'; id: string };

/** Shared palette for the canvas component — index-addressed in stroke data. */
export const CANVAS_COLORS = ['#111318', '#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#9333ea', '#ffffff'];

export interface ControllerLayout {
  layoutVersion: 1;
  components: LayoutComponent[];
}

export interface GameInfo {
  gameId: string;
  name: string;
  version: string;
  description?: string;
  minPlayers: number;
  maxPlayers: number;
  featured?: boolean;
  /** The game's own main-screen UI — iframed by the host while running. */
  hostViewUrl?: string;
  /** The game's own phone-console UI — iframed by /play while running. */
  controllerViewUrl?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  code: string;
  joinUrl: string;
  hostToken: string;
}

export interface AdminLoginResponse {
  adminToken: string;
  email: string;
}

export interface AdminGame extends GameInfo {
  source: string;
  enabled: boolean;
  featured: boolean;
  installedAt: string | null;
  playsFinished: number;
  tickRate: number;
}

export interface AdminActivityItem {
  kind: 'game-started' | 'game-finished' | 'game-aborted' | 'game-installed';
  text: string;
  at: string;
}

export interface AdminConfigEntry {
  key: string;
  value: string;
}

export interface AdminSession {
  sessionId: string;
  code: string;
  status: string;
  live: boolean;
  playerCount: number;
  connectedCount: number;
  currentGameId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminStats {
  activeSessions: number;
  totalSessions: number;
  gamesPlayed: number;
  playersInRooms: number;
  byGame: Array<{ gameId: string; plays: number }>;
}

export interface SessionResultsResponse {
  sessionId: string;
  games: Array<{
    instanceId: string;
    gameId: string;
    pluginVersion: string;
    startedAt: string;
    finishedAt: string | null;
    results: GameResults | null;
  }>;
  leaderboard?: Array<{ playerId: string; nickname: string; score: number }>;
}
