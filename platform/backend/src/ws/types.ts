/** Attached to socket.data by the auth middleware; per-connection ephemera only. */
export interface SocketData {
  sessionId: string;
  role: 'host' | 'player';
  /** '' for the host. */
  playerId: string;
  /** Client-seq guard state, scoped to this connection. */
  lastSeq: number;
}
