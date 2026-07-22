import { z } from 'zod';

/** REST bodies (zod-validated) and response shapes, shared with the web app later. */

export const JoinRequestSchema = z.object({
  nickname: z.string().trim().min(1).max(24),
  avatar: z.string().max(64).optional(),
  joinToken: z.string().max(2048).optional()
});
export type JoinRequest = z.infer<typeof JoinRequestSchema>;

export interface CreateSessionResponse {
  sessionId: string;
  code: string;
  joinUrl: string;
  hostToken: string;
}

export interface JoinResponse {
  playerId: string;
  playerToken: string;
}

export const StartRequestSchema = z.object({
  // The platform is game-agnostic: there is no default game, so starting
  // always names one.
  gameId: z.string().min(1).max(64),
  options: z.unknown().optional()
});
export type StartRequest = z.infer<typeof StartRequestSchema>;

export interface SessionSummary {
  sessionId: string;
  code: string;
  status: string;
  playerCount: number;
  game: { gameId: string; instanceId: string } | null;
  /** Host viewer only. */
  joinUrl?: string;
}

/** GET /games entry — what the host can select. Featured games sort first. */
export interface GameInfo {
  gameId: string;
  name: string;
  version: string;
  description?: string;
  minPlayers: number;
  maxPlayers: number;
  featured?: boolean;
  /**
   * The game's own main-screen UI, embedded by the host app while the game
   * runs (state relayed via postMessage). The platform never draws game
   * visuals itself — without a URL the host shows a neutral stage.
   */
  hostViewUrl?: string;
  /**
   * The game's own phone-console UI, embedded by /play while the game runs.
   * The platform bridges identity, layout hints, and inputs underneath;
   * without a URL the phone renders the platform's generic components.
   */
  controllerViewUrl?: string;
}

// ── admin (/admin — operator login, no in-app entry point) ──────────────

export const AdminLoginSchema = z.object({
  email: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(200)
});
export type AdminLoginRequest = z.infer<typeof AdminLoginSchema>;

export interface AdminLoginResponse {
  adminToken: string;
  email: string;
}

export const AdminGamePatchSchema = z
  .object({ enabled: z.boolean().optional(), featured: z.boolean().optional() })
  .refine((v) => v.enabled !== undefined || v.featured !== undefined, { message: 'nothing to change' });

/** Live install: a provider's plain-JS module written into GAMES_DIR. */
export const AdminInstallSchema = z.object({
  dirName: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'lowercase-kebab directory name'),
  code: z.string().min(20).max(1_000_000)
});
export type AdminInstallRequest = z.infer<typeof AdminInstallSchema>;

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

/** Read-only runtime configuration (env-managed) shown on the Settings page. */
export interface AdminConfigEntry {
  key: string;
  value: string;
}

export interface AdminSession {
  sessionId: string;
  code: string;
  status: string;
  /** False when the durable record outlived its Redis state (stale/abandoned). */
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

/** GET /sessions/:id/results — durable game history, newest first. */
export interface SessionResultsResponse {
  sessionId: string;
  games: Array<{
    instanceId: string;
    gameId: string;
    pluginVersion: string;
    startedAt: string;
    finishedAt: string | null; // null = still running
    results: unknown | null;
  }>;
  /** Session leaderboard (cumulative scores) — present while the session is live. */
  leaderboard?: Array<{ playerId: string; nickname: string; score: number }>;
}
