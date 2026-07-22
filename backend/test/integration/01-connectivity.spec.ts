import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { startTestServer, teardownMongo, type TestServer } from '../helpers/testServer';
import {
  connectClient,
  EnvelopeCollector,
  Sender,
  restJson,
  joinTokenFrom
} from '../helpers/testClient';
import type { SessionStatePayload } from '../../src/protocol';

describe('connectivity: create → QR join → lobby', () => {
  let server: TestServer;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    server = await startTestServer({ RATE_LIMIT_JOIN_PER_MIN: '100' });
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await server.stop();
    await teardownMongo();
  });

  it('serves /healthz', async () => {
    const { status, json } = await restJson(server.baseUrl, 'GET', '/healthz');
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
  });

  it('runs the full lobby flow with snapshots, presence and ready states', async () => {
    // 1. Host creates a session.
    const create = await restJson(server.baseUrl, 'POST', '/sessions');
    expect(create.status).toBe(201);
    const { sessionId, code, joinUrl, hostToken } = create.json;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(joinUrl).toContain(`/play/${code}?t=`);

    // 2. Host connects and gets a snapshot with the joinUrl.
    const hostSocket = await connectClient(server.baseUrl, hostToken);
    sockets.push(hostSocket);
    const hostRx = new EnvelopeCollector(hostSocket);
    const hostSnap = await hostRx.waitFor('SESSION_STATE');
    const hostState = hostSnap.payload as SessionStatePayload;
    expect(hostState.status).toBe('lobby');
    expect(hostState.joinUrl).toBeTruthy();
    expect(hostState.players).toEqual([]);

    // 3. Phone joins via the QR token, connects, host sees PLAYER_CONNECTED.
    const join = await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, {
      nickname: 'Asha',
      joinToken: joinTokenFrom(joinUrl)
    });
    expect(join.status).toBe(201);
    const { playerId, playerToken } = join.json;

    const playerSocket = await connectClient(server.baseUrl, playerToken);
    sockets.push(playerSocket);
    const playerRx = new EnvelopeCollector(playerSocket);

    const connected = await hostRx.waitFor('PLAYER_CONNECTED');
    expect((connected.payload as any).player.playerId).toBe(playerId);
    expect((connected.payload as any).player.nickname).toBe('Asha');

    // Player's own snapshot says who they are and never leaks the joinUrl.
    const playerSnap = await playerRx.waitFor('SESSION_STATE');
    const playerState = playerSnap.payload as SessionStatePayload;
    expect(playerState.you?.playerId).toBe(playerId);
    expect(playerState.joinUrl).toBeUndefined();

    // 4. Ready toggle reaches the host as a delta and sticks in REST reads.
    const sender = new Sender(playerSocket, sessionId, playerId);
    sender.send('PLAYER_READY', { ready: true });
    const ready = await hostRx.waitFor('PLAYER_READY');
    expect(ready.payload).toEqual({ playerId, ready: true });

    const players = await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}/players`);
    expect(players.json).toHaveLength(1);
    expect(players.json[0]).toMatchObject({ playerId, ready: true, presence: 'connected' });

    // 5. PING ack carries the server clock (RTT/2 latency metric).
    const pong = await sender.ping();
    expect(typeof pong.ts).toBe('number');

    // 6. Server deltas carry strictly increasing seq.
    const seqs = hostRx.envelopes.map((e) => e.seq);
    expect([...seqs].sort((a, b) => a - b)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('supports the typed-code fallback join (no QR token)', async () => {
    const create = await restJson(server.baseUrl, 'POST', '/sessions');
    const { sessionId, code } = create.json;

    const resolved = await restJson(server.baseUrl, 'GET', `/sessions/code/${code.toLowerCase()}`);
    expect(resolved.status).toBe(200);
    expect(resolved.json.sessionId).toBe(sessionId);

    const join = await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname: 'Ravi' });
    expect(join.status).toBe(201);
    expect(join.json.playerToken).toBeTruthy();
  });

  it('validates join bodies', async () => {
    const { sessionId } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const bad = await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname: '' });
    expect(bad.status).toBe(400);
    expect(bad.json.error).toBe('VALIDATION');
  });
});
