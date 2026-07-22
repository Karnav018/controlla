import { cp, mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { startTestServer, teardownMongo, type TestServer } from '../helpers/testServer';
import { connectClient, EnvelopeCollector, restJson } from '../helpers/testClient';
import { GameSession } from '../../src/db/models/gameSession';

const CREDS = { email: 'admin@controlla.com', password: 'Test-Admin-2026!' };
const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/games');

/** A minimal valid provider module (plain JS — no platform imports). */
const UPLOAD_GAME = `
export function createPlugin() {
  let ctx;
  return {
    metadata() {
      return { id: 'uploaded-game', name: 'Uploaded Game', version: '1.0.0',
               description: 'Installed via the admin panel', minPlayers: 1, maxPlayers: 8, tickRate: 0 };
    },
    async init(context) {
      ctx = context;
      await ctx.setAllControllerLayouts({ layoutVersion: 1,
        components: [{ kind: 'buttons', id: 'main', buttons: [{ id: 'go', label: 'GO' }] }] });
      await ctx.setHostState({ game: 'uploaded-game', ready: true });
    },
    onPlayerJoin() {}, onPlayerLeave() {}, onPlayerReconnect() {},
    async onInput(playerId) { await ctx.endGame({ rankings: [{ playerId, score: 1, rank: 1 }] }); }
  };
}
`;

describe('admin facility: login, game kill switches, install, session oversight, stats', () => {
  let server: TestServer;
  let adminToken: string;
  let gamesDir: string;
  const cleanup: ClientSocket[] = [];

  beforeAll(async () => {
    // Installs write into GAMES_DIR — use a throwaway copy of the fixtures.
    gamesDir = await mkdtemp(path.join(tmpdir(), 'controlla-games-'));
    await cp(FIXTURES, gamesDir, { recursive: true });
    server = await startTestServer({
      GAMES_DIR: gamesDir,
      ADMIN_EMAIL: CREDS.email,
      ADMIN_PASSWORD: CREDS.password,
      RATE_LIMIT_JOIN_PER_MIN: '100'
    });
  });

  afterAll(async () => {
    cleanup.forEach((s) => s.disconnect());
    await server.stop();
    await teardownMongo();
    await rm(gamesDir, { recursive: true, force: true });
  });

  it('login: wrong credentials 401, right credentials issue a working token', async () => {
    const bad = await restJson(server.baseUrl, 'POST', '/admin/login', {
      email: CREDS.email,
      password: 'wrong-password'
    });
    expect(bad.status).toBe(401);
    expect(bad.json.error).toBe('INVALID_CREDENTIALS');

    const good = await restJson(server.baseUrl, 'POST', '/admin/login', CREDS);
    expect(good.status).toBe(200);
    expect(good.json.email).toBe(CREDS.email);
    adminToken = good.json.adminToken;

    // No token → 401; player/host tokens must never pass (role separation).
    expect((await restJson(server.baseUrl, 'GET', '/admin/games')).status).toBe(401);
    const { sessionId, hostToken } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    expect((await restJson(server.baseUrl, 'GET', '/admin/games', undefined, hostToken)).status).toBe(401);
    await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/end`, undefined, hostToken);
  });

  it('lists every installed game with enablement + play counts, and toggles the kill switch live', async () => {
    const games = (await restJson(server.baseUrl, 'GET', '/admin/games', undefined, adminToken)).json;
    expect(games.map((g: any) => g.gameId).sort()).toEqual(['crash-test', 'echo', 'mini-race']);
    expect(games[0]).toHaveProperty('enabled');
    expect(games[0]).toHaveProperty('playsFinished');
    expect(games[0]).toHaveProperty('source', 'local');

    // Disable via admin → public catalogue hides it, hosts cannot start it.
    const patched = await restJson(
      server.baseUrl, 'PATCH', '/admin/games/crash-test', { enabled: false }, adminToken
    );
    expect(patched.json.enabled).toBe(false);
    const publicGames = (await restJson(server.baseUrl, 'GET', '/games')).json;
    expect(publicGames.map((g: any) => g.gameId)).not.toContain('crash-test');
    // Admin still sees it (that's the point).
    const adminGames = (await restJson(server.baseUrl, 'GET', '/admin/games', undefined, adminToken)).json;
    expect(adminGames.find((g: any) => g.gameId === 'crash-test').enabled).toBe(false);

    // Re-enable → visible again.
    await restJson(server.baseUrl, 'PATCH', '/admin/games/crash-test', { enabled: true }, adminToken);
    expect(
      (await restJson(server.baseUrl, 'GET', '/games')).json.map((g: any) => g.gameId)
    ).toContain('crash-test');

    // Unknown plugin → 404.
    expect(
      (await restJson(server.baseUrl, 'PATCH', '/admin/games/nope', { enabled: false }, adminToken)).status
    ).toBe(404);
  });

  it('installs an uploaded game live — disabled until the operator enables it, then playable', async () => {
    const installed = await restJson(
      server.baseUrl, 'POST', '/admin/games/install',
      { dirName: 'uploaded-game', code: UPLOAD_GAME }, adminToken
    );
    expect(installed.status).toBe(201);
    // Design rule: installs join the registry disabled until turned on.
    expect(installed.json).toMatchObject({ gameId: 'uploaded-game', enabled: false, source: 'local' });
    expect((await restJson(server.baseUrl, 'GET', '/games')).json.map((g: any) => g.gameId)).not.toContain(
      'uploaded-game'
    );

    await restJson(server.baseUrl, 'PATCH', '/admin/games/uploaded-game', { enabled: true }, adminToken);
    const publicGames = (await restJson(server.baseUrl, 'GET', '/games')).json;
    expect(publicGames.map((g: any) => g.gameId)).toContain('uploaded-game');

    const { sessionId, hostToken } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const host = await connectClient(server.baseUrl, hostToken);
    cleanup.push(host);
    const hostRx = new EnvelopeCollector(host);
    await hostRx.waitFor('SESSION_STATE');
    const { playerToken } = (
      await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname: 'Up' })
    ).json;
    const player = await connectClient(server.baseUrl, playerToken);
    cleanup.push(player);
    const start = await restJson(
      server.baseUrl, 'POST', `/sessions/${sessionId}/start`, { gameId: 'uploaded-game' }, hostToken
    );
    expect(start.status).toBe(204);
    const gs = await hostRx.waitFor('GAME_STATE');
    expect((gs.payload as any).state.game).toBe('uploaded-game');
    await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/end`, undefined, hostToken);
  });

  it('rejects broken uploads with a rollback, and duplicate installs', async () => {
    const bad = await restJson(
      server.baseUrl, 'POST', '/admin/games/install',
      { dirName: 'broken-game', code: 'export const nope = 42; // not a game' }, adminToken
    );
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('PLUGIN_INVALID');
    const games = (await restJson(server.baseUrl, 'GET', '/admin/games', undefined, adminToken)).json;
    expect(games.map((g: any) => g.gameId)).not.toContain('broken-game');

    const dup = await restJson(
      server.baseUrl, 'POST', '/admin/games/install',
      { dirName: 'uploaded-game', code: UPLOAD_GAME }, adminToken
    );
    expect(dup.status).toBe(400);
  });

  it('featured pin bubbles a game to the top of the public catalogue', async () => {
    await restJson(server.baseUrl, 'PATCH', '/admin/games/mini-race', { featured: true }, adminToken);
    const games = (await restJson(server.baseUrl, 'GET', '/games')).json;
    expect(games[0]).toMatchObject({ gameId: 'mini-race', featured: true });
    await restJson(server.baseUrl, 'PATCH', '/admin/games/mini-race', { featured: false }, adminToken);
  });

  it('uninstall removes the package from the registry, catalogue, and disk', async () => {
    // Install a throwaway, then remove it.
    await restJson(
      server.baseUrl, 'POST', '/admin/games/install',
      { dirName: 'temp-game', code: UPLOAD_GAME.replace(/uploaded-game/g, 'temp-game') }, adminToken
    );
    const del = await restJson(server.baseUrl, 'DELETE', '/admin/games/temp-game', undefined, adminToken);
    expect(del.status).toBe(204);
    const games = (await restJson(server.baseUrl, 'GET', '/admin/games', undefined, adminToken)).json;
    expect(games.map((g: any) => g.gameId)).not.toContain('temp-game');
    await expect(stat(path.join(gamesDir, 'temp-game'))).rejects.toThrow();
    expect((await restJson(server.baseUrl, 'DELETE', '/admin/games/temp-game', undefined, adminToken)).status).toBe(404);
  });

  it('activity and config report real platform state', async () => {
    const activity = (await restJson(server.baseUrl, 'GET', '/admin/activity', undefined, adminToken)).json;
    expect(activity.length).toBeGreaterThan(0);
    expect(activity.map((a: any) => a.kind)).toContain('game-installed');
    expect(activity.some((a: any) => a.text.includes('uploaded-game'))).toBe(true);

    const config = (await restJson(server.baseUrl, 'GET', '/admin/config', undefined, adminToken)).json;
    const gamesDirEntry = config.find((c: any) => c.key === 'GAMES_DIR');
    expect(gamesDirEntry.value).toBe(gamesDir);
  });

  it('rescan picks up packages dropped on disk since boot', async () => {
    const dir = path.join(gamesDir, 'dropped-game');
    await mkdir(dir);
    await writeFile(
      path.join(dir, 'index.js'),
      UPLOAD_GAME.replace(/uploaded-game/g, 'dropped-game').replace('Uploaded Game', 'Dropped Game'),
      'utf8'
    );
    const rescan = await restJson(server.baseUrl, 'POST', '/admin/games/rescan', {}, adminToken);
    expect(rescan.json.added.map((g: any) => g.gameId)).toContain('dropped-game');
    // Second rescan is a clean no-op.
    expect((await restJson(server.baseUrl, 'POST', '/admin/games/rescan', {}, adminToken)).json.added).toEqual([]);
  });

  it('oversees live sessions and can force-end one', async () => {
    const { sessionId, hostToken } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const host = await connectClient(server.baseUrl, hostToken);
    cleanup.push(host);
    const hostRx = new EnvelopeCollector(host);
    await hostRx.waitFor('SESSION_STATE');
    const { playerToken } = (
      await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname: 'Mo' })
    ).json;
    const player = await connectClient(server.baseUrl, playerToken);
    cleanup.push(player);
    await hostRx.waitFor('PLAYER_CONNECTED');

    const sessions = (await restJson(server.baseUrl, 'GET', '/admin/sessions', undefined, adminToken)).json;
    const mine = sessions.find((s: any) => s.sessionId === sessionId);
    expect(mine).toMatchObject({ live: true, status: 'lobby', playerCount: 1, connectedCount: 1 });

    // Moderation: force-end. Everyone is dropped, records closed out.
    const playerDropped = new Promise<void>((r) => player.on('disconnect', () => r()));
    const del = await restJson(server.baseUrl, 'DELETE', `/admin/sessions/${sessionId}`, undefined, adminToken);
    expect(del.status).toBe(204);
    await playerDropped;
    expect((await GameSession.findById(sessionId).lean())?.status).toBe('ended');
    expect(await server.deps.store.sessionExists(sessionId)).toBe(false);
  });

  it('platform stats reflect reality', async () => {
    const stats = (await restJson(server.baseUrl, 'GET', '/admin/stats', undefined, adminToken)).json;
    expect(stats.totalSessions).toBeGreaterThanOrEqual(2);
    const ids = stats.byGame.map((g: any) => g.gameId);
    for (const id of ['crash-test', 'echo', 'mini-race', 'uploaded-game', 'dropped-game']) {
      expect(ids).toContain(id);
    }
    expect(typeof stats.activeSessions).toBe('number');
    expect(typeof stats.playersInRooms).toBe('number');
  });
});
