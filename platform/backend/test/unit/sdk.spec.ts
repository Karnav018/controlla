import { describe, expect, it } from 'vitest';
import { rankingsFromScores } from '../../src/sdk/types';
import { createRandom } from '../../src/runtime/random';

describe('rankingsFromScores', () => {
  it('dense-ranks with ties sharing a rank', () => {
    const rankings = rankingsFromScores({ a: 5, b: 9, c: 5, d: 1 });
    expect(rankings).toEqual([
      { playerId: 'b', score: 9, rank: 1 },
      { playerId: 'a', score: 5, rank: 2 },
      { playerId: 'c', score: 5, rank: 2 },
      { playerId: 'd', score: 1, rank: 4 }
    ]);
  });

  it('handles empty scores', () => {
    expect(rankingsFromScores({})).toEqual([]);
  });
});

describe('seeded random (the Math.random plugins get instead)', () => {
  it('is deterministic per seed', () => {
    const a = createRandom('seed-1');
    const b = createRandom('seed-1');
    const c = createRandom('seed-2');
    const seqA = Array.from({ length: 20 }, () => a.int(0, 1000));
    const seqB = Array.from({ length: 20 }, () => b.int(0, 1000));
    const seqC = Array.from({ length: 20 }, () => c.int(0, 1000));
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('int stays within bounds inclusive', () => {
    const r = createRandom('bounds');
    for (let i = 0; i < 500; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('shuffle is a permutation and deterministic per seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const s1 = createRandom('shuf').shuffle(input);
    const s2 = createRandom('shuf').shuffle(input);
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
  });

  it('pick draws from the array', () => {
    const r = createRandom('pick');
    expect(['x', 'y', 'z']).toContain(r.pick(['x', 'y', 'z']));
    expect(() => r.pick([])).toThrow();
  });
});
