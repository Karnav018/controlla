import express from 'express';
import cors from 'cors';
import { createServer, type Server as HttpServer } from 'node:http';
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
