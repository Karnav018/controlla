import { Router, json } from 'express';
import { AdminGamePatchSchema, AdminInstallSchema, AdminLoginSchema } from '../../protocol';
import type { AdminService } from '../../services/adminService';
import type { SessionService } from '../../services/sessionService';
import type { TokenService } from '../../services/tokenService';
import type { LiveStore } from '../../redis/liveStore';
import { requireAdmin } from '../middleware/adminAuth';
import { rateLimit } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';

interface AdminRouteDeps {
  store: LiveStore;
  tokens: TokenService;
  admin: AdminService;
  sessions: SessionService;
}

export function adminRouter(deps: AdminRouteDeps): Router {
  const { store, tokens, admin, sessions } = deps;
  const r = Router();

  // Own body parser: game-module uploads exceed the global 16kb limit.
  // Mounted before the global parser in app.ts, so this one wins for /admin.
  r.use('/admin', json({ limit: '2mb' }));

  // Login is the only unauthenticated admin route — and it's brute-force limited.
  r.post(
    '/admin/login',
    rateLimit(store, 'adminlogin', 5, 60_000),
    validateBody(AdminLoginSchema),
    (_req, res) => {
      const { email, password } = res.locals.body as { email: string; password: string };
      res.json(admin.login(email, password));
    }
  );

  r.use('/admin', requireAdmin(tokens));

  r.get('/admin/games', async (_req, res) => {
    res.json(await admin.listGames());
  });

  /** The live kill switch + featured pin — no restart, no deploy. */
  r.patch('/admin/games/:pluginId', validateBody(AdminGamePatchSchema), async (req, res) => {
    const flags = res.locals.body as { enabled?: boolean; featured?: boolean };
    res.json(await admin.setGameFlags(String(req.params.pluginId), flags));
  });

  /** Danger zone: deregister + delete the package from disk. */
  r.delete('/admin/games/:pluginId', async (req, res) => {
    await admin.uninstallGame(String(req.params.pluginId));
    res.status(204).end();
  });

  r.get('/admin/activity', async (_req, res) => {
    res.json(await admin.activity());
  });

  r.get('/admin/config', (_req, res) => {
    res.json(admin.config());
  });

  /** Live install: upload a provider module, validated + registered without a restart. */
  r.post('/admin/games/install', validateBody(AdminInstallSchema), async (_req, res) => {
    const { dirName, code } = res.locals.body as { dirName: string; code: string };
    res.status(201).json(await admin.installGame(dirName, code));
  });

  /** Pick up packages dropped into GAMES_DIR on disk since boot. */
  r.post('/admin/games/rescan', async (_req, res) => {
    res.json(await admin.rescanGames());
  });

  r.get('/admin/sessions', async (_req, res) => {
    res.json(await admin.listSessions());
  });

  /** Moderation: force-end a session (also cleans stale Mongo-only sessions). */
  r.delete('/admin/sessions/:id', async (req, res) => {
    await sessions.endSession(String(req.params.id));
    res.status(204).end();
  });

  r.get('/admin/stats', async (_req, res) => {
    res.json(await admin.stats());
  });

  return r;
}
