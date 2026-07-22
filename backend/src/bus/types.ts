import type { ControllerInput, GameInfo } from '../protocol';
import type { GameResults } from '../sdk/types';

/**
 * The seam between the platform and game execution. PluginRuntime implements
 * this in-process today; the Phase 4 worker/remote isolation implements the
 * same port — services and the EventBus never know the difference.
 * Contract notes:
 * - onPlayerLeave fires only on real departures (explicit LEAVE or grace
 *   expiry) — never on mere socket drops.
 * - onPlayerReconnect fires when a player returns within the grace window.
 */
export interface PluginRuntimePort {
  listGames(): Promise<GameInfo[]>;
  /** Admin view: every discovered plugin, including operator-disabled ones. */
  listAllGames(): Array<GameInfo & { tickRate: number }>;
  /** Starts gameId in the session; if a game is running it is aborted first. */
  startGame(sessionId: string, gameId: string, options?: unknown): Promise<void>;
  finishGame(sessionId: string, results: GameResults): Promise<void>;
  onSessionEnd(sessionId: string): Promise<void>;
  onPlayerJoin(sessionId: string, playerId: string): Promise<void>;
  onPlayerLeave(sessionId: string, playerId: string): Promise<void>;
  onPlayerReconnect(sessionId: string, playerId: string): Promise<void>;
  onInput(sessionId: string, playerId: string, input: ControllerInput): Promise<void>;
  /** Boot: abort any session left in 'playing' by a dead process. */
  recoverAll(): Promise<void>;
}
