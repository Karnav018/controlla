import { describe, expect, it } from 'vitest';
import { buildConfig } from '../../src/config';
import { TokenService } from '../../src/services/tokenService';
import type { LiveStore } from '../../src/redis/liveStore';

/** In-memory stand-in for the two LiveStore methods TokenService uses. */
function fakeStore(): LiveStore {
  const jtis = new Map<string, string>();
  return {
    storeJoinToken: async (jti: string, sessionId: string) => {
      jtis.set(jti, sessionId);
    },
    checkJoinToken: async (jti: string) => jtis.get(jti) ?? null
  } as unknown as LiveStore;
}

const cfg = buildConfig({ JWT_SECRET: 'unit-test-secret-123' });

describe('TokenService', () => {
  it('round-trips host and player tokens', () => {
    const tokens = new TokenService(cfg, fakeStore());
    const host = tokens.verifyClientToken(tokens.issueHostToken('s1'));
    expect(host).toEqual({ role: 'host', sessionId: 's1' });
    const player = tokens.verifyClientToken(tokens.issuePlayerToken('s1', 'p1'));
    expect(player).toEqual({ role: 'player', sessionId: 's1', playerId: 'p1' });
  });

  it('role confusion: a player token is never a host token, and join tokens are neither', async () => {
    const tokens = new TokenService(cfg, fakeStore());
    const playerToken = tokens.issuePlayerToken('s1', 'p1');
    expect(tokens.verifyClientToken(playerToken)?.role).toBe('player');

    const { token: joinToken } = await tokens.issueJoinToken('s1');
    expect(tokens.verifyClientToken(joinToken)).toBeNull();
    // and a player token is not a join token
    expect(await tokens.verifyJoinToken(playerToken)).toBeNull();
  });

  it('join tokens bind to their session and are shared (validate-only)', async () => {
    const tokens = new TokenService(cfg, fakeStore());
    const { token } = await tokens.issueJoinToken('s1');
    expect(await tokens.verifyJoinToken(token)).toBe('s1');
    // multiple phones scan the same QR — verification must not consume it
    expect(await tokens.verifyJoinToken(token)).toBe('s1');
  });

  it('rejects tokens signed with a different secret', () => {
    const tokens = new TokenService(cfg, fakeStore());
    const other = new TokenService(buildConfig({ JWT_SECRET: 'other-secret-456' }), fakeStore());
    expect(other.verifyClientToken(tokens.issueHostToken('s1'))).toBeNull();
  });

  it('rejects garbage tokens', () => {
    const tokens = new TokenService(cfg, fakeStore());
    expect(tokens.verifyClientToken('not.a.jwt')).toBeNull();
    expect(tokens.verifyClientToken('')).toBeNull();
  });

  it('hashToken is stable and hex', () => {
    const tokens = new TokenService(cfg, fakeStore());
    const h = tokens.hashToken('abc');
    expect(h).toBe(tokens.hashToken('abc'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
