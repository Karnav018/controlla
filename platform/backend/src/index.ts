import { buildConfig } from './config';
import { buildLogger } from './logger';
import { connectMongo, syncAllIndexes, disconnectMongo } from './db/connect';
import { createDeps, closeDeps } from './container';
import { buildServer } from './app';

async function main(): Promise<void> {
  const cfg = buildConfig();
  const log = buildLogger(cfg);

  await connectMongo(cfg.MONGO_URL);
  await syncAllIndexes(); // the indexing contract: schemas are the source of truth
  log.info('mongo connected, indexes synced');

  const deps = createDeps(cfg, log);
  await deps.loader.discover(); // provider game packages from GAMES_DIR → registry + installedPlugins
  const server = buildServer(deps);

  await new Promise<void>((resolve) => server.httpServer.listen(cfg.PORT, resolve));

  // Recovery AFTER listen: overdue grace/rotation timers fire into a fully
  // wired server, and sessions left 'playing' by a dead process are aborted
  // back to their lobby.
  await deps.timers.recoverAll();
  await deps.runtime.recoverAll();
  deps.timers.startSweep(cfg.SWEEP_INTERVAL_MS);

  log.info({ port: cfg.PORT, env: cfg.NODE_ENV }, 'controlla backend listening');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ signal }, 'shutting down');
    try {
      await server.close();
      await closeDeps(deps);
      await disconnectMongo();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
