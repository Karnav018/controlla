import { randomUUID } from 'node:crypto';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { ControllerInput, ControllerLayout, GameInfo } from '../protocol';
import { ControllerLayoutSchema } from '../protocol';
import type { LiveStore, RedisPlayer } from '../redis/liveStore';
import { STATE_KEY_RE } from '../redis/keys';
import type { RoomEmitter } from '../ws/emitter';
import type {
  GameContext,
  GamePlayer,
  GamePlugin,
  GameResults
} from '../sdk/types';
import type { PluginRuntimePort } from '../bus/types';
import { createRandom } from './random';
import { GameInstance } from '../db/models/gameInstance';
import { GameSession } from '../db/models/gameSession';
import { InstalledPlugin } from '../db/models/installedPlugin';
import { AppError } from '../http/errors';

export type PluginFactory = () => GamePlugin;

interface RunningInstance {
  instanceId: string;
  gameId: string;
  plugin: GamePlugin;
  ctx: GameContext;
  roster: Map<string, GamePlayer>;
  timers: Map<string, NodeJS.Timeout>;
  tick: NodeJS.Timeout | null;
  finished: boolean;
}

/**
 * The Plugin Runtime: loads plugins from the registry, drives their
 * lifecycle, and brokers everything they do via GameContext.
 *
 * Containment: every plugin call is wrapped — a throwing plugin aborts its
 * OWN game (GAME_FINISHED {aborted}); it can never take the session down.
 *
 * Restart policy: game state is in-process by design (Phase 4 moves it to
 * workers). A server restart therefore ABORTS in-flight games honestly —
 * recoverAll() flips any 'playing' session back to lobby and finalizes the
 * instance as aborted. Sessions, players, seats, and scores all survive; only
 * the current round is lost.
 */
export class PluginRuntime implements PluginRuntimePort {
  private instances = new Map<string, RunningInstance>();

  constructor(
    private cfg: Config,
    private store: LiveStore,
    private emitter: RoomEmitter,
    private registry: Map<string, PluginFactory>,
    private log: Logger
  ) {}

  private async disabledIds(): Promise<Set<string>> {
    const docs = await InstalledPlugin.find({ enabled: false }).select('pluginId').lean();
    return new Set(docs.map((d) => d.pluginId));
  }

  listAllGames(): Array<GameInfo & { tickRate: number }> {
    return [...this.registry.values()]
      .map((factory) => factory().metadata())
      .map((meta) => ({
        gameId: meta.id,
        name: meta.name,
        version: meta.version,
        description: meta.description,
        minPlayers: meta.minPlayers,
        maxPlayers: meta.maxPlayers,
        tickRate: meta.tickRate,
        hostViewUrl: meta.hostViewUrl
      }));
  }

  /** Public catalogue: enabled games only, featured first. */
  async listGames(): Promise<GameInfo[]> {
    const docs = await InstalledPlugin.find({}).select('pluginId enabled featured').lean();
    const flags = new Map(docs.map((d) => [d.pluginId, d]));
    return this.listAllGames()
      .filter((g) => flags.get(g.gameId)?.enabled !== false)
      .map(({ tickRate: _tickRate, ...g }) => ({ ...g, featured: flags.get(g.gameId)?.featured === true }))
      .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name));
  }

  isRunning(sessionId: string): boolean {
    return this.instances.has(sessionId);
  }

  /** Selecting a new game while one is running aborts the old one first. */
  async startGame(sessionId: string, gameId: string, options?: unknown): Promise<void> {
    const factory = this.registry.get(gameId);
    if (!factory) throw new AppError(404, 'GAME_NOT_FOUND', `Unknown game: ${gameId}`);
    if ((await this.disabledIds()).has(gameId)) {
      throw new AppError(403, 'GAME_DISABLED', `${gameId} is disabled by the operator`);
    }

    const existing = this.instances.get(sessionId);
    if (existing) await this.finishGame(sessionId, { rankings: [], aborted: true, detail: 'switched' });

    const plugin = factory();
    const meta = plugin.metadata();
    const playersRaw = await this.store.getPlayers(sessionId);
    const roster = new Map<string, GamePlayer>(
      Object.entries(playersRaw).map(([playerId, p]) => [playerId, this.toGamePlayer(playerId, p)])
    );
    if (roster.size < meta.minPlayers) {
      throw new AppError(409, 'NOT_ENOUGH_PLAYERS', `${meta.name} needs at least ${meta.minPlayers} player(s)`);
    }
    if (roster.size > meta.maxPlayers) {
      throw new AppError(409, 'TOO_MANY_PLAYERS', `${meta.name} allows at most ${meta.maxPlayers} players`);
    }

    const instanceId = randomUUID();
    const randomSeed = randomUUID();
    const instance: RunningInstance = {
      instanceId,
      gameId,
      plugin,
      ctx: null as unknown as GameContext, // set right below
      roster,
      timers: new Map(),
      tick: null,
      finished: false
    };
    instance.ctx = this.buildContext(sessionId, instance, randomSeed, options);
    this.instances.set(sessionId, instance);

    try {
      await GameInstance.create({
        _id: instanceId,
        sessionId,
        pluginId: meta.id,
        pluginVersion: meta.version,
        randomSeed,
        startedAt: new Date()
      });
      await this.store.setCurrentGame(sessionId, gameId, instanceId);
      await GameSession.updateOne({ _id: sessionId }, { status: 'playing' });

      await this.emitter.emitToSession(sessionId, 'GAME_SELECTED', { gameId });
      await this.emitter.emitToSession(sessionId, 'GAME_LOADED', { gameId });
      await plugin.init(instance.ctx, [...roster.values()]);
      await this.emitter.emitToSession(sessionId, 'GAME_STARTED', { gameId, instanceId });

      if (meta.tickRate > 0) {
        const intervalMs = Math.max(16, Math.round(1000 / meta.tickRate));
        let last = Date.now();
        instance.tick = setInterval(() => {
          const now = Date.now();
          const dt = now - last;
          last = now;
          void this.guard(sessionId, instance, 'update', async () => plugin.update?.(dt));
        }, intervalMs);
        instance.tick.unref?.();
      }
      await this.store.touchSession(sessionId, this.cfg.SESSION_TTL_MS);
      this.log.info({ sessionId, gameId, instanceId }, 'game started');
    } catch (err) {
      // init failed — clean up the half-started instance, surface the error.
      await this.teardown(sessionId, instance);
      await this.store.clearCurrentGame(sessionId);
      await GameInstance.updateOne(
        { _id: instanceId },
        { finishedAt: new Date(), results: { rankings: [], aborted: true, detail: 'init-failed' } }
      );
      this.log.error({ err, sessionId, gameId }, 'game init failed');
      throw err instanceof AppError ? err : new AppError(500, 'PLUGIN_ERROR', 'The game failed to start');
    }
  }

  /** Normal end (plugin's endGame) and aborts both land here. */
  async finishGame(sessionId: string, results: GameResults): Promise<void> {
    const instance = this.instances.get(sessionId);
    if (!instance || instance.finished) return;
    instance.finished = true;

    await this.teardown(sessionId, instance);
    await this.store.clearCurrentGame(sessionId);
    const finishedAt = Date.now();
    await this.store.setLastResults(sessionId, {
      gameId: instance.gameId,
      instanceId: instance.instanceId,
      finishedAt,
      results
    });
    await GameInstance.updateOne(
      { _id: instance.instanceId },
      { finishedAt: new Date(finishedAt), results }
    );
    await GameSession.updateOne({ _id: sessionId }, { status: 'lobby' });
    await this.emitter.emitToSession(sessionId, 'GAME_FINISHED', {
      gameId: instance.gameId,
      instanceId: instance.instanceId,
      finishedAt,
      results
    });
    // Reset every controller to the platform lobby UI.
    await this.emitter.emitToSession(sessionId, 'CONTROLLER_LAYOUT', { layout: null });
    this.log.info({ sessionId, gameId: instance.gameId, aborted: results.aborted === true }, 'game finished');
  }

  /** Session is ending — kill the instance quietly (no GAME_FINISHED into a dying room). */
  async onSessionEnd(sessionId: string): Promise<void> {
    const instance = this.instances.get(sessionId);
    if (!instance) return;
    instance.finished = true;
    await this.teardown(sessionId, instance);
    await GameInstance.updateOne(
      { _id: instance.instanceId },
      { finishedAt: new Date(), results: { rankings: [], aborted: true, detail: 'session-ended' } }
    );
  }

  async onPlayerJoin(sessionId: string, playerId: string): Promise<void> {
    const instance = this.instances.get(sessionId);
    if (!instance) return;
    const p = await this.store.getPlayer(sessionId, playerId);
    if (!p) return;
    const player = this.toGamePlayer(playerId, p);
    instance.roster.set(playerId, player);
    await this.guard(sessionId, instance, 'onPlayerJoin', async () => instance.plugin.onPlayerJoin(player));
  }

  async onPlayerLeave(sessionId: string, playerId: string): Promise<void> {
    const instance = this.instances.get(sessionId);
    if (!instance) return;
    const player = instance.roster.get(playerId);
    instance.roster.delete(playerId);
    if (player) {
      await this.guard(sessionId, instance, 'onPlayerLeave', async () => instance.plugin.onPlayerLeave(player));
    }
  }

  async onPlayerReconnect(sessionId: string, playerId: string): Promise<void> {
    const instance = this.instances.get(sessionId);
    if (!instance) return;
    const player = instance.roster.get(playerId);
    if (player) {
      await this.guard(sessionId, instance, 'onPlayerReconnect', async () =>
        instance.plugin.onPlayerReconnect(player)
      );
    }
  }

  async onInput(sessionId: string, playerId: string, input: ControllerInput): Promise<void> {
    const instance = this.instances.get(sessionId);
    if (!instance || !instance.roster.has(playerId)) return;
    await this.guard(sessionId, instance, 'onInput', async () => instance.plugin.onInput(playerId, input));
  }

  /** Boot recovery: any session stuck in 'playing' had its in-process game die with the old server. */
  async recoverAll(): Promise<void> {
    for (const key of await this.store.scanStateKeys()) {
      const m = STATE_KEY_RE.exec(key);
      if (!m || !m[1]) continue;
      const sessionId = m[1];
      const state = await this.store.getState(sessionId);
      if (!state || state.status !== 'playing') continue;
      const instanceId = state.currentInstanceId;
      const abortedResults = { rankings: [], aborted: true, detail: 'server-restart' };
      await this.store.clearCurrentGame(sessionId);
      await GameSession.updateOne({ _id: sessionId }, { status: 'lobby' });
      if (instanceId) {
        // Reconnecting clients see an honest "round aborted" results screen.
        await this.store.setLastResults(sessionId, {
          gameId: state.currentGameId,
          instanceId,
          finishedAt: Date.now(),
          results: abortedResults
        });
        await GameInstance.updateOne(
          { _id: instanceId, finishedAt: { $exists: false } },
          { finishedAt: new Date(), results: abortedResults }
        );
      }
      this.log.warn({ sessionId, instanceId }, 'aborted in-flight game after restart');
    }
  }

  // ── internals ─────────────────────────────────────────────────────────

  private toGamePlayer(playerId: string, p: RedisPlayer): GamePlayer {
    return { playerId, nickname: p.nickname, avatar: p.avatar };
  }

  /** Every plugin call goes through here: a throw aborts the game, never the session. */
  private async guard(
    sessionId: string,
    instance: RunningInstance,
    hook: string,
    fn: () => Promise<unknown>
  ): Promise<void> {
    if (instance.finished) return;
    try {
      await fn();
    } catch (err) {
      this.log.error({ err, sessionId, gameId: instance.gameId, hook }, 'plugin crashed — aborting game');
      await this.finishGame(sessionId, { rankings: [], aborted: true, detail: `plugin-error:${hook}` });
    }
  }

  private async teardown(sessionId: string, instance: RunningInstance): Promise<void> {
    if (instance.tick) clearInterval(instance.tick);
    instance.tick = null;
    for (const t of instance.timers.values()) clearTimeout(t);
    instance.timers.clear();
    try {
      await instance.plugin.destroy?.();
    } catch (err) {
      this.log.warn({ err, sessionId, gameId: instance.gameId }, 'plugin destroy threw');
    }
    this.instances.delete(sessionId);
  }

  private buildContext(
    sessionId: string,
    instance: RunningInstance,
    randomSeed: string,
    options: unknown
  ): GameContext {
    const { store, emitter } = this;
    const guard = this.guard.bind(this);
    const finishGame = this.finishGame.bind(this);
    const random = createRandom(randomSeed);
    const scratch = new Map<string, unknown>();

    const setControllerLayout = async (playerId: string, layout: ControllerLayout): Promise<void> => {
      const parsed = ControllerLayoutSchema.parse(layout); // plugins don't get to break the wire contract
      await store.setPlayerLayout(sessionId, playerId, parsed);
      await emitter.emitToPlayer(sessionId, playerId, 'CONTROLLER_LAYOUT', { layout: parsed });
    };

    return {
      sessionId,
      instanceId: instance.instanceId,
      options,
      players: () => [...instance.roster.values()],

      setControllerLayout,

      async setAllControllerLayouts(layout: ControllerLayout): Promise<void> {
        for (const playerId of instance.roster.keys()) {
          await setControllerLayout(playerId, layout);
        }
      },

      async setHostState(state: unknown): Promise<void> {
        await store.setGamestate(sessionId, state);
        await emitter.emitToHost(sessionId, 'GAME_STATE', { state });
      },

      async endGame(results: GameResults): Promise<void> {
        await finishGame(sessionId, results);
      },

      timers: {
        start(id: string, ms: number, onExpire: () => void): void {
          const existing = instance.timers.get(id);
          if (existing) clearTimeout(existing);
          const t = setTimeout(() => {
            instance.timers.delete(id);
            void guard(sessionId, instance, `timer:${id}`, async () => onExpire());
          }, ms);
          t.unref?.();
          instance.timers.set(id, t);
        },
        cancel(id: string): void {
          const t = instance.timers.get(id);
          if (t) {
            clearTimeout(t);
            instance.timers.delete(id);
          }
        }
      },

      scores: {
        add: async (playerId, delta) => {
          await store.addScore(sessionId, playerId, delta);
        },
        get: (playerId) => store.getScore(sessionId, playerId),
        all: () => store.getScores(sessionId)
      },

      random,

      storage: {
        get: <T>(key: string) => scratch.get(key) as T | undefined,
        set: (key, value) => {
          scratch.set(key, value);
        }
      },

      async notify(target: string, message: string): Promise<void> {
        const payload = { code: 'GAME', message };
        if (target === 'all') await emitter.emitToSession(sessionId, 'NOTIFICATION', payload);
        else if (target === 'host') await emitter.emitToHost(sessionId, 'NOTIFICATION', payload);
        else await emitter.emitToPlayer(sessionId, target, 'NOTIFICATION', payload);
      },

      logger: this.log.child({ game: instance.gameId, instanceId: instance.instanceId })
    };
  }
}
