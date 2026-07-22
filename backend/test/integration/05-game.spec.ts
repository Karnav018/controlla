import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { startTestServer, teardownMongo, type TestServer } from '../helpers/testServer';
import { connectClient, EnvelopeCollector, Sender, restJson, sleep } from '../helpers/testClient';
import { GameSession } from '../../src/db/models/gameSession';
import type { SessionStatePayload } from '../../src/protocol';

/**
 * Phase 1 acceptance path: start → controllers receive the echo layout →
 * inputs appear on the host as GAME_STATE → snapshot rule under reconnect →
 * clean session end.
 */
describe('gameplay loop (echo stub) + seq discipline', () => {
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

  it('runs the full loop end to end', async () => {
    const { sessionId, hostToken } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const host = await connectClient(server.baseUrl, hostToken);
    cleanup.push(host);
    const hostRx = new EnvelopeCollector(host);
    await hostRx.waitFor('SESSION_STATE');
    const hostSend = new Sender(host, sessionId, 'host');

    const joins = await Promise.all(
      ['Ana', 'Ben'].map((nickname) =>
        restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname })
      )
    );
    const [ana, ben] = joins.map((j) => j.json);
    const anaSocket = await connectClient(server.baseUrl, ana.playerToken);
    const benSocket = await connectClient(server.baseUrl, ben.playerToken);
    cleanup.push(anaSocket, benSocket);
    const anaRx = new EnvelopeCollector(anaSocket);
    const benRx = new EnvelopeCollector(benSocket);
    await hostRx.waitFor('PLAYER_CONNECTED', { pred: (e) => (e.payload as any).player.playerId === ben.playerId });

    // Host starts via WS HOST_COMMAND — everyone gets GAME_STARTED, every
    // controller gets the echo layout. The platform has no default game:
    // the host always names one (provider-supplied, loaded from GAMES_DIR).
    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'echo' });
    await hostRx.waitFor('GAME_SELECTED');
    await hostRx.waitFor('GAME_STARTED');
    const anaLayout = await anaRx.waitFor('CONTROLLER_LAYOUT');
    await benRx.waitFor('CONTROLLER_LAYOUT');
    const components = (anaLayout.payload as any).layout.components;
    expect(components.some((c: any) => c.kind === 'buttons')).toBe(true);

    // A tap lands on the host as GAME_STATE with the player attributed.
    // (init emits an inputs:0 state first — wait for the tap's state.)
    const anaSend = new Sender(anaSocket, sessionId, ana.playerId);
    anaSend.send('CONTROLLER_INPUT', { controlId: 'a', action: 'press' });
    const gs1 = await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.inputs === 1 });
    expect((gs1.payload as any).state.lastInput.playerId).toBe(ana.playerId);

    // Duplicate seq is dropped: replaying the same envelope has no effect.
    const gameStatesBefore = hostRx.ofType('GAME_STATE').length;
    anaSend.send('CONTROLLER_INPUT', { controlId: 'a', action: 'press' }, 1); // replay of Ana's seq 1
    await sleep(400);
    expect(hostRx.ofType('GAME_STATE')).toHaveLength(gameStatesBefore);

    // Next fresh seq works.
    anaSend.send('CONTROLLER_INPUT', { controlId: 'b', action: 'press' });
    const gs2 = await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.inputs === 2 });
    expect((gs2.payload as any).state.lastInput.controlId).toBe('b');

    // Double-start is rejected with a typed NOTIFICATION, not a crash.
    hostSend.send('HOST_COMMAND', { command: 'START_SESSION', gameId: 'echo' });
    const rejected = await hostRx.waitFor('NOTIFICATION');
    expect((rejected.payload as any).code).toBe('ALREADY_STARTED');

    // Mid-game host reconnect: snapshot + GAME_STATE replay, and the
    // snapshot+deltas rule holds (every later delta has seq > snapshot.seq).
    host.disconnect();
    const host2 = await connectClient(server.baseUrl, hostToken);
    cleanup.push(host2);
    const host2Rx = new EnvelopeCollector(host2);
    const host2Send = new Sender(host2, sessionId, 'host');
    const snap = await host2Rx.waitFor('SESSION_STATE');
    expect((snap.payload as SessionStatePayload).status).toBe('playing');
    const replay = await host2Rx.waitFor('GAME_STATE');
    expect((replay.payload as any).state.inputs).toBe(2);

    anaSend.send('CONTROLLER_INPUT', { controlId: 'a', action: 'press' });
    const gs3 = await host2Rx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.inputs === 3 });
    expect(gs3.seq).toBeGreaterThan(snap.seq);
    for (const env of host2Rx.envelopes) {
      if (env !== snap) expect(env.seq).toBeGreaterThan(0);
    }
    const seqs = host2Rx.envelopes.map((e) => e.seq);
    expect([...seqs].sort((x, y) => x - y)).toEqual(seqs);

    // Mid-game player reconnect gets the layout back without asking.
    anaSocket.disconnect();
    const ana2 = await connectClient(server.baseUrl, ana.playerToken);
    cleanup.push(ana2);
    const ana2Rx = new EnvelopeCollector(ana2);
    await ana2Rx.waitFor('SESSION_STATE');
    await ana2Rx.waitFor('CONTROLLER_LAYOUT');

    // Clean end: everyone told, sockets dropped, Redis gone, Mongo closed out.
    const benDisconnected = new Promise<void>((r) => benSocket.on('disconnect', () => r()));
    host2Send.send('HOST_COMMAND', { command: 'END_SESSION' });
    await benRx.waitFor('SESSION_ENDED');
    await benDisconnected;

    expect(await server.deps.store.sessionExists(sessionId)).toBe(false);
    const doc = await GameSession.findById(sessionId).lean();
    expect(doc?.status).toBe('ended');
    expect(doc?.active).toBe(false);
  });
});
