import type { ErrorRequestHandler } from 'express';
import type { Logger } from '../../logger';
import { AppError } from '../errors';

/** Terminal middleware: typed AppError → status mapping; opaque 500 otherwise. */
export function errorHandler(log: Logger): ErrorRequestHandler {
  return (err, _req, res, _next) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.code, message: err.message });
      return;
    }
    if ((err as { type?: string })?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'BAD_JSON' });
      return;
    }
    log.error({ err }, 'unhandled http error');
    res.status(500).json({ error: 'INTERNAL' });
  };
}
