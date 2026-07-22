import { pino, type Logger } from 'pino';
import type { Config } from './config';

export type { Logger };

export function buildLogger(cfg: Config): Logger {
  return pino({
    level: cfg.NODE_ENV === 'test' ? 'silent' : cfg.LOG_LEVEL,
    base: undefined
  });
}
