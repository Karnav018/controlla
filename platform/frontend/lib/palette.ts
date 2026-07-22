/** Deterministic visual identity, derived client-side (the design's palette). */

const PLAYER_COLORS = [
  '#f43f6b', '#f59e0b', '#22d3ee', '#a855f7', '#84cc16', '#38bdf8',
  '#fb7185', '#34d399', '#c084fc', '#facc15', '#2dd4bf', '#fb923c'
];

const GAME_TINTS = [
  'oklch(0.82 0.17 130)', 'oklch(0.78 0.15 210)', 'oklch(0.72 0.2 300)',
  'oklch(0.7 0.2 25)', 'oklch(0.78 0.15 160)', 'oklch(0.72 0.18 285)'
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export const playerColor = (playerId: string) => PLAYER_COLORS[hash(playerId) % PLAYER_COLORS.length]!;
export const gameTint = (gameId: string) => GAME_TINTS[hash(gameId) % GAME_TINTS.length]!;
export const initialOf = (name: string) => (name.trim()[0] ?? '?').toUpperCase();
