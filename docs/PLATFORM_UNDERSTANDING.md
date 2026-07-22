# Controlla — Platform Understanding

> Orientation document for anyone (human or Claude Code) working on this
> codebase. This is the **conceptual model** of the platform — what it is, how
> data flows, and the invariants that must never break. It deliberately covers
> no visual/UI design (that arrives separately) and no scheduling (see
> `IMPLEMENTATION_PLAN.md` for milestones and decision rationale).

---

## 1. What Controlla is

Controlla is **a platform for consoles, not games**. It is not a game, and it
does not draw games: phones become consoles, screens become stages, and every
pixel of gameplay — the main screen AND the phone console — belongs to the
game itself. The platform delivers the connectivity underneath: sessions,
identity, reconnection, and the input wire.

A host device (TV / laptop browser) creates a **Game Session**. Players scan a
QR code with their phones, and each phone becomes a **controller**. Games are
**plugins** that run *inside* the session — the platform gives them players,
input, timers, scores, and screens; they give back rules and gameplay. Players
join once and stay connected while any number of games are played back to back.

The division of labor is absolute:

| Platform owns | Plugins own |
|---|---|
| Sessions, joining, QR, auth | Game rules |
| WebSocket connectivity, reconnection | Winner calculation |
| Presence, ready states, player identity | Game-specific visuals (host view) |
| Controller rendering (from JSON layouts) | What the controller layout *contains* |
| Event routing, timers, scores, RNG, storage | How those services are *used* |

If a change makes the platform aware of a game rule, or a game aware of a
socket, it is architecturally wrong.

---

## 2. Vocabulary

- **Game Session** — the top-level container. One host, N players, sequence of
  games. Identified by `sessionId` and a 6-char join `code`.
- **Host** — the big screen. A client like any other, authenticated by
  `hostToken`. It renders; it never decides.
- **Player** — a participant with identity (`playerId`, nickname, avatar) that
  persists across games and disconnects.
- **Controller** — the player's phone: the `/play/[code]` PWA. Renders JSON
  layouts sent by the platform; emits input events. Runs zero game code, ever.
- **Game Plugin** — an installable game package (TypeScript).
- **Game Instance** — one execution of a plugin inside a session (quiz round 1
  and quiz round 2 are two instances of the same plugin).
- **Plugin Runtime** — the server component that loads plugins, drives their
  lifecycle, and brokers everything they do.
- **Event Bus** — the routing spine: `Controller → Platform → Plugin →
  Platform → Host`. Nothing bypasses it.

---

## 3. Topology — three processes, two stores

```
  Next.js web app (apps/web)              Node real-time server (server/)
  ┌────────────────────────┐              ┌─────────────────────────────┐
  │ /host/[sessionId]      │◄─ WS/REST ──►│ Fastify REST API            │
  │ /play/[code]  (PWA)    │              │ Socket.IO gateway           │
  │ /              landing │              │ Session / Player managers   │
  └────────────────────────┘              │ Event Bus                   │
                                          │ Plugin Runtime ── games/*   │
                                          │ Shared services             │
                                          └──────────┬──────────────────┘
                                                     │
                                     ┌───────────────┴───────────────┐
                                     │ Redis (live state, hot path)  │
                                     │ MongoDB (durable, lifecycle)  │
                                     └───────────────────────────────┘
```

- **The web app is dumb.** Both host and controller routes are renderers of
  server-sent state. The controller renders `ControllerLayout` JSON; the host
  renders lobby/session chrome plus the current game's host-view React
  component (loaded via `next/dynamic`, keyed by plugin id).
- **The Node server is the only authority.** It is a long-lived process (never
  serverless) because it owns every socket and runs every game.
- **The server is stateless between requests.** Everything live is in Redis;
  any server restart (or, later, any node in a cluster) can rebuild from Redis.

---

## 4. The authority model — why the server runs the games

Controlla is **server-authoritative**. Game logic executes inside the Plugin
Runtime on the server. Consequences that shape everything:

- A controller can only *claim* input; the plugin decides what it means. No
  client can cheat.
- The host screen crashing or refreshing loses nothing — it reconnects and
  receives a state snapshot. Host migration = a new device presenting the same
  `hostToken`.
- Input latency is a round trip (phone → server → host, ~50–150 ms). Games are
  therefore designed for party-genre timing, not twitch precision. This is a
  stated platform constraint, not a bug.

---

## 5. The four flows that define the platform

### 5.1 Session birth & join

1. Host device: `POST /sessions` → `{ sessionId, code, joinUrl, hostToken }`.
2. Host screen shows a QR of `joinUrl`, which embeds a short-lived, rotating
   **join token** (stale screenshots can't join later).
3. Phone opens `/play/[code]`, submits nickname → `POST /join` → receives
   `{ playerId, playerToken }`. The `playerToken` goes to `localStorage` — it
   is the player's *resume credential* for the whole session.
4. Controller opens a socket authenticated with `playerToken`; server places it
   in the session's Socket.IO room; everyone gets `PLAYER_CONNECTED`; the
   joiner gets a full `SESSION_STATE` snapshot.

### 5.2 The gameplay loop (the platform's heartbeat)

```
phone tap
  → CONTROLLER_INPUT over socket
    → gateway validates (auth, rate limit, seq)
      → Event Bus routes to Plugin Runtime
        → plugin.onInput(playerId, input)          // game logic runs
          → plugin calls ctx.setHostState(...) / ctx.setControllerLayout(...)
            → platform diffs & broadcasts GAME_STATE to host,
              CONTROLLER_LAYOUT to the affected player(s)
```

Plus, for tick-based games: the runtime calls `plugin.update(dt)` at the
plugin's declared `tickRate`. Every message rides one envelope
(`{v, type, sessionId, senderId, seq, ts, payload}`); `ts` feeds latency
metrics, `seq` gives idempotency/ordering per sender.

### 5.3 Reconnection (the most important flow in the codebase)

Phones lock constantly; this flow is why the product feels reliable:

- Socket drops → player marked `disconnected`, keeps seat/score/identity for a
  **grace period** (default 120 s). Plugins are *not* told "leave".
- Phone returns (controller reconnects on `visibilitychange`/`online` with its
  stored `playerToken`) → server rebinds the socket, emits
  `PLAYER_RECONNECTED`, sends that client a fresh snapshot
  (`SESSION_STATE` + its current `CONTROLLER_LAYOUT`). Plugin sees
  `onPlayerReconnect`.
- Grace expires → *now* it's a real departure: `PLAYER_LEFT`, plugin gets
  `onPlayerLeave`.
- The universal rule: **snapshot + deltas**. No client is ever expected to
  have witnessed history; any client at any moment can be rebuilt from one
  snapshot. If a feature can't survive that rule, the feature is designed
  wrong.

### 5.4 Game switching

Host selects a game (`HOST_COMMAND`) → runtime `destroy()`s the old instance,
loads the plugin, creates a new Game Instance (with a fresh random seed),
calls `init(ctx, players)` → plugins push initial layouts/state → `GAME_STARTED`.
**Players never rescan, never rejoin, never lose identity.** The session
outlives every game inside it. When a game calls `ctx.endGame(results)`, the
platform shows results and returns to selection.

---

## 6. What a game plugin actually is

One plugin = **three faces**, strictly separated:

1. **Logic** (`games/<id>/logic/`) — TypeScript class implementing
   `GamePlugin`, executed by the server. Its *only* window to the world is
   `GameContext`: layouts out, host state out, endGame out; timers, scores,
   seeded RNG, scratch storage, notifications as services in. No sockets, no
   DB, no `setTimeout`, no `Math.random` — the runtime provides survivable,
   deterministic versions of all of these.
2. **Host view** (`games/<id>/host-view/`) — a React component that renders
   whatever the logic put in `setHostState`. Pure function of that state (it
   must render correctly from any single snapshot — see 5.3).
3. **Controller layout** — not code at all: JSON the logic emits, drawn by the
   platform's layout renderer (`packages/ui`). Component set: `buttons`,
   `dpad`, `text-input`, `choice-list`, `label`, `slider` (versioned; unknown
   components degrade gracefully).

Because every plugin effect flows through `GameContext`, plugins are
*sandbox-shaped* today and can be moved into `worker_threads` isolation later
without changing a single game.

---

## 7. Where state lives (and the rule that keeps it fast)

| State | Store | Why |
|---|---|---|
| Presence, ready flags, scores, timers, current game, last game-state snapshot, socket↔player maps, join tokens | **Redis** (sliding TTL) | Hot path; rebuilt-from on every reconnect; survives server restart |
| Sessions, players roster, game instances + results, plugin registry, users, achievements, analytics | **MongoDB** | Durable history; lifecycle writes only |

The hot-path rule: **gameplay never writes to Mongo.** Mongo sees lifecycle
moments (session created/ended, game started/finished, player joined/left);
Redis sees everything per-tick and per-input. This keeps input latency
independent of Mongo entirely.

Second DB rule: **every Mongo query path has a declared index** (schemas carry
them, `syncIndexes()` runs at startup, CI verifies). A new query in a PR means
a new index in the same PR. The full index table lives in
`IMPLEMENTATION_PLAN.md` §7.

---

## 8. Invariants — never break these

1. **Platform knows no game rules; games know no infrastructure.** The
   `GameContext` boundary is the whole architecture.
2. **The session outlives its games.** Any change that forces a reconnect or
   identity loss on game switch is a regression.
3. **Any client, at any moment, can be rebuilt from one snapshot.** Snapshot +
   deltas, everywhere, always.
4. **The platform owns the console connection; the game owns the console
   pixels.** A game may bring its own phone UI (`controllerViewUrl`, embedded
   and bridged) or lean on the platform's generic layout components — either
   way the socket, identity, grace window, and input transport are always the
   platform's, and joining once works for N games.
5. **Only the server decides.** Host and controllers are I/O devices.
6. **The Node server holds no state outside Redis.** Restartable, clusterable.
7. **Gameplay hot path touches Redis only; every Mongo query is indexed.**
8. **Host-only commands are verified server-side** (token, not client claims);
   join/input paths are rate-limited.

---

## 9. Repo map (what lives where)

```
apps/web/            Next.js — /, /host/[sessionId], /play/[code] (PWA controller)
server/              Node — Fastify REST, Socket.IO gateway, managers, Event Bus,
                     Plugin Runtime, shared services, Mongoose schemas (+indexes)
packages/events/     THE contract: envelope, event types, ControllerLayout types.
                     Imported by web, server, and every game. Change with care.
packages/sdk/        GamePlugin + GameContext interfaces, plugin test harness
packages/ui/         ControllerLayout renderer + headless shared components
games/<id>/          logic/ (server-side) + host-view/ (React) per game
docs/                this file; IMPLEMENTATION_PLAN.md (decisions, indexes, phases)
```

Reading order for a new session: this file → `IMPLEMENTATION_PLAN.md` →
`packages/events` (once it exists) — the events package is the executable form
of everything described here.
