/**
 * Deterministic PRNG seeded from the game instance's randomSeed. Same seed →
 * same sequence, so game rounds are replayable and unit-testable. Plugins are
 * forbidden Math.random by contract; this is what they get instead.
 */
export interface SeededRandom {
  seed: string;
  int(min: number, max: number): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
}

function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32 */
export function createRandom(seed: string): SeededRandom {
  let a = hashSeed(seed);
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    int(min: number, max: number): number {
      if (max < min) throw new Error('random.int: max < min');
      return min + Math.floor(next() * (max - min + 1));
    },
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('random.pick: empty array');
      return arr[this.int(0, arr.length - 1)]!;
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = this.int(0, i);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    }
  };
}
