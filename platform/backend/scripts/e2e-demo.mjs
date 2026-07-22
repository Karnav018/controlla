/**
 * Headless end-to-end demo against a RUNNING backend (pnpm start).
 * Simulates exactly what the host screen + two phones do:
 * create session → host socket → players join via code → ready → start game →
 * taps → results. Usage: node scripts/e2e-demo.mjs [apiUrl] [gameId]
 */
import { io } from 'socket.io-client';

const API = process.argv[2] ?? 'http://localhost:4000';
const GAME = process.argv[3] ?? 'mini-race';
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

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(API, { auth: { token }, transports: ['websocket'], reconnection: false });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function sender(socket, sessionId, senderId) {
  let seq = 0;
  return (type, payload) =>
    socket.emit(WIRE, { v: 1, type, sessionId, senderId, seq: ++seq, ts: Date.now(), payload });
}

const waitFor = (socket, type, pred = () => true, ms = 15000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), ms);
    socket.on(WIRE, (env) => {
      if (env.type === type && pred(env)) {
        clearTimeout(t);
        resolve(env);
      }
    });
  });

const log = (label, v) => console.log(`\n▸ ${label}`, v === undefined ? '' : JSON.stringify(v, null, 2));

// 1. Host creates a session (what "Pick a game" does on first click).
const session = await rest('POST', '/sessions');
log('session created', { code: session.code, joinUrl: session.joinUrl });

const host = await connect(session.hostToken);
const hostSend = sender(host, session.sessionId, 'host');
const snap = await waitFor(host, 'SESSION_STATE');
log('host snapshot', { status: snap.payload.status, players: snap.payload.players.length });

// 2. Two phones join via the code (the QR path uses the same endpoint).
const players = [];
for (const nickname of ['Asha', 'Ravi']) {
  const j = await rest('POST', `/sessions/${session.sessionId}/join`, { nickname });
  const socket = await connect(j.playerToken);
  const send = sender(socket, session.sessionId, j.playerId);
  players.push({ nickname, playerId: j.playerId, socket, send });
  send('PLAYER_READY', { ready: true });
}
log('players joined + ready', players.map((p) => p.nickname));

// 3. Host starts the game (attach all waiters BEFORE the command — layouts
// are pushed during plugin init, before GAME_STARTED lands).
const started = waitFor(host, 'GAME_STARTED');
const layoutArrives = waitFor(players[0].socket, 'CONTROLLER_LAYOUT', (e) => e.payload.layout !== null);
const finishedArrives = waitFor(host, 'GAME_FINISHED');
hostSend('HOST_COMMAND', { command: 'START_SESSION', gameId: GAME, options: { durationMs: 3000 } });
log('game started', (await started).payload);

// Phones receive their game layout from the provider plugin.
const layout = await layoutArrives;
log('controller layout components', layout.payload.layout.components.map((c) => c.kind));

// 4. Taps → live GAME_STATE on the host.
for (let i = 0; i < 3; i++) players[0].send('CONTROLLER_INPUT', { controlId: 'tap', action: 'press' });
players[1].send('CONTROLLER_INPUT', { controlId: 'tap', action: 'press' });
const gs = await waitFor(host, 'GAME_STATE', (e) => e.payload.state.taps?.[players[0].playerId] === 3);
log('live host state', gs.payload.state);

// 5. Round ends on its own timer → results.
const finished = await finishedArrives;
log('results', finished.payload.results);

const history = await rest('GET', `/sessions/${session.sessionId}/results`);
log('durable history + leaderboard', {
  games: history.games.map((g) => ({ gameId: g.gameId, finished: !!g.finishedAt })),
  leaderboard: history.leaderboard
});

host.disconnect();
players.forEach((p) => p.socket.disconnect());
console.log('\n✔ full host flow verified end to end');
process.exit(0);
