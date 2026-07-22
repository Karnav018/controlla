/**
 * The complete Redis key layout (docs/IMPLEMENTATION_PLAN.md §7).
 * Every key the backend touches is minted here — no ad-hoc keys elsewhere.
 */
export const kState = (sessionId: string) => `session:${sessionId}:state`;
export const kPlayers = (sessionId: string) => `session:${sessionId}:players`;
export const kScores = (sessionId: string) => `session:${sessionId}:scores`;
export const kTimers = (sessionId: string) => `session:${sessionId}:timers`;
export const kGamestate = (sessionId: string) => `session:${sessionId}:gamestate`;
export const kSocket = (socketId: string) => `socket:${socketId}`;
export const kCode = (code: string) => `code:${code}`;
export const kJoinToken = (jti: string) => `jointoken:${jti}`;

export const TIMERS_KEY_PATTERN = 'session:*:timers';
export const TIMERS_KEY_RE = /^session:(.+):timers$/;
export const STATE_KEY_PATTERN = 'session:*:state';
export const STATE_KEY_RE = /^session:(.+):state$/;

export const sessionKeys = (sessionId: string) => [
  kState(sessionId),
  kPlayers(sessionId),
  kScores(sessionId),
  kTimers(sessionId),
  kGamestate(sessionId)
];
