import type { ControllerInput, ControllerLayout } from '../protocol';
import type { Logger } from '../logger';

/**
 * The game plugin SDK. Everything a plugin can do flows through GameContext —
 * no sockets, no Redis, no setTimeout, no Math.random. That keeps plugins
 * sandbox-shaped today so the worker_threads isolation of Phase 4 changes
 * nothing for plugin authors.
 */

export interface GameMetadata {
  id: string; // 'tap-race'
  name: string;
  version: string;
  description?: string;
  minPlayers: number;
  maxPlayers: number;
  /** Hz for update(); 0 = purely event-driven. */
  tickRate: number;
  /**
   * URL of the game's own main-screen UI. The platform never draws game
   * visuals — the host app iframes this and relays host state to it via
   * postMessage ({ type: 'controlla:state', gameId, state, players }).
   */
  hostViewUrl?: string;
  /**
   * URL of the game's own phone-console UI. While the game runs, the phone
   * embeds this instead of platform-rendered layout components; the platform
   * still owns the socket, identity, and input transport underneath.
   * Bridge: platform → frame { type: 'controlla:context' | 'controlla:layout' },
   * frame → platform { type: 'controlla:input', controlId, action, value }.
   */
  controllerViewUrl?: string;
}

export interface GamePlayer {
  playerId: string;
  nickname: string;
  avatar?: string;
}

export interface GameRanking {
  playerId: string;
  score: number;
  rank: number;
}

export interface GameResults {
  rankings: GameRanking[];
  /** True when the platform killed the game (plugin crash, host switch, restart). */
  aborted?: boolean;
  detail?: unknown;
}

export interface GameContext {
  readonly sessionId: string;
  readonly instanceId: string;
  /** Host-selected per-game options (validated by the plugin itself). */
  readonly options: unknown;

  /** Current roster (connected + within grace); maintained by the platform. */
  players(): GamePlayer[];

  // ── output: the only ways a plugin affects the world ──────────────────
  setControllerLayout(playerId: string, layout: ControllerLayout): Promise<void>;
  setAllControllerLayouts(layout: ControllerLayout): Promise<void>;
  /** Diffless broadcast to the host view; also persisted for reconnect replay. */
  setHostState(state: unknown): Promise<void>;
  /** Ends the game: results screen, back to lobby, players stay connected. */
  endGame(results: GameResults): Promise<void>;

  // ── shared services ───────────────────────────────────────────────────
  timers: {
    /** Instance-scoped; auto-cancelled on game end. */
    start(id: string, ms: number, onExpire: () => void): void;
    cancel(id: string): void;
  };
  /** Session-scoped scores — accumulate across games (session leaderboard). */
  scores: {
    add(playerId: string, delta: number): Promise<void>;
    get(playerId: string): Promise<number>;
    all(): Promise<Record<string, number>>;
  };
  /** Seeded per instance → deterministic replays and tests. */
  random: {
    seed: string;
    int(min: number, max: number): number;
    pick<T>(arr: readonly T[]): T;
    shuffle<T>(arr: readonly T[]): T[];
  };
  /** Instance-scoped scratch space (in-memory; games are abortable, not resumable). */
  storage: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
  };
  notify(target: string | 'host' | 'all', message: string): Promise<void>;
  logger: Logger;
}

export interface GamePlugin {
  metadata(): GameMetadata;
  init(ctx: GameContext, players: readonly GamePlayer[]): void | Promise<void>;
  /** Mid-game joiner — plugin decides whether to seat or bench them. */
  onPlayerJoin(player: GamePlayer): void | Promise<void>;
  /** Real departures only (explicit leave / grace expiry) — never socket drops. */
  onPlayerLeave(player: GamePlayer): void | Promise<void>;
  /** Returned within the grace window; layout replay already handled by the platform. */
  onPlayerReconnect(player: GamePlayer): void | Promise<void>;
  onInput(playerId: string, input: ControllerInput): void | Promise<void>;
  /** Fixed tick at metadata().tickRate Hz; omit for event-driven games. */
  update?(dtMs: number): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

/** Convenience: turn a score map into dense-ranked results. */
export function rankingsFromScores(scores: Record<string, number>): GameRanking[] {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const rankings: GameRanking[] = [];
  let rank = 0;
  let prevScore = Number.POSITIVE_INFINITY;
  for (const [playerId, score] of sorted) {
    if (score < prevScore) {
      rank = rankings.length + 1;
      prevScore = score;
    }
    rankings.push({ playerId, score, rank });
  }
  return rankings;
}
