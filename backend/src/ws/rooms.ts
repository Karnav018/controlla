export const roomSession = (sessionId: string) => `s:${sessionId}`;
export const roomHost = (sessionId: string) => `s:${sessionId}:host`;
export const roomPlayer = (sessionId: string, playerId: string) => `s:${sessionId}:p:${playerId}`;
