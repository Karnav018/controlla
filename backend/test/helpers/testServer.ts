import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { buildConfig } from '../../src/config';
import { buildLogger } from '../../src/logger';
import { connectMongo, syncAllIndexes, disconnectMongo } from '../../src/db/connect';
import { createDeps, closeDeps, type Deps } from '../../src/container';
import { buildServer } from '../../src/app';

export interface TestServer {
  baseUrl: string;
  deps: Deps;
  stop(): Promise<void>;
}

const FIXTURE_GAMES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/games'
);

export function testEnv(overrides: Record<string, string> = {}): Record<string, string | undefined> {
  return {
    NODE_ENV: 'test',
    // TEST_* only — plain MONGO_URL/REDIS_URL leak in from backend/.env via
    // dotenv, and tests wipe their stores; they must never target dev data.
    REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6381/15',
    MONGO_URL: process.env.TEST_MONGO_URL ?? 'mongodb://localhost:27018/controlla_test',
    JWT_SECRET: 'test-secret-1234567890',
    GRACE_PERIOD_MS: '2000',
    SWEEP_INTERVAL_MS: '500',
    PUBLIC_WEB_URL: 'http://localhost:3000',
    GAMES_DIR: FIXTURE_GAMES_DIR,
    ...overrides
  };
}

let mongoReady = false;

/**
 * Boots a full server on an ephemeral port against real Redis + Mongo.
 * fresh=true (default) wipes both stores first; pass false to simulate a
 * restart picking up existing durable state (timers, sessions).
 */
export async function startTestServer(
  overrides: Record<string, string> = {},
  opts: { fresh?: boolean } = {}
): Promise<TestServer> {
  const fresh = opts.fresh !== false;
  const cfg = buildConfig(testEnv(overrides));
  const log = buildLogger(cfg);

  if (!mongoReady) {
    await connectMongo(cfg.MONGO_URL);
    mongoReady = true;
  }
  const deps = createDeps(cfg, log);
  if (fresh) {
    await deps.redis.flushdb();
    await mongoose.connection.dropDatabase();
    await syncAllIndexes();
  }
  await deps.loader.discover(); // after the wipe so installedPlugins seeding survives

  const server = buildServer(deps);
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  await deps.timers.recoverAll();
  await deps.runtime.recoverAll();
  deps.timers.startSweep(cfg.SWEEP_INTERVAL_MS);

  const port = (server.httpServer.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    deps,
    stop: async () => {
      await server.close();
      await closeDeps(deps);
    }
  };
}

/** Call once in afterAll, after every server in the file is stopped. */
export async function teardownMongo(): Promise<void> {
  if (mongoReady) {
    await disconnectMongo();
    mongoReady = false;
  }
}
