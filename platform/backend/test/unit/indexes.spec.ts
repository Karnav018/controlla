import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/db/models/gameSession';
import { GameInstance } from '../../src/db/models/gameInstance';
import { User } from '../../src/db/models/user';
import { InstalledPlugin } from '../../src/db/models/installedPlugin';

/**
 * The index manifest — the CI guard for the "every query path is indexed"
 * contract (docs/IMPLEMENTATION_PLAN.md §7). syncIndexes() at boot is
 * destructive, so a schema edit that would drop one of these must fail HERE,
 * before it ever reaches a database. New query path ⇒ new index ⇒ update this
 * manifest in the same PR.
 */
const MANIFEST: Record<string, Array<{ keys: Record<string, unknown>; options?: Record<string, unknown> }>> = {
  GameSession: [
    { keys: { code: 1 }, options: { unique: true, partialFilterExpression: { active: true } } },
    { keys: { status: 1, updatedAt: -1 } },
    { keys: { 'players.userId': 1 } },
    { keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } }
  ],
  GameInstance: [
    { keys: { sessionId: 1, startedAt: -1 } },
    { keys: { pluginId: 1, finishedAt: -1 } },
    { keys: { startedAt: -1 } }
  ],
  User: [
    { keys: { email: 1 }, options: { unique: true, sparse: true } },
    { keys: { createdAt: -1 } }
  ],
  InstalledPlugin: [
    { keys: { pluginId: 1, version: 1 }, options: { unique: true } },
    { keys: { enabled: 1, pluginId: 1 } },
    { keys: { installedAt: -1 } }
  ]
};

const models = { GameSession, GameInstance, User, InstalledPlugin };

describe('index manifest', () => {
  for (const [name, expected] of Object.entries(MANIFEST)) {
    it(`${name} declares exactly the manifest indexes`, () => {
      const actual = models[name as keyof typeof models].schema.indexes();
      expect(actual.length, `${name}: index count`).toBe(expected.length);

      for (const want of expected) {
        const match = actual.find(([keys]) => JSON.stringify(keys) === JSON.stringify(want.keys));
        expect(match, `${name}: missing index ${JSON.stringify(want.keys)}`).toBeTruthy();
        const [, gotOptions] = match!;
        for (const [opt, value] of Object.entries(want.options ?? {})) {
          expect((gotOptions as Record<string, unknown>)[opt], `${name} ${JSON.stringify(want.keys)} option ${opt}`).toEqual(value);
        }
      }
    });
  }
});
