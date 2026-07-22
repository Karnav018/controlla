# Controlla Platform — Implementation Plan

Derived from `Complete_Multiplayer_Gaming_Platform_Blueprint.md` (v1.0, the
authoritative spec). Stack per product decision (2026-07-22): **Next.js +
Node.js, MongoDB + Redis, TypeScript end-to-end.** UI design will be produced
separately (Claude design) and slotted into the Next.js app.

This plan refines the blueprint into buildable decisions: authority model,
plugin contract, reconnection flow, protocol, data model (with indexes), and
phased milestones.

---

## 1. Scope recap

A reusable multiplayer platform — "an operating system for party games". A host
screen creates a session, players join by scanning a QR with their phones,
phones become dynamic controllers, and games run as plugins on top of shared
connectivity. The platform owns sessions/connectivity/orchestration; plugins
own rules/gameplay/assets.

Target genre for v1: **party / turn-based / reaction games** (quiz, voting,
tap-race). Twitch-precision games (fighting, platformers) are explicitly out of
scope — the input path is a network round trip.

---

## 2. Core decisions

### D1. Authority model: server-authoritative

Game plugins execute **on the Node.js server**, inside the Plugin Runtime. The
host screen is a renderer; controllers are input devices. Neither holds
authoritative state.

Why:
- The blueprint's event routing is already
  `Controller → Platform → Plugin → Platform → Host`, with the Plugin Runtime
  behind the WebSocket gateway.
- A host refresh or crash doesn't lose the game — the host reconnects and
  re-renders from a state snapshot. Host migration becomes trivial (blueprint's
  Session Manager "Recovery").
- No trust problems: controllers can't cheat, host can't desync.
- One codebase for game logic instead of logic smeared across host + server.

Cost: input latency = phone → server → host round trip (~50–150 ms on decent
networks). Acceptable for the target genre; enforced as a design constraint on
plugins (no per-frame input dependence).

### D2. Plugin execution: in-process first, isolated later

- **Phase 2 (first-party games):** plugins are TypeScript packages loaded
  in-process by the Plugin Runtime. Simple, fast, debuggable.
- **Phase 4 (third-party / marketplace):** move untrusted plugins into
  `worker_threads` communicating over the same Event Bus interface — the
  blueprint's "Sandbox" and "Install" runtime duties. The plugin contract is
  designed now so nothing changes for plugin authors when the isolation
  boundary moves.

### D3. Rendering split: who draws what

A game plugin has **three faces**:

| Face             | Runs on     | Authored by | How it gets there                        |
|------------------|------------|-------------|-------------------------------------------|
| Game logic       | Node server | Plugin      | TS package loaded by Plugin Runtime       |
| Host view        | Next.js host page | Plugin | React component, loaded via `next/dynamic` |
| Controller UI    | Phone       | Platform    | JSON layout emitted by plugin, rendered by platform |

The controller never runs game code — it renders platform-defined JSON layouts
(the blueprint's Dynamic Controller). This is what lets players stay connected
across game switches.

First-party host views are React components bundled at build time and loaded
with `next/dynamic` keyed by plugin id. Runtime-remote loading (marketplace)
comes in Phase 4.

### D4. Tech stack

- **Web app: Next.js (one app).** Routes:
  - `/` — landing + create session
  - `/host/[sessionId]` — host screen (lobby, QR, game views, results)
  - `/play/[code]` — controller, installable as a **PWA** (manifest + service
    worker + Wake Lock + reconnect handling)

  One app, one deploy, shared components. UI skin comes from the Claude design
  pass; components are built headless-first so the design drops in.
- **Real-time server: standalone Node.js (TypeScript) service** — Fastify +
  Socket.IO + the Plugin Runtime. This is deliberately **not** Next.js API
  routes: Socket.IO needs a long-lived process, and serverless hosting for the
  Next app must never constrain the gateway. All REST from §4.3 lives here too,
  so session logic has one home.
- **Data: MongoDB (durable) + Redis (live state).** Mongoose for schema +
  **index declarations in code**, with `syncIndexes()` run at server startup
  and verified in CI — every index in §7 exists in the codebase, not in
  someone's shell history.
- **Shared types: `packages/events` imported everywhere** — server, Next app,
  and game plugins. One TypeScript contract, zero codegen.
- **Monorepo:** pnpm workspaces.

### D5. Latency budget

Input-to-host-render target: **p95 < 200 ms** on same-network Wi-Fi.
Instrument from day one (client timestamps in the event envelope) so
regressions are visible, and so plugin authors know what they're designing
against.

---

## 3. Repository layout

```
controlla-platform/
├── apps/
│   └── web/               # Next.js: landing, /host/[sessionId], /play/[code] (PWA controller)
├── server/                # Node.js: Fastify REST + Socket.IO gateway + Plugin Runtime
├── packages/
│   ├── events/            # Envelope, event types, ControllerLayout types — single source of truth
│   ├── sdk/               # GamePlugin interface + GameContext + test harness
│   └── ui/                # Controller-layout renderer + shared components (design drops in here)
├── games/
│   └── tap-race/          # First game: logic/ (server) + host-view/ (React component)
├── docs/
└── docker-compose.yml     # Redis + MongoDB for local dev
```

---

## 4. Protocol

### 4.1 Envelope

Every WebSocket message uses one envelope:

```ts
interface Envelope<T = unknown> {
  v: 1;                    // protocol version
  type: string;            // e.g. "CONTROLLER_INPUT"
  sessionId: string;
  senderId: string;        // playerId | "host" | "server"
  seq: number;             // per-sender monotonic counter (idempotency/ordering)
  ts: number;              // sender clock, ms — feeds the latency budget metrics
  payload: T;
}
```

### 4.2 Event catalogue (blueprint §9, plus state-sync events)

Client → server:
`JOIN`, `LEAVE`, `PLAYER_READY` (lobby ready toggle), `CONTROLLER_INPUT`,
`HOST_COMMAND` (select/start/end game, end session — host only), `PING`.

Server → clients:
`SESSION_STATE` (full snapshot), `PLAYER_CONNECTED`, `PLAYER_READY`,
`PLAYER_DISCONNECTED`, `PLAYER_RECONNECTED`, `PLAYER_LEFT`,
`CONTROLLER_LAYOUT` (per-player), `GAME_SELECTED`, `GAME_LOADED`,
`GAME_STARTED`, `GAME_STATE` (host-view state, from plugin), `GAME_FINISHED`,
`SESSION_ENDED`, `NOTIFICATION` (toast, from the shared Notifications service).

Rule: **snapshot + deltas.** On connect or reconnect a client receives one
`SESSION_STATE` / `GAME_STATE` snapshot, then incremental events. No client is
ever expected to have witnessed history.

### 4.3 REST (blueprint §8) — served by `server/`

```
POST   /sessions                  → { sessionId, code, joinUrl, hostToken }
GET    /sessions/{id}
DELETE /sessions/{id}             (host auth)
POST   /sessions/{id}/join        → { playerId, playerToken }   ← resume credential
POST   /sessions/{id}/leave
POST   /sessions/{id}/start       (host auth)
POST   /sessions/{id}/end         (host auth)
GET    /sessions/{id}/players
```

### 4.4 QR / join security (blueprint §7 QR Service + §15)

The QR encodes `joinUrl` containing a short-lived **join token** (signed,
default 15 min TTL, rotated while the lobby is open; host screen always shows
the current QR). `POST /join` validates it and issues the long-lived
`playerToken`. Prevents stale QR screenshots from joining later sessions.
Join-by-code (6-char) remains as fallback for players who can't scan.

---

## 5. Reconnection & presence (blueprint "Recovery"/"Reconnect", made concrete)

Phones lock, browsers background tabs, Wi-Fi blips. This is the platform's
hardest everyday problem, so it's designed in from Phase 1:

1. **Join once, resume forever.** `POST /join` issues a signed `playerToken`
   (JWT: sessionId + playerId, TTL = session TTL). The controller stores it in
   `localStorage`. Every socket connection authenticates with it — there is no
   separate "reconnect" API, just connect-with-token.
2. **Grace period.** On socket drop the player is marked `disconnected` (shown
   as such in the lobby/host UI) but keeps their seat, score, and identity for
   a grace window (default **120 s**, configurable per session). Only after the
   window (or explicit `LEAVE`) do they become `left`, and the plugin's
   `onPlayerLeave` fires.
3. **Resume = snapshot.** On reconnect within grace: server rebinds the socket
   to the playerId, emits `PLAYER_RECONNECTED` to the room, and sends the
   client its current `CONTROLLER_LAYOUT` + `SESSION_STATE`. The plugin sees
   `onPlayerReconnect`, not a leave/join pair.
4. **Client-side triggers.** The controller reconnects aggressively on
   `visibilitychange` and `online` events, holds a screen Wake Lock during
   gameplay, and shows a "reconnecting…" overlay itself (no server involvement).
5. **Host is just another resumable client.** `hostToken` works the same way.
   Because the server is authoritative (D1), a host refresh mid-game costs one
   snapshot, nothing more. A different device presenting the same `hostToken`
   *is* host migration.
6. **Session expiry.** Redis session state carries a sliding TTL (default 24 h
   idle). MongoDB keeps the durable record for history/analytics.

---

## 6. Plugin contract (blueprint §11, refined & typed)

The blueprint's `GamePlugin`/`GameContext`, made concrete. Lives in
`packages/sdk`. The generic `onEvent(event)` is replaced by typed callbacks —
lifecycle events get dedicated hooks, and controller input gets `onInput`.

```ts
interface GamePlugin<S = unknown> {
  metadata(): GameMetadata;

  /** Called once when the game instance is created. */
  init(ctx: GameContext, players: readonly Player[]): void | Promise<void>;

  /** Lifecycle — driven by platform presence, respecting the grace period. */
  onPlayerJoin(player: Player): void;        // mid-game joiner (plugin may bench them)
  onPlayerLeave(player: Player): void;       // grace period expired or explicit leave
  onPlayerReconnect(player: Player): void;   // returned within grace period

  /** All controller input arrives here. */
  onInput(playerId: string, input: ControllerInput): void;

  /** Optional fixed tick. Platform calls at metadata().tickRate Hz (0 = never). */
  update?(dtMs: number): void;

  destroy(): void | Promise<void>;
}

interface GameMetadata {
  id: string;              // "tap-race"
  name: string;
  version: string;         // semver; platform checks sdk compat range
  minPlayers: number;
  maxPlayers: number;
  tickRate: number;        // Hz for update(); 0 for purely event-driven games
  hostView: string;        // key the Next.js host uses for next/dynamic lookup
}

interface GameContext {
  readonly sessionId: string;

  // Output — the only ways a plugin affects the world (the Event Bus facade):
  setControllerLayout(playerId: string, layout: ControllerLayout): void;
  setHostState(state: unknown): void;        // diffed & broadcast as GAME_STATE
  endGame(results: GameResults): void;       // → platform shows results screen

  // Shared services (blueprint §7: Timer, Score, Random, Storage, Notifications):
  timers: { start(id: string, ms: number, onExpire: () => void): void; cancel(id: string): void };
  scores: { add(playerId: string, delta: number): void; get(playerId: string): number; all(): Record<string, number> };
  random: { int(min: number, max: number): number; shuffle<T>(arr: T[]): T[]; seed: string };
                                             // seeded per game instance → deterministic replays & tests
  storage: { get<T>(key: string): T | undefined; set<T>(key: string, value: T): void };  // instance-scoped scratch
  notify(target: playerId | 'host' | 'all', message: string): void;  // → NOTIFICATION toast

  logger: Logger;
}
```

Contract rules worth stating explicitly:

- Plugins are **sandbox-shaped even before sandboxing**: everything they can do
  goes through `GameContext`. No socket access, no Mongo/Redis access, no
  timers of their own (platform timers survive restarts; `setTimeout`
  wouldn't), no `Math.random` (seeded `ctx.random` keeps games replayable and
  testable).
- `setHostState` is the *only* channel to the host view; the platform handles
  snapshot/delta and reconnection replay for free.
- SDK ships a **test harness**: run a plugin headless, feed scripted inputs,
  assert on emitted layouts/state. Games become unit-testable without any
  network.

### ControllerLayout (Dynamic Controller)

TypeScript types in `packages/events`, rendered by the layout renderer in
`packages/ui` (used by the `/play` route). Phase 1 components: `buttons`,
`dpad`, `text-input`, `choice-list`, `label`, `slider`. Versioned; unknown
components render a fallback so old controllers don't crash on new games.

---

## 7. Data model — MongoDB + Redis, indexes designed in

Rule: **every query path in the codebase has a named index here.** Indexes are
declared in Mongoose schemas next to the fields they serve; `syncIndexes()`
runs at server startup, and CI fails if a schema index diverges from this
table. No collection scans in production paths.

### MongoDB collections (durable)

**`users`** — optional accounts; guests are session-scoped
```js
{ _id, displayName, avatar, email?, createdAt }
```
| Index | Type | Serves |
|---|---|---|
| `{ email: 1 }` | unique, sparse | login/account lookup (guests have no email) |
| `{ createdAt: -1 }` | — | admin/growth queries |

**`gameSessions`** — one doc per session; players embedded (bounded, ≤ max players)
```js
{ _id, code, hostTokenHash, status,            // 'lobby' | 'playing' | 'ended'
  players: [{ playerId, userId?, nickname, avatar, joinedAt, leftAt? }],
  createdAt, updatedAt, endedAt?, expiresAt? } // expiresAt set only on abandoned sessions
```
| Index | Type | Serves |
|---|---|---|
| `{ code: 1 }` | unique, partial (`status ≠ 'ended'`) | join-by-code; frees codes for reuse after end |
| `{ status: 1, updatedAt: -1 }` | — | active-session dashboards, janitor scans |
| `{ "players.userId": 1 }` | multikey | a user's session history |
| `{ expiresAt: 1 }` | TTL (`expireAfterSeconds: 0`) | auto-purge abandoned lobbies (field set → doc expires) |

**`gameInstances`** — one doc per game played inside a session
```js
{ _id, sessionId, pluginId, pluginVersion, randomSeed,
  startedAt, finishedAt?, results? }
```
| Index | Type | Serves |
|---|---|---|
| `{ sessionId: 1, startedAt: -1 }` | — | session history / results screens |
| `{ pluginId: 1, finishedAt: -1 }` | — | per-game analytics, popularity |

**`installedPlugins`** — registry the runtime loads from
```js
{ _id, pluginId, version, source,              // 'builtin' | 'marketplace'
  enabled, installedAt }
```
| Index | Type | Serves |
|---|---|---|
| `{ pluginId: 1, version: 1 }` | unique | exact plugin resolution |
| `{ enabled: 1, pluginId: 1 }` | — | "what can the host select" query |

**`achievements`** (Phase 3)
```js
{ _id, userId, achievementId, sessionId, awardedAt }
```
| Index | Type | Serves |
|---|---|---|
| `{ userId: 1, achievementId: 1 }` | unique | idempotent awards, profile page |

**`analyticsEvents`** (Phase 3, append-only)
```js
{ _id, type, sessionId, playerId?, ts, data }
```
| Index | Type | Serves |
|---|---|---|
| `{ sessionId: 1, ts: 1 }` | — | session timeline replay |
| `{ type: 1, ts: -1 }` | — | event-type dashboards |
| `{ ts: 1 }` | TTL (retention window, e.g. 90 d) | bounded collection growth |

Write pattern note: live gameplay **never** writes to Mongo on the hot path —
Redis is the live store (below); Mongo gets lifecycle writes only (session
created/ended, game started/finished, player joined/left). This keeps p95
latency independent of Mongo.

### Redis (live, sliding TTL per session)

```
session:{id}:state        hash   — status, currentGameInstanceId, hostConnected
session:{id}:players      hash   — playerId → {nickname, avatar, presence, ready, socketId}
session:{id}:scores       hash   — playerId → score
session:{id}:timers       zset   — timerId → expiry (recovered on server restart)
session:{id}:gamestate    string — last host-state snapshot (reconnect replay)
socket:{socketId}         string — reverse map → sessionId:playerId
code:{joinCode}           string — → sessionId (join-by-code lookup)
jointoken:{jti}           string — active join tokens (rotation/expiry, §4.4)
```

---

## 8. Security & scalability (blueprint §15–16, as working rules)

- All tokens signed (JWT); `hostToken` never leaves the host device; host-only
  REST/WS commands verified server-side, never by client role claims.
- Rate limiting on `POST /join` and `CONTROLLER_INPUT` (per-socket budget —
  also protects plugins from input floods).
- WSS/HTTPS everywhere, including dev (tunnel — see R1).
- The Node server stays **stateless**: all live state in Redis, so horizontal
  scaling is "add nodes + Socket.IO Redis adapter + sticky sessions"
  (Phase 4), not a redesign. CDN for game assets when the marketplace arrives.

---

## 9. Milestones (blueprint §17, with acceptance criteria)

### Phase 0 — Skeleton (small)
pnpm workspace; `packages/events` with envelope + event + layout types;
`docker-compose` (Redis + MongoDB); Fastify + Socket.IO server boots with
Mongoose schemas + `syncIndexes()` wired; Next.js app boots with the three
routes stubbed; CI (lint + typecheck + test + index-sync check).

### Phase 1 — Connectivity MVP (blueprint: sessions, QR, lobby, WebSockets)
Session create → rotating QR (§4.4) → phones join at `/play/[code]` → lobby
with live presence and **ready toggles** → host presses start → controllers
render a test JSON layout → button taps appear on the host screen.
Reconnection flow (§5) fully working. Claude-designed UI applied to lobby +
controller once available (headless components until then).

**Acceptance:** host on a laptop + two phones over Wi-Fi; join via QR in
< 10 s; ready states visible on host; lock one phone for 30 s mid-session and
resume with identity, layout, and no duplicate player; kill the host tab and
reopen with full state; p95 input→host latency measured and < 200 ms on real
iPhones + Android.

### Phase 2 — Game runtime (blueprint: plugin runtime, dynamic controller)
> **Decision (2026-07-23): the platform ships ZERO games.** Games come from
> external providers as drop-in packages (see `GAME_PROVIDER_GUIDE.md`);
> first-party games are cut from scope. Test fixtures stand in for games in CI.

Plugin Runtime (in-process), SDK (structural contract — plain-JS providers
need no platform dependency), loader discovering provider packages from
`GAMES_DIR` into the `installedPlugins` registry, timer/score/random/storage/
notify services, `GAME_SELECTED` flow, results persistence, crash containment.

**Acceptance:** two provider games played back-to-back without anyone
rescanning the QR, a crashing plugin aborts only its own game, restart
mid-game returns the session to its lobby with seats and scores intact —
all green in CI using fixture plugins.

### Phase 3 — Multi-game sessions, SDK, analytics
Multiple concurrent sessions load-tested; SDK published; analytics events
(+ TTL retention); achievements; `installedPlugins` registry drives what the
host can select.

### Phase 4 — Ecosystem (blueprint)
Third-party marketplace with `worker_threads` sandbox (D2); Redis Socket.IO
adapter + multi-node + sticky sessions; CDN asset pipeline; cloud sync;
tournament support.

---

## 10. Risks & open questions

| # | Item | Position |
|---|---|---|
| R1 | Phones on cellular can't reach a LAN dev server | Dev via tunnel (cloudflared/ngrok) from day one; QR always encodes a public HTTPS URL. |
| R2 | iOS Safari background sockets die fast | Covered by §5 grace period + visibilitychange reconnect; test on real iPhones in Phase 1 acceptance. |
| R3 | WebSockets don't fit serverless | The gateway is a standalone long-lived Node service (D4); deploy it on a persistent host (Fly/Railway/EC2/container), never as serverless functions. The Next.js app can deploy anywhere. |
| R4 | Socket.IO multi-node needs sticky sessions | Deferred to Phase 4; stateless-server rule (§8) keeps it an ops change, not a redesign. |
| R5 | Plugin misbehaviour (infinite loop, throw) | Runtime wraps every plugin call; a throwing plugin ends the game gracefully, never the session. Hard isolation in Phase 4. |
| R6 | Unindexed queries creeping in as features grow | Index table in §7 is the contract: indexes live in Mongoose schemas, `syncIndexes()` at startup, CI check; new query path ⇒ new index in the same PR. |
