import { Router } from 'express';
import { JoinRequestSchema, StartRequestSchema, type JoinRequest, type StartRequest } from '../../protocol';
import type { Config } from '../../config';
import type { LiveStore } from '../../redis/liveStore';
import type { PluginRuntimePort } from '../../bus/types';
import type { PlayerService } from '../../services/playerService';
import type { SessionService } from '../../services/sessionService';
import type { TokenService } from '../../services/tokenService';
import { requireHost, requirePlayer, detectHost, requireHostOrMaster } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { validateBody } from '../middleware/validate';
import { AppError } from '../errors';

interface RouteDeps {
  cfg: Config;
  store: LiveStore;
  tokens: TokenService;
  sessions: SessionService;
  players: PlayerService;
  runtime: PluginRuntimePort;
}

export function sessionsRouter(deps: RouteDeps): Router {
  const { cfg, store, tokens, sessions, players, runtime } = deps;
  const r = Router();
  const minute = 60_000;

  /** What game providers have made available on this platform. */
  r.get('/games', async (_req, res) => {
    res.json(await runtime.listGames());
  });

  r.post('/sessions', rateLimit(store, 'create', 10, minute), async (_req, res) => {
    res.status(201).json(await sessions.createSession());
  });

  // Typed-code fallback for players who can't scan the QR.
  r.get('/sessions/code/:code', rateLimit(store, 'code', 30, minute), async (req, res) => {
    const sessionId = await sessions.resolveCode(String(req.params.code).toUpperCase());
    if (!sessionId) throw new AppError(404, 'SESSION_NOT_FOUND');
    res.json({ sessionId });
  });

  r.get('/sessions/:id', detectHost(tokens), async (req, res) => {
    res.json(await sessions.getSummary(String(req.params.id), res.locals.isHost === true));
  });

  r.post(
    '/sessions/:id/join',
    rateLimit(store, 'join', cfg.RATE_LIMIT_JOIN_PER_MIN, minute),
    validateBody(JoinRequestSchema),
    async (req, res) => {
      res.status(201).json(await players.join(String(req.params.id), res.locals.body as JoinRequest));
    }
  );

  r.post('/sessions/:id/leave', requirePlayer(tokens), async (req, res) => {
    await players.leave(String(req.params.id), res.locals.playerId as string);
    res.status(204).end();
  });

  r.post('/sessions/:id/kick/:playerId', requireHostOrMaster(tokens, store), async (req, res) => {
    await players.leave(String(req.params.id), String(req.params.playerId));
    res.status(204).end();
  });

  r.post('/sessions/:id/start', requireHostOrMaster(tokens, store), validateBody(StartRequestSchema), async (req, res) => {
    const body = res.locals.body as StartRequest;
    await sessions.startSession(String(req.params.id), body.gameId ?? 'scribble', body.options);
    res.status(204).end();
  });

  r.post('/sessions/:id/end', requireHost(tokens), async (req, res) => {
    await sessions.endSession(String(req.params.id));
    res.status(204).end();
  });

  r.delete('/sessions/:id', requireHost(tokens), async (req, res) => {
    await sessions.endSession(String(req.params.id));
    res.status(204).end();
  });

  r.get('/sessions/:id/players', async (req, res) => {
    res.json(await players.listPlayers(String(req.params.id)));
  });

  /** Game history + live leaderboard; durable, so it also works after the session ends. */
  r.get('/sessions/:id/results', async (req, res) => {
    res.json(await sessions.getResults(String(req.params.id)));
  });

  return r;
}
