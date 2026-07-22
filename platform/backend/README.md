# Controlla Backend

Node.js (TypeScript) real-time server for the Controlla party-game platform:
Express 5 REST API + Socket.IO gateway + server-side game runtime, backed by
MongoDB (durable, indexed) and Redis (live state). See
`../../docs/PLATFORM_UNDERSTANDING.md` for the conceptual model and
`../../docs/IMPLEMENTATION_PLAN.md` for protocol/data-model decisions.

## Run

```bash
docker compose up -d          # Redis (host port 6381) + Mongo (host port 27018)
cp .env.example .env
pnpm install
pnpm dev                      # http://localhost:4000
```

Smoke test:

```bash
curl http://localhost:4000/healthz
curl -X POST http://localhost:4000/sessions   # → { sessionId, code, joinUrl, hostToken }
```

## Phones on real networks (QR joins)

The QR encodes `PUBLIC_WEB_URL`, so phones must be able to reach it. For dev
with real phones, run a tunnel and set it in `.env`:

```bash
cloudflared tunnel --url http://localhost:3000   # the web app URL, not this server
```

## Tests

```bash
pnpm test:unit             # no infra needed
docker compose up -d
pnpm test:integration      # real Redis (db 15) + Mongo (controlla_test), sequential files
pnpm lint && pnpm typecheck && pnpm check:emitter
```

`check:emitter` enforces the invariant that `ws/emitter.ts` is the only module
emitting on sockets — every outbound message gets a stamped envelope and a
persisted per-session seq.

## Games are provider packages — the platform ships none

Game providers drop packages into `games/` (see `games/README.md` and
`../../docs/GAME_PROVIDER_GUIDE.md`). The loader discovers them at boot,
validates their metadata, and registers them in `installedPlugins`
(enable/disable per game, no deploy). `GET /games` lists what hosts can start:

```bash
curl http://localhost:4000/games
curl -X POST http://localhost:4000/sessions/{id}/start \
  -H "authorization: Bearer $HOST_TOKEN" -H "content-type: application/json" \
  -d '{"gameId":"your-game","options":{}}'
curl http://localhost:4000/sessions/{id}/results   # game history + live leaderboard
```

When a game calls `ctx.endGame(results)`, results are (1) broadcast as
`GAME_FINISHED`, (2) pinned to the lobby snapshot as `lastResults` until the
next game starts — a host refresh on the results screen loses nothing — and
(3) finalized durably on the `gameInstances` record, queryable via
`/results` even after the session ends.

A crashing game aborts itself (`GAME_FINISHED {aborted:true}`) — never the
session. A server restart aborts in-flight rounds honestly; sessions, seats,
and scores survive.

## Layout

```
src/protocol/    Envelope, event catalogue, ControllerLayout, REST schemas (zod).
                 Single source of truth — extract to a shared package when the
                 web app lands.
src/sdk/         GamePlugin/GameContext — the provider contract (structural;
                 plain-JS games need no dependency on platform code)
src/runtime/     PluginRuntime (lifecycle, containment, GameContext), loader
                 (GAMES_DIR discovery), seeded RNG
src/http/        Express routes + middleware (validate, auth, rate limit, errors)
src/ws/          Socket.IO gateway: auth, inbound pipeline, RoomEmitter, rooms
src/bus/         EventBus + PluginRuntimePort (the Phase 4 isolation seam)
src/services/    session / player / presence / snapshot / token / timer services
src/redis/       LiveStore (all Redis access) + atomic Lua scripts + key layout
src/db/          Mongoose models — every index declared in-schema, synced at boot,
                 guarded by test/unit/indexes.spec.ts
games/           Provider game packages (drop-in; platform ships zero games)
test/            unit + integration; test/fixtures/games are example plugins
```

## Invariants the code enforces

1. Server-authoritative: clients render, the server decides.
2. All Redis access goes through `LiveStore`; presence transitions are atomic Lua.
3. Timers are durable (Redis zset); a restart mid-grace still expires seats on time.
4. Snapshot + deltas: any client rebuilds from one `SESSION_STATE`; deltas apply
   only when `seq > snapshot.seq`.
5. Every Mongo query path has a declared index (manifest-tested in CI).
6. Host-only commands are verified server-side against the minted token hash.
