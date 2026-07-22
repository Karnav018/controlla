import path from 'node:path';
import type { Config } from './config';
import type { Logger } from './logger';
import { createRedis, type RedisClient } from './redis/client';
import { LiveStore } from './redis/liveStore';
import { TimerService } from './services/timerService';
import { TokenService } from './services/tokenService';
import { RoomEmitter } from './ws/emitter';
import { SnapshotService } from './services/snapshotService';
import { PluginRuntime, type PluginFactory } from './runtime/pluginRuntime';
import { PluginLoader } from './runtime/loader';
import type { PluginRuntimePort } from './bus/types';
import { SessionService } from './services/sessionService';
import { PlayerService } from './services/playerService';
import { PresenceService } from './services/presenceService';
import { AdminService } from './services/adminService';
import { EventBus } from './bus/eventBus';

export interface Deps {
  cfg: Config;
  log: Logger;
  redis: RedisClient;
  store: LiveStore;
  timers: TimerService;
  tokens: TokenService;
  emitter: RoomEmitter;
  snapshot: SnapshotService;
  runtime: PluginRuntimePort;
  loader: PluginLoader;
  sessions: SessionService;
  players: PlayerService;
  presence: PresenceService;
  admin: AdminService;
  bus: EventBus;
}

/**
 * Manual constructor-injection wiring. The plugin registry starts empty and
 * is filled by `deps.loader.discover()` at boot (after Mongo is connected and,
 * in tests, after stores are wiped) — the loader mutates the same Map the
 * runtime reads from.
 */
export function createDeps(cfg: Config, log: Logger): Deps {
  const redis = createRedis(cfg.REDIS_URL);
  const store = new LiveStore(redis);
  const timers = new TimerService(store, log);
  const tokens = new TokenService(cfg, store);
  const emitter = new RoomEmitter(store, log);
  const snapshot = new SnapshotService(store, emitter);

  const registry = new Map<string, PluginFactory>();
  const runtime = new PluginRuntime(cfg, store, emitter, registry, log);
  const loader = new PluginLoader(path.resolve(cfg.GAMES_DIR), registry, log);

  const sessions = new SessionService(cfg, store, tokens, timers, emitter, snapshot, runtime, log);
  const players = new PlayerService(cfg, store, tokens, timers, emitter, runtime, log);
  const presence = new PresenceService(cfg, store, timers, emitter, snapshot, runtime, log);
  const admin = new AdminService(cfg, store, runtime, tokens, loader);
  const bus = new EventBus(runtime, players, sessions, log);

  timers.register('grace', (sessionId, playerId) => presence.expireGrace(sessionId, playerId));
  timers.register('joinRotate', (sessionId) => sessions.handleJoinRotate(sessionId));

  return {
    cfg,
    log,
    redis,
    store,
    timers,
    tokens,
    emitter,
    snapshot,
    runtime,
    loader,
    sessions,
    players,
    presence,
    admin,
    bus
  };
}

export async function closeDeps(deps: Deps): Promise<void> {
  deps.timers.stop();
  await deps.redis.quit();
}
