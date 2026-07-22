import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Socket as ClientSocket } from 'socket.io-client';
import { startTestServer, teardownMongo, type TestServer } from '../helpers/testServer';
import { connectClient, EnvelopeCollector, Sender, restJson } from '../helpers/testClient';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/games');
const SCRIBBLE_PLUGIN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../Game/Scribble-Cantrolla-Game/plugin'
);

/**
 * The real provider game (Dharmik's Scribble), loaded from its actual package
 * in Game/Scribble-Cantrolla-Game/plugin and played end to end: word choice →
 * canvas strokes → hints → guesses → scoring → reveal → results.
 */
describe('scribble plugin (Game/Scribble-Cantrolla-Game) on the platform', () => {
  let server: TestServer;
  let gamesDir: string;
  const cleanup: ClientSocket[] = [];

  beforeAll(async () => {
    gamesDir = await mkdtemp(path.join(tmpdir(), 'controlla-scribble-'));
    await cp(FIXTURES, gamesDir, { recursive: true });
    await cp(SCRIBBLE_PLUGIN, path.join(gamesDir, 'scribble'), { recursive: true });
    server = await startTestServer({ GAMES_DIR: gamesDir, RATE_LIMIT_JOIN_PER_MIN: '100' });
  });

  afterAll(async () => {
    cleanup.forEach((s) => s.disconnect());
    await server.stop();
    await teardownMongo();
    await rm(gamesDir, { recursive: true, force: true });
  });

  it('loads from the game folder and appears in the catalogue', async () => {
    const games = (await restJson(server.baseUrl, 'GET', '/games')).json;
    const scribble = games.find((g: any) => g.gameId === 'scribble');
    expect(scribble).toMatchObject({ name: 'Scribble', minPlayers: 2, maxPlayers: 12 });
  });

  it('plays a full turn: draw on one phone, guess on the others, scores land', async () => {
    const { sessionId, hostToken } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const host = await connectClient(server.baseUrl, hostToken);
    cleanup.push(host);
    const hostRx = new EnvelopeCollector(host);
    await hostRx.waitFor('SESSION_STATE');
    const hostSend = new Sender(host, sessionId, 'host');

    const players: any[] = [];
    for (const nickname of ['Asha', 'Ravi', 'Zoe']) {
      const j = (await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname })).json;
      const socket = await connectClient(server.baseUrl, j.playerToken);
      cleanup.push(socket);
      players.push({ nickname, ...j, socket, rx: new EnvelopeCollector(socket), send: new Sender(socket, sessionId, j.playerId) });
    }
    await hostRx.waitFor('PLAYER_CONNECTED', { pred: (e) => (e.payload as any).player.nickname === 'Zoe' });

    // Deterministic test round: one turn, known word list.
    hostSend.send('HOST_COMMAND', {
      command: 'START_SESSION',
      gameId: 'scribble',
      options: { rounds: 1, drawTimeMs: 60_000, wordChoiceMs: 20_000, revealMs: 1_000, words: ['pizza'] }
    });
    await hostRx.waitFor('GAME_STARTED', { pred: (e) => (e.payload as any).gameId === 'scribble' });

    // Exactly one phone gets the word chooser — that's the drawer.
    const layouts = await Promise.all(
      players.map((p) =>
        p.rx.waitFor('CONTROLLER_LAYOUT', { pred: (e: any) => e.payload.layout !== null }).then((env: any) => ({
          p,
          kinds: env.payload.layout.components.map((c: any) => c.kind)
        }))
      )
    );
    const drawer = layouts.find((l) => l.kinds.includes('choice-list'))!.p;
    const guessers = players.filter((p) => p !== drawer);
    expect(drawer).toBeTruthy();
    expect(guessers).toHaveLength(2);

    // Host state says who draws; the platform's roster names carry through.
    const choosing = await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.phase === 'choosing' });
    expect((choosing.payload as any).state.drawer.id).toBe(drawer.playerId);

    // Drawer picks the word (only option: 'pizza') → drawing phase.
    drawer.send.send('CONTROLLER_INPUT', { controlId: 'word', action: 'select', value: '0' });
    const drawing = await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.phase === 'drawing' });
    expect((drawing.payload as any).state.hint.replace(/ /g, '')).toBe('_____'); // p-i-z-z-a masked
    const drawerPad = await drawer.rx.waitFor('CONTROLLER_LAYOUT', {
      pred: (e: any) => e.payload.layout?.components.some((c: any) => c.kind === 'canvas')
    });
    expect(drawerPad).toBeTruthy();
    const guessPad = await guessers[0].rx.waitFor('CONTROLLER_LAYOUT', {
      pred: (e: any) => e.payload.layout?.components.some((c: any) => c.kind === 'text-input')
    });
    expect(guessPad).toBeTruthy();

    // Strokes stream from the drawer's phone to the TV (batched at tickRate).
    drawer.send.send('CONTROLLER_INPUT', { controlId: 'canvas', action: 'stroke', value: '1|6|100,100;200,150;300,300' });
    drawer.send.send('CONTROLLER_INPUT', { controlId: 'canvas', action: 'stroke', value: '4|10|500,500;510,540' });
    const inked = await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.strokes.length === 2 });
    expect((inked.payload as any).state.strokes[0]).toEqual({ c: 1, w: 6, p: [[100, 100], [200, 150], [300, 300]] });

    // A wrong guess shows on the TV feed; the plugin never leaks the word.
    guessers[0].send.send('CONTROLLER_INPUT', { controlId: 'guess', action: 'submit', value: 'burger' });
    const fed = await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.feed.some((f: any) => f.text.includes('burger')) });
    expect((fed.payload as any).state.hint).not.toContain('pizza');

    // Correct guesses score (ported formula) for guesser AND drawer.
    guessers[0].send.send('CONTROLLER_INPUT', { controlId: 'guess', action: 'submit', value: 'Pizza ' });
    await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.guessed.includes(guessers[0].playerId) });
    guessers[1].send.send('CONTROLLER_INPUT', { controlId: 'guess', action: 'submit', value: 'pizza' });

    // Everyone guessed → the turn ends early and the TV reveals the word.
    const reveal = await hostRx.waitFor('GAME_STATE', { pred: (e) => (e.payload as any).state.phase === 'reveal' });
    expect((reveal.payload as any).state.hint).toBe('pizza');

    // A "round" = every player draws once (ported semantics): the next turn
    // rotates to a different drawer without anyone reconnecting.
    const nextTurn = await hostRx.waitFor('GAME_STATE', {
      pred: (e) => {
        const s = (e.payload as any).state;
        return s.phase === 'choosing' && s.drawer.id !== drawer.playerId;
      },
      timeoutMs: 10_000
    });
    expect((nextTurn.payload as any).state.strokes).toEqual([]); // fresh board

    // Host ends the night → standings from the session scoreboard.
    hostSend.send('HOST_COMMAND', { command: 'END_GAME' });
    const finished = await hostRx.waitFor('GAME_FINISHED', { timeoutMs: 15_000 });
    const results = (finished.payload as any).results;
    expect(results.rankings).toHaveLength(3);
    const first = results.rankings[0];
    expect(first.playerId).toBe(guessers[0].playerId); // first correct guess scores highest
    expect(first.score).toBeGreaterThanOrEqual(500); // 500 base − elapsed + 100 placement
    const drawerRank = results.rankings.find((r: any) => r.playerId === drawer.playerId);
    expect(drawerRank.score).toBe(200); // +100 per correct guesser

    // Session leaderboard accumulated through ctx.scores.
    const roster = (await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}/players`)).json;
    expect(roster.find((p: any) => p.playerId === drawer.playerId).score).toBe(200);

    await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/end`, undefined, hostToken);
  });
});
