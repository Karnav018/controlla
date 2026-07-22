import { describe, expect, it } from 'vitest';
import { buildConfig } from '../../src/config';

describe('config', () => {
  it('applies dev defaults', () => {
    const cfg = buildConfig({});
    expect(cfg.PORT).toBe(4000);
    expect(cfg.GRACE_PERIOD_MS).toBe(120_000);
    expect(cfg.corsOrigins).toEqual(['http://localhost:3000']);
  });

  it('coerces numeric env strings', () => {
    const cfg = buildConfig({ GRACE_PERIOD_MS: '5000', PORT: '9999' });
    expect(cfg.GRACE_PERIOD_MS).toBe(5000);
    expect(cfg.PORT).toBe(9999);
  });

  it('splits CORS_ORIGINS on commas', () => {
    const cfg = buildConfig({ CORS_ORIGINS: 'https://a.com, https://b.com' });
    expect(cfg.corsOrigins).toEqual(['https://a.com', 'https://b.com']);
  });

  it('refuses the default JWT secret in production', () => {
    expect(() => buildConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('rejects invalid values with readable issues', () => {
    expect(() => buildConfig({ PUBLIC_WEB_URL: 'not-a-url' })).toThrow(/PUBLIC_WEB_URL/);
  });
});
