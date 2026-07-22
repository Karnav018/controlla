import 'dotenv/config';
import { z } from 'zod';

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGO_URL: z.string().default('mongodb://localhost:27017/controlla'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(8).default('dev-secret-change-me'),
  /** Operator login for /admin. The password default is refused in production. */
  ADMIN_EMAIL: z.string().email().default('admin@controlla.com'),
  ADMIN_PASSWORD: z.string().min(8).default('change-me-admin!'),
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  SESSION_TTL_MS: z.coerce.number().int().positive().default(86_400_000),
  GRACE_PERIOD_MS: z.coerce.number().int().positive().default(120_000),
  JOIN_TOKEN_TTL_MS: z.coerce.number().int().positive().default(900_000),
  JOIN_TOKEN_ROTATE_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_JOIN_PER_MIN: z.coerce.number().int().positive().default(10),
  WS_INPUT_RATE_PER_SEC: z.coerce.number().positive().default(20),
  WS_INPUT_BURST: z.coerce.number().int().positive().default(40),
  SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  /** Directory scanned for provider game packages (see docs/GAME_PROVIDER_GUIDE.md). */
  GAMES_DIR: z.string().default('games'),
  LOG_LEVEL: z.string().default('info')
});

export type Config = Readonly<z.infer<typeof ConfigSchema> & { corsOrigins: string[] }>;

/** Parse config from an env-like record; fails fast with readable issues. */
export function buildConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production' && cfg.JWT_SECRET === 'dev-secret-change-me') {
    throw new Error('JWT_SECRET must be set in production');
  }
  if (cfg.NODE_ENV === 'production' && cfg.ADMIN_PASSWORD === 'change-me-admin!') {
    throw new Error('ADMIN_PASSWORD must be set in production');
  }
  return Object.freeze({
    ...cfg,
    corsOrigins: cfg.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  });
}
