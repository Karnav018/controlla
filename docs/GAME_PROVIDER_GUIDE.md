# Game Provider Guide — launching your game on Controlla

Controlla is an operating system for party games. The platform owns sessions,
QR joining, phone controllers, reconnection, and event routing. **It ships
zero games.** Games come from providers like you, as installable packages.

This guide is the integration contract for the current (in-process) runtime.

---

## 1. The mental model

Your game is a **server-side plugin**. It never touches sockets, databases, or
phones directly:

```
player phone ──input──▶ Controlla platform ──onInput()──▶ YOUR GAME
YOUR GAME ──ctx.setControllerLayout()──▶ platform ──renders──▶ player phone
YOUR GAME ──ctx.setHostState()────────▶ platform ──────────▶ host/TV screen
```

- **Controllers are declarative.** You emit JSON layouts (`buttons`, `dpad`,
  `text-input`, `choice-list`, `label`, `slider`); the platform renders them
  on phones and routes taps back to you as `onInput`. You never write
  controller UI code.
- **The host screen renders your state.** Whatever you pass to
  `setHostState()` is broadcast to the big screen (your host view on the web
  app renders it — that part of the contract lands with the frontend).
- **The platform owns players.** Joining, identity, disconnects, reconnects,
  and the grace window are handled before you hear about anything. You get
  `onPlayerLeave` only for *real* departures.

## 2. The contract (structural — no dependency on us)

Your package exports a factory. TypeScript types are available in
`backend/src/sdk/types.ts` (npm package `@controlla/game-sdk` planned), but
they're compile-time only — **plain JavaScript that matches the shape is a
valid game**:

```js
// games/reaction-duel/index.js
export function createPlugin() {
  let ctx;
  return {
    metadata() {
      return {
        id: 'reaction-duel',        // lowercase-kebab, unique on the platform
        name: 'Reaction Duel',
        version: '1.0.0',           // semver
        description: 'Tap first when the screen turns green',
        minPlayers: 2,
        maxPlayers: 8,
        tickRate: 0                 // Hz for update(); 0 = event-driven
      };
    },
    async init(context, players) {
      ctx = context;
      await ctx.setAllControllerLayouts({
        layoutVersion: 1,
        components: [{ kind: 'buttons', id: 'pad', buttons: [{ id: 'go', label: 'GO!' }] }]
      });
      ctx.timers.start('green', 1000 + ctx.random.int(0, 3000), () => {
        void ctx.setHostState({ phase: 'green', at: Date.now() });
      });
    },
    async onInput(playerId, input) {
      if (input.controlId !== 'go') return;
      await ctx.scores.add(playerId, 1);
      await ctx.endGame({ rankings: [{ playerId, score: 1, rank: 1 }] });
    },
    onPlayerJoin(player) {},        // mid-game joiner — seat or bench them
    onPlayerLeave(player) {},       // real departure (leave or grace expired)
    onPlayerReconnect(player) {},   // came back within grace; layout replay is automatic
    update(dtMs) {},                // only called if tickRate > 0
    destroy() {}                    // optional cleanup
  };
}
```

### Everything you can do lives on `ctx`

| API | What it does |
|---|---|
| `setControllerLayout(playerId, layout)` / `setAllControllerLayouts(layout)` | Push phone UI (validated against the layout schema) |
| `setHostState(state)` | Broadcast host-screen state; persisted, replayed on reconnects |
| `endGame({ rankings, detail })` | Finish the game. The platform broadcasts `GAME_FINISHED` with your results, keeps them on the lobby snapshot (`lastResults` — survives host refreshes) until the next game starts, and stores them durably per instance (`GET /sessions/{id}/results`, newest first, with the session leaderboard) |
| `timers.start(id, ms, cb)` / `timers.cancel(id)` | Game timers — auto-cleaned on game end. **Never `setTimeout`** |
| `scores.add/get/all` | Session leaderboard — accumulates across games |
| `random.int/pick/shuffle` | Seeded per instance (deterministic replays). **Never `Math.random`** |
| `storage.get/set` | Instance-scoped scratch space |
| `notify(playerId \| 'host' \| 'all', message)` | Toast messages |
| `players()` | Current roster |
| `logger` | Structured logging, tagged with your game + instance |

### Rules

1. Everything goes through `ctx` — no network, no filesystem, no globals.
   (Today this is convention; the sandboxed runtime will make it mechanical.)
2. Crashing is survivable but rude: any throw aborts *your* game
   (`GAME_FINISHED {aborted: true}`) — never the session.
3. Design for a network round trip per input (~50–150 ms). Party-game timing,
   not twitch timing.
4. A server restart aborts in-flight rounds (state is in-process); sessions,
   seats and scores survive. Keep rounds short; persist nothing yourself.

## 3. Shipping it

1. Put your package in the platform's `backend/games/` directory:
   `games/<your-game>/index.js` (or `index.mjs` / `index.ts` /
   `package.json` `"main"`).
2. Restart the backend. The loader validates your `metadata()` and hooks,
   registers the game, and upserts it into the `installedPlugins` registry
   (`source: 'local'`, enabled by default). Invalid packages are skipped with
   an error log — you can't break the platform boot.
3. Your game now appears in `GET /games` and hosts can start it:
   `POST /sessions/{id}/start { "gameId": "reaction-duel", "options": {...} }`
   (`options` is yours — validate it yourself in `init`).
4. Operators can pull your game live via `installedPlugins.enabled = false` —
   no deploy.

## 4. Testing your game

The integration fixtures under `backend/test/fixtures/games/` are working
examples (echo, mini-race, crash-test). Boot the platform with
`GAMES_DIR` pointed at your directory and drive it with any Socket.IO client —
or copy the patterns in `backend/test/integration/06-runtime.spec.ts`, which
plays a full game (join → layouts → inputs → results) with no frontend.

## 5. Roadmap for providers

| Stage | What changes for you |
|---|---|
| Now | Drop-in directory, in-process execution (trusted providers) |
| Marketplace | Submit as an npm package / upload; versioned installs, review flow |
| Sandboxing | Same contract, executed in `worker_threads` — untrusted code welcome |
| Host views | Ship a React component for the big screen alongside your logic (frontend contract, arrives with the web app) |
| Remote games | Optional out-of-process model: your servers implement the same port over the wire, any language |
