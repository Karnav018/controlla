import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { createServer, type Server as HttpServer } from 'node:http';
import { AppError } from './http/errors';
import { Server as SocketIOServer } from 'socket.io';
import { pinoHttp } from 'pino-http';
import type { Deps } from './container';
import { sessionsRouter } from './http/routes/sessions';
import { adminRouter } from './http/routes/admin';
import { errorHandler } from './http/middleware/errorHandler';
import { attachGateway } from './ws/gateway';

export interface BuiltServer {
  app: express.Express;
  httpServer: HttpServer;
  io: SocketIOServer;
  close(): Promise<void>;
}

export function buildServer(deps: Deps): BuiltServer {
  const { cfg, log } = deps;

  const app = express();
  app.set('trust proxy', true);

  // HTTP middleware stack, in order: logging → CORS → body parsing →
  // (per-route: rate limit → auth → validation) → routes → error handler.
  if (cfg.NODE_ENV !== 'test') {
    app.use(pinoHttp({ logger: log }));
  }
  app.use(cors({ origin: cfg.corsOrigins }));
  // Admin router first: it carries its own 2mb parser for game-module
  // uploads; the global 16kb parser below skips already-parsed bodies.
  app.use(
    adminRouter({
      store: deps.store,
      tokens: deps.tokens,
      admin: deps.admin,
      sessions: deps.sessions
    })
  );
  app.use(express.json({ limit: '16kb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  // Installed games can ship their own UI pages (host view / phone console)
  // inside their package; the platform serves them here. The game's pixels
  // stay the game's — the platform is just the CDN.
  app.use('/games/:gameId/assets', (req, res, next) => {
    const dir = deps.loader.dirOf(String(req.params.gameId ?? ''));
    if (!dir) return next(new AppError(404, 'GAME_NOT_FOUND'));
    const rel = decodeURIComponent(req.path).replace(/^\/+/, '');
    const file = path.resolve(dir, rel || 'index.html');
    if (!file.startsWith(dir + path.sep)) return next(new AppError(403, 'FORBIDDEN'));
    res.sendFile(file, { dotfiles: 'deny' }, (err) => {
      if (err && !res.headersSent) next(new AppError(404, 'ASSET_NOT_FOUND'));
    });
  });
  app.use(
    sessionsRouter({
      cfg,
      store: deps.store,
      tokens: deps.tokens,
      sessions: deps.sessions,
      players: deps.players,
      runtime: deps.runtime
    })
  );
  app.use(errorHandler(log));

  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: { origin: cfg.corsOrigins }
  });
  deps.emitter.bind(io);
  attachGateway(io, deps);

  const close = async (): Promise<void> => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  };

  return { app, httpServer, io, close };
}
