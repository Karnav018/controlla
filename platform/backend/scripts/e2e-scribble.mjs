/**
 * Live Scribble check against a RUNNING backend: two phones join, the host
 * starts Scribble, the drawer picks a word and draws, the guesser guesses.
 * Exercises the exact wire path the real phones use.
 * Usage: node scripts/e2e-scribble.mjs [apiUrl]
 */
import { io } from 'socket.io-client';

const API = process.argv[2] ?? 'http://localhost:4000';
const WIRE = 'msg';

const rest = async (method, path, body, token) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
};

const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(API, { auth: { token }, transports: ['websocket'], reconnection: false });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });

const sender = (socket, sessionId, senderId) => {
  let seq = 0;
  return (type, payload) => socket.emit(WIRE, { v: 1, type, sessionId, senderId, seq: ++seq, ts: Date.now(), payload });
};

const collect = (socket) => {
  const seen = [];
  socket.on(WIRE, (env) => seen.push(env));
  return {
    seen,
    waitFor: (pred, label, ms = 12000) =>
      new Promise((resolve, reject) => {
        const past = seen.find(pred);
        if (past) return resolve(past);
        const t = setTimeout(() => reject(new Error(`timeout: ${label}`)), ms);
        socket.on(WIRE, (env) => {
          if (pred(env)) {
            clearTimeout(t);
            resolve(env);
          }
        });
      })
  };
};

const log = (m) => console.log('▸', m);

// Host + two phones.
const session = await rest('POST', '/sessions');
const host = await connect(session.hostToken);
const hostRx = collect(host);
const hostSend = sender(host, session.sessionId, 'host');
await hostRx.waitFor((e) => e.type === 'SESSION_STATE', 'host snapshot');

const phones = [];
for (const nickname of ['Pixel', 'iPhone']) {
  const j = await rest('POST', `/sessions/${session.sessionId}/join`, { nickname });
  const socket = await connect(j.playerToken);
  phones.push({ nickname, ...j, socket, rx: collect(socket), send: sender(socket, session.sessionId, j.playerId) });
}
log(`2 players joined room ${session.code}`);

// Transfer into the game.
hostSend('HOST_COMMAND', { command: 'START_SESSION', gameId: 'scribble', options: { rounds: 1, drawTimeMs: 30_000, revealMs: 1500, words: ['rocket'] } });
await hostRx.waitFor((e) => e.type === 'GAME_STARTED', 'GAME_STARTED');
log('game started — main screen switches to Scribble');

// One phone becomes the drawer (word chooser), the other the guesser.
const pads = await Promise.all(
  phones.map((p) =>
    p.rx
      .waitFor((e) => e.type === 'CONTROLLER_LAYOUT' && e.payload.layout, `${p.nickname} layout`)
      .then((env) => ({ p, kinds: env.payload.layout.components.map((c) => c.kind) }))
  )
);
const drawer = pads.find((x) => x.kinds.includes('choice-list')).p;
const guesser = phones.find((p) => p !== drawer);
log(`drawer: ${drawer.nickname} · guesser: ${guesser.nickname}`);

drawer.send('CONTROLLER_INPUT', { controlId: 'word', action: 'select', value: '0' });
await drawer.rx.waitFor(
  (e) => e.type === 'CONTROLLER_LAYOUT' && e.payload.layout?.components.some((c) => c.kind === 'canvas'),
  'drawer canvas layout'
);
log('drawer controller now shows the drawing canvas');

drawer.send('CONTROLLER_INPUT', { controlId: 'canvas', action: 'stroke', value: '1|8|200,200;400,300;600,200;700,500' });
const inked = await hostRx.waitFor(
  (e) => e.type === 'GAME_STATE' && e.payload.state.strokes?.length === 1,
  'stroke on main screen'
);
log(`main screen received the stroke (${inked.payload.state.strokes[0].p.length} points), hint "${inked.payload.state.hint}"`);

guesser.send('CONTROLLER_INPUT', { controlId: 'guess', action: 'submit', value: 'rocket' });
await hostRx.waitFor(
  (e) => e.type === 'GAME_STATE' && e.payload.state.guessed?.includes(guesser.playerId),
  'correct guess scored'
);
log(`${guesser.nickname} guessed it — scored`);

// A round = everyone draws once: after the reveal the board rotates to the
// other phone. Then the host ends the game from the ⋯ menu → standings.
await hostRx.waitFor(
  (e) => e.type === 'GAME_STATE' && e.payload.state.phase === 'choosing' && e.payload.state.drawer.id === guesser.playerId,
  'rotation to next drawer'
);
log(`board rotated — ${guesser.nickname} draws next`);
hostSend('HOST_COMMAND', { command: 'END_GAME' });
const finished = await hostRx.waitFor((e) => e.type === 'GAME_FINISHED', 'results', 20000);
log(`results: ${JSON.stringify(finished.payload.results.rankings)}`);

await rest('POST', `/sessions/${session.sessionId}/end`, undefined, session.hostToken);
host.disconnect();
phones.forEach((p) => p.socket.disconnect());
console.log('✔ scribble live: join → transfer → draw → guess → results, all synced');
process.exit(0);
