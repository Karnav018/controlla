import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { startTestServer, teardownMongo, type TestServer } from '../helpers/testServer';
import { connectClient, EnvelopeCollector, Sender, restJson } from '../helpers/testClient';
import { GameInstance } from '../../src/db/models/gameInstance';
import { InstalledPlugin } from '../../src/db/models/installedPlugin';

/**
 * The provider-integration surface: loader discovery, GET /games, per-game
 * options, results + Mongo finalization, back-to-back games on one session,
 * crash containment, live switching, enable/disable.
 */
describe('plugin runtime + loader (provider games)', () => {
  let server: TestServer;
  const cleanup: ClientSocket[] = [];

  beforeAll(async () => {
    server = await startTestServer({ RATE_LIMIT_JOIN_PER_MIN: '100' });
  });

  afterAll(async () => {
    cleanup.forEach((s) => s.disconnect());
    await server.stop();
    await teardownMongo();
  });

  async function setup(nicknames: string[]) {
    const { sessionId, hostToken } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const host = await connectClient(server.baseUrl, hostToken);
    cleanup.push(host);
    const hostRx = new EnvelopeCollector(host);
    await hostRx.waitFor('SESSION_STATE');
    const hostSend = new Sender(host, sessionId, 'host');
    const players = [];
    for (const nickname of nicknames) {
      const j = (await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname })).json;
      const socket = await connectClient(server.baseUrl, j.playerToken);
      cleanup.push(socket);
      players.push({ ...j, socket, rx: new EnvelopeCollector(socket), send: new Sender(socket, sessionId, j.playerId) });
    }
    return { sessionId, hostToken, host, hostRx, hostSend, players };
  }

  it('GET /games lists everything the loader discovered from GAMES_DIR', async () => {
    const { json } = await restJson(server.baseUrl, 'GET', '/games');
    const ids = json.map((g: any) => g.gameId).sort();
    expect(ids).toEqual(['crash-test', 'echo', 'mini-race']);
    const race = json.find((g: any) => g.gameId === 'mini-race');
    expect(race).toMatchObject({ name: 'Mini Race', version: '1.0.0', minPlayers: 1, maxPlayers: 16 });
    // and the registry seeded installedPlugins
    expect(await InstalledPlugin.countDocuments({ source: 'local' })).toBe(3);
  });

  it('plays a full provider game: options, scores, results, then a second game on the same session', async () => {
    const { sessionId, hostRx, hostSend, players } = await setup(['Ana', 'Ben']);
    const [ana, ben] = players as [any, any];

    // Host starts mini-race with per-game options (short round for the test).
    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'mini-race', options: { durationMs: 1200 } });
    await hostRx.waitFor('GAME_STARTED');
    await ana.rx.waitFor('CONTROLLER_LAYOUT', { pred: (e: any) => e.payload.layout !== null });

    // Ana taps 3×, Ben 1×.
    for (let i = 0; i < 3; i++) ana.send.send('CONTROLLER_INPUT', { controlId: 'tap', action: 'press' });
    ben.send.send('CONTROLLER_INPUT', { controlId: 'tap', action: 'press' });
    await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.taps?.[ana.playerId] === 3 });

    // The round ends on its own timer with dense rankings.
    const finished = await hostRx.waitFor('GAME_FINISHED', { timeoutMs: 5000 });
    const results = (finished.payload as any).results;
    expect(results.rankings[0]).toMatchObject({ playerId: ana.playerId, score: 3, rank: 1 });
    expect(results.rankings[1]).toMatchObject({ playerId: ben.playerId, score: 1, rank: 2 });

    // Controllers reset to the lobby UI; session is back in lobby.
    await ana.rx.waitFor('CONTROLLER_LAYOUT', { pred: (e: any) => e.payload.layout === null });
    const summary = (await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}`)).json;
    expect(summary.status).toBe('lobby');
    expect(summary.game).toBeNull();

    // Scores accumulate on the session leaderboard across games.
    const roster = (await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}/players`)).json;
    expect(roster.find((p: any) => p.playerId === ana.playerId).score).toBe(3);

    // The instance is finalized durably with the provider's results.
    const instanceId = (finished.payload as any).instanceId;
    const doc = await GameInstance.findById(instanceId).lean();
    expect(doc?.pluginId).toBe('mini-race');
    expect(doc?.finishedAt).toBeTruthy();
    expect(doc?.randomSeed).toBeTruthy();
    expect((doc?.results as any).rankings).toHaveLength(2);

    // REST history endpoint: durable results, newest first, plus leaderboard.
    const history = (await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}/results`)).json;
    expect(history.games).toHaveLength(1);
    expect(history.games[0]).toMatchObject({ instanceId, gameId: 'mini-race', pluginVersion: '1.0.0' });
    expect(history.games[0].finishedAt).toBeTruthy();
    expect(history.games[0].results.rankings[0].playerId).toBe(ana.playerId);
    expect(history.leaderboard[0]).toMatchObject({ playerId: ana.playerId, nickname: 'Ana', score: 3 });

    // Back-to-back: a second game starts on the same session — nobody rejoined.
    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'echo' });
    await hostRx.waitFor('GAME_STARTED', { pred: (e) => (e.payload as any).gameId === 'echo' });
    ana.send.send('CONTROLLER_INPUT', { controlId: 'a', action: 'press' });
    await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.game === 'echo' && (e.payload as any).state.inputs === 1 });

    // History now has both games, newest first; the running one has no results yet.
    const history2 = (await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}/results`)).json;
    expect(history2.games.map((g: any) => g.gameId)).toEqual(['echo', 'mini-race']);
    expect(history2.games[0].finishedAt).toBeNull();
    expect(history2.games[0].results).toBeNull();
  });

  it('lastResults rides the snapshot: shown on the results screen, cleared once the next game starts', async () => {
    const { sessionId, hostToken, hostSend, hostRx, players } = await setup(['Lu']);
    const [lu] = players as [any];

    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'mini-race', options: { durationMs: 900 } });
    await hostRx.waitFor('GAME_STARTED');
    lu.send.send('CONTROLLER_INPUT', { controlId: 'tap', action: 'press' });
    await hostRx.waitFor('GAME_FINISHED', { timeoutMs: 5000 });

    // "Host refresh on the results screen": a fresh host connection's snapshot
    // must contain the results without any extra request.
    const host2 = await connectClient(server.baseUrl, hostToken);
    cleanup.push(host2);
    const host2Rx = new EnvelopeCollector(host2);
    const snap = await host2Rx.waitFor('SESSION_STATE');
    const lastResults = (snap.payload as any).lastResults;
    expect(lastResults.gameId).toBe('mini-race');
    expect((lastResults.results as any).rankings[0]).toMatchObject({ playerId: lu.playerId, score: 1, rank: 1 });
    expect(typeof lastResults.finishedAt).toBe('number');

    // Starting the next game ends the results screen: snapshots show it no more.
    const host2Send = new Sender(host2, sessionId, 'host');
    host2Send.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'echo' });
    await host2Rx.waitFor('GAME_STARTED', { pred: (e) => (e.payload as any).gameId === 'echo' });
    const host3 = await connectClient(server.baseUrl, hostToken);
    cleanup.push(host3);
    const host3Rx = new EnvelopeCollector(host3);
    const snap3 = await host3Rx.waitFor('SESSION_STATE');
    expect((snap3.payload as any).lastResults).toBeNull();
    expect((snap3.payload as any).game.gameId).toBe('echo');
  });

  it('results history survives the session ending (Mongo is the record)', async () => {
    const { sessionId, hostToken, hostSend, hostRx, players } = await setup(['Vi']);
    const [vi] = players as [any];

    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'mini-race', options: { durationMs: 800 } });
    await hostRx.waitFor('GAME_STARTED');
    vi.send.send('CONTROLLER_INPUT', { controlId: 'tap', action: 'press' });
    await hostRx.waitFor('GAME_FINISHED', { timeoutMs: 5000 });

    await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/end`, undefined, hostToken);

    const history = (await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}/results`)).json;
    expect(history.games).toHaveLength(1);
    expect(history.games[0].results.rankings[0].playerId).toBe(vi.playerId);
    expect(history.leaderboard).toBeUndefined(); // live state is gone; durable history remains
  });

  it('a crashing provider game aborts itself — the session survives', async () => {
    const { sessionId, hostRx, hostSend, players } = await setup(['Mo']);
    const [mo] = players as [any];

    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'crash-test' });
    await hostRx.waitFor('GAME_STARTED');

    mo.send.send('CONTROLLER_INPUT', { controlId: 'boom', action: 'press' });
    const finished = await hostRx.waitFor('GAME_FINISHED');
    expect((finished.payload as any).results.aborted).toBe(true);

    // Session is intact and immediately playable.
    const summary = (await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}`)).json;
    expect(summary.status).toBe('lobby');
    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'echo' });
    await hostRx.waitFor('GAME_STARTED', { pred: (e) => (e.payload as any).gameId === 'echo' });
  });

  it('host END_GAME force-finishes with standings from the session scoreboard', async () => {
    const { hostRx, hostSend, players } = await setup(['Kim', 'Raj']);
    const [kim] = players as [any, any];

    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'mini-race', options: { durationMs: 60_000 } });
    await hostRx.waitFor('GAME_STARTED');
    kim.send.send('CONTROLLER_INPUT', { controlId: 'tap', action: 'press' });
    kim.send.send('CONTROLLER_INPUT', { controlId: 'tap', action: 'press' });
    await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.taps?.[kim.playerId] === 2 });

    hostSend.send('HOST_COMMAND', { command: 'END_GAME' });
    const finished = await hostRx.waitFor('GAME_FINISHED');
    const results = (finished.payload as any).results;
    expect(results.detail).toBe('host-ended');
    expect(results.rankings[0]).toMatchObject({ playerId: kim.playerId, score: 2, rank: 1 });

    // No game running → typed 409 back to the host.
    hostSend.send('HOST_COMMAND', { command: 'END_GAME' });
    const notice = await hostRx.waitFor('NOTIFICATION', { pred: (e) => (e.payload as any).code === 'NO_GAME_RUNNING' });
    expect(notice).toBeTruthy();
  });

  it('SELECT_GAME switches mid-game: old instance aborts, new one starts', async () => {
    const { hostRx, hostSend } = await setup(['Pia']);

    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'echo' });
    await hostRx.waitFor('GAME_STARTED', { pred: (e) => (e.payload as any).gameId === 'echo' });

    hostSend.send('HOST_COMMAND', { command: 'SELECT_GAME', gameId: 'mini-race', options: { durationMs: 60_000 } });
    const aborted = await hostRx.waitFor('GAME_FINISHED');
    expect((aborted.payload as any).gameId).toBe('echo');
    expect((aborted.payload as any).results.aborted).toBe(true);
    await hostRx.waitFor('GAME_STARTED', { pred: (e) => (e.payload as any).gameId === 'mini-race' });
  });

  it('unknown and operator-disabled games are refused', async () => {
    const { sessionId, hostToken, hostRx, hostSend } = await setup([]);

    const unknown = await restJson(
      server.baseUrl, 'POST', `/sessions/${sessionId}/start`, { gameId: 'does-not-exist' }, hostToken
    );
    expect(unknown.status).toBe(404);
    expect(unknown.json.error).toBe('GAME_NOT_FOUND');

    await InstalledPlugin.updateOne({ pluginId: 'crash-test' }, { enabled: false });
    try {
      const games = (await restJson(server.baseUrl, 'GET', '/games')).json;
      expect(games.map((g: any) => g.gameId)).not.toContain('crash-test');
      const disabled = await restJson(
        server.baseUrl, 'POST', `/sessions/${sessionId}/start`, { gameId: 'crash-test' }, hostToken
      );
      expect(disabled.status).toBe(403);
      expect(disabled.json.error).toBe('GAME_DISABLED');
    } finally {
      await InstalledPlugin.updateOne({ pluginId: 'crash-test' }, { enabled: true });
    }

    // WS command without a gameId gets a typed error, not silence.
    hostSend.send('HOST_COMMAND', { command: 'START_SESSION' });
    const notice = await hostRx.waitFor('NOTIFICATION');
    expect((notice.payload as any).code).toBe('GAME_REQUIRED');
  });
});
