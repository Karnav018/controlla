import { afterAll, describe, expect, it } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { startTestServer, teardownMongo, type TestServer } from '../helpers/testServer';
import { connectClient, EnvelopeCollector, restJson } from '../helpers/testClient';
import { GameSession } from '../../src/db/models/gameSession';
import { GameInstance } from '../../src/db/models/gameInstance';

const GRACE_MS = 2500;

/**
 * The stateless-server invariant, proven: grace timers live in Redis, not in
 * process memory. A server that dies mid-grace hands the countdown to
 * whichever process boots next.
 */
describe('server restart mid-grace', () => {
  const cleanup: ClientSocket[] = [];
  let b: TestServer | null = null;

  afterAll(async () => {
    cleanup.forEach((s) => s.disconnect());
    await b?.stop();
    await teardownMongo();
  });

  it('a recovered timer still expires the player on schedule', async () => {
    const a = await startTestServer({ GRACE_PERIOD_MS: String(GRACE_MS) });

    const { sessionId, hostToken } = (await restJson(a.baseUrl, 'POST', '/sessions')).json;
    const hostA = await connectClient(a.baseUrl, hostToken);
    const hostARx = new EnvelopeCollector(hostA);
    await hostARx.waitFor('SESSION_STATE');

    const { playerId, playerToken } = (
      await restJson(a.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname: 'Zoe' })
    ).json;
    const player = await connectClient(a.baseUrl, playerToken);
    await hostARx.waitFor('PLAYER_CONNECTED');

    // Player drops; grace timer armed in Redis by server A. Then A dies.
    player.disconnect();
    await hostARx.waitFor('PLAYER_DISCONNECTED');
    hostA.disconnect();
    await a.stop();

    // Server B boots on the same Redis/Mongo and recovers the timer.
    b = await startTestServer({ GRACE_PERIOD_MS: String(GRACE_MS) }, { fresh: false });
    const hostB = await connectClient(b.baseUrl, hostToken);
    cleanup.push(hostB);
    const hostBRx = new EnvelopeCollector(hostB);
    const snap = await hostBRx.waitFor('SESSION_STATE');
    // B's snapshot still shows the disconnected-but-graced seat.
    expect((snap.payload as any).players).toHaveLength(1);

    // The grace countdown survives the restart and fires in B.
    const left = await hostBRx.waitFor('PLAYER_LEFT', { timeoutMs: GRACE_MS + 5000 });
    expect((left.payload as any).playerId).toBe(playerId);

    expect((await restJson(b.baseUrl, 'GET', `/sessions/${sessionId}/players`)).json).toHaveLength(0);
    const doc = await GameSession.findById(sessionId).lean();
    expect(doc?.players[0]?.leftAt).toBeTruthy();
  });

  it('a restart mid-game aborts the round honestly — the session and seats survive', async () => {
    await b?.stop();
    b = null;
    const a = await startTestServer({ GRACE_PERIOD_MS: '60000' });

    const { sessionId, hostToken } = (await restJson(a.baseUrl, 'POST', '/sessions')).json;
    const hostA = await connectClient(a.baseUrl, hostToken);
    const hostARx = new EnvelopeCollector(hostA);
    await hostARx.waitFor('SESSION_STATE');
    const { playerToken } = (
      await restJson(a.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname: 'Rex' })
    ).json;
    const player = await connectClient(a.baseUrl, playerToken);
    await hostARx.waitFor('PLAYER_CONNECTED');

    const start = await restJson(
      a.baseUrl, 'POST', `/sessions/${sessionId}/start`,
      { gameId: 'mini-race', options: { durationMs: 60_000 } }, hostToken
    );
    expect(start.status).toBe(204);

    // Server dies mid-round; game state was in-process and is gone.
    hostA.disconnect();
    player.disconnect();
    await a.stop();

    b = await startTestServer({ GRACE_PERIOD_MS: '60000' }, { fresh: false });
    // recoverAll flipped the session back to lobby and finalized the instance as aborted.
    const summary = (await restJson(b.baseUrl, 'GET', `/sessions/${sessionId}`)).json;
    expect(summary.status).toBe('lobby');
    expect(summary.game).toBeNull();
    const instance = await GameInstance.findOne({ sessionId }).lean();
    expect(instance?.finishedAt).toBeTruthy();
    expect((instance?.results as any)).toMatchObject({ aborted: true, detail: 'server-restart' });

    // Seats survived (grace 60s) and the session is immediately playable again.
    const hostB = await connectClient(b.baseUrl, hostToken);
    cleanup.push(hostB);
    const hostBRx = new EnvelopeCollector(hostB);
    const snap = await hostBRx.waitFor('SESSION_STATE');
    expect((snap.payload as any).players).toHaveLength(1);
    const restart = await restJson(
      b.baseUrl, 'POST', `/sessions/${sessionId}/start`, { gameId: 'echo' }, hostToken
    );
    expect(restart.status).toBe(204);
    await hostBRx.waitFor('GAME_STARTED');
  });
});
