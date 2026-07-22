import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { startTestServer, teardownMongo, type TestServer } from '../helpers/testServer';
import { connectClient, EnvelopeCollector, restJson, sleep } from '../helpers/testClient';
import { GameSession } from '../../src/db/models/gameSession';
import type { SessionStatePayload } from '../../src/protocol';

const GRACE_MS = 2000;

async function makeSession(server: TestServer) {
  const { sessionId, hostToken } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
  const hostSocket = await connectClient(server.baseUrl, hostToken);
  const hostRx = new EnvelopeCollector(hostSocket);
  await hostRx.waitFor('SESSION_STATE');
  const { playerId, playerToken } = (
    await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname: 'Kai' })
  ).json;
  return { sessionId, hostToken, hostSocket, hostRx, playerId, playerToken };
}

describe('reconnection: grace, resume, duplicate tabs, host refresh', () => {
  let server: TestServer;
  const cleanup: ClientSocket[] = [];

  beforeAll(async () => {
    server = await startTestServer({ GRACE_PERIOD_MS: String(GRACE_MS), RATE_LIMIT_JOIN_PER_MIN: '100' });
  });

  afterAll(async () => {
    cleanup.forEach((s) => s.disconnect());
    await server.stop();
    await teardownMongo();
  });

  it('resume within grace keeps identity — no PLAYER_LEFT ever fires', async () => {
    const s = await makeSession(server);
    cleanup.push(s.hostSocket);

    const p1 = await connectClient(server.baseUrl, s.playerToken);
    await s.hostRx.waitFor('PLAYER_CONNECTED');

    p1.disconnect();
    await s.hostRx.waitFor('PLAYER_DISCONNECTED');

    await sleep(300); // well inside the grace window
    const p2 = await connectClient(server.baseUrl, s.playerToken);
    cleanup.push(p2);
    const p2Rx = new EnvelopeCollector(p2);

    const reconnected = await s.hostRx.waitFor('PLAYER_RECONNECTED');
    expect((reconnected.payload as any).playerId).toBe(s.playerId);

    // Resume = snapshot: same identity, same seat.
    const snap = await p2Rx.waitFor('SESSION_STATE');
    expect((snap.payload as SessionStatePayload).you?.playerId).toBe(s.playerId);

    await sleep(GRACE_MS + 500); // outlive the original grace window
    expect(s.hostRx.ofType('PLAYER_LEFT')).toHaveLength(0); // the grace timer was truly cancelled

    const players = await restJson(server.baseUrl, 'GET', `/sessions/${s.sessionId}/players`);
    expect(players.json).toHaveLength(1);
    expect(players.json[0].presence).toBe('connected');
  });

  it('grace expiry turns the disconnect into a real departure', async () => {
    const s = await makeSession(server);
    cleanup.push(s.hostSocket);

    const p1 = await connectClient(server.baseUrl, s.playerToken);
    await s.hostRx.waitFor('PLAYER_CONNECTED');
    p1.disconnect();
    await s.hostRx.waitFor('PLAYER_DISCONNECTED');

    const left = await s.hostRx.waitFor('PLAYER_LEFT', { timeoutMs: GRACE_MS + 3000 });
    expect((left.payload as any).playerId).toBe(s.playerId);

    // Durable record agrees.
    const doc = await GameSession.findById(s.sessionId).lean();
    expect(doc?.players[0]?.leftAt).toBeTruthy();

    // The seat is gone: the old resume credential is rejected at the seat level.
    const zombie = await connectClient(server.baseUrl, s.playerToken);
    const zombieRx = new EnvelopeCollector(zombie);
    const disconnected = new Promise<void>((resolve) => zombie.on('disconnect', () => resolve()));
    await disconnected;
    const notice = zombieRx.ofType('NOTIFICATION')[0];
    if (notice) expect((notice.payload as any).code).toBe('NOT_IN_SESSION');

    expect((await restJson(server.baseUrl, 'GET', `/sessions/${s.sessionId}/players`)).json).toHaveLength(0);
  });

  it('duplicate tab: newest socket wins silently, stale disconnect is ignored', async () => {
    const s = await makeSession(server);
    cleanup.push(s.hostSocket);

    const tab1 = await connectClient(server.baseUrl, s.playerToken);
    const tab1Rx = new EnvelopeCollector(tab1);
    await s.hostRx.waitFor('PLAYER_CONNECTED');
    const hostEventsBefore = s.hostRx.length;

    const tab2 = await connectClient(server.baseUrl, s.playerToken);
    cleanup.push(tab2);
    const tab2Rx = new EnvelopeCollector(tab2);
    await tab2Rx.waitFor('SESSION_STATE');

    // Old tab is told and dropped.
    await new Promise<void>((resolve) => (tab1.disconnected ? resolve() : tab1.on('disconnect', () => resolve())));
    const superseded = tab1Rx.ofType('NOTIFICATION')[0];
    if (superseded) expect((superseded.payload as any).code).toBe('SUPERSEDED');

    await sleep(GRACE_MS + 500);
    // Nothing was "disconnected" from the host's perspective — no presence
    // churn, no PLAYER_LEFT, exactly one connected seat.
    const churn = s.hostRx.envelopes
      .slice(hostEventsBefore)
      .filter((e) => ['PLAYER_DISCONNECTED', 'PLAYER_LEFT', 'PLAYER_RECONNECTED'].includes(e.type));
    expect(churn).toEqual([]);
    const players = (await restJson(server.baseUrl, 'GET', `/sessions/${s.sessionId}/players`)).json;
    expect(players).toHaveLength(1);
    expect(players[0].presence).toBe('connected');
  });

  it('host refresh and host migration are one snapshot, mid-session', async () => {
    const s = await makeSession(server);
    const p = await connectClient(server.baseUrl, s.playerToken);
    cleanup.push(p);
    await s.hostRx.waitFor('PLAYER_CONNECTED');

    s.hostSocket.disconnect(); // host tab dies — game state must survive

    // "New device" presents the same hostToken → full snapshot, host seat restored.
    const host2 = await connectClient(server.baseUrl, s.hostToken);
    cleanup.push(host2);
    const host2Rx = new EnvelopeCollector(host2);
    const snap = await host2Rx.waitFor('SESSION_STATE');
    const state = snap.payload as SessionStatePayload;
    expect(state.hostConnected).toBe(true);
    expect(state.players).toHaveLength(1);
    expect(state.joinUrl).toBeTruthy();

    // The player never noticed anything: still connected, no churn.
    const players = (await restJson(server.baseUrl, 'GET', `/sessions/${s.sessionId}/players`)).json;
    expect(players[0].presence).toBe('connected');
  });
});
