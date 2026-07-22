# controlla

An operating system for party games: a host screen creates a session, players
scan a QR and their phones become controllers, and games run as provider
plugins on the platform. The platform ships zero games.

```
backend/    Node.js (TypeScript) — Express 5 + Socket.IO, MongoDB + Redis,
            server-authoritative game runtime, plugin loader, admin API
frontend/   Next.js — host screen (/host), phone controller (/play/[code]),
            operator panel (/admin)
docs/       Platform understanding, implementation plan, game provider guide
```

## Quick start

```bash
# backend
cd backend
docker compose up -d          # Redis (6381) + Mongo (27018)
cp .env.example .env
pnpm install && pnpm dev      # http://localhost:4000

# frontend
cd ../frontend
cp .env.local.example .env.local
pnpm install && pnpm dev      # http://localhost:3000/host
```

See `backend/README.md` for tests, invariants, and LAN/phone setup, and
`docs/GAME_PROVIDER_GUIDE.md` for how game providers launch their games here.
