/** Client → server event types. JOIN happens via REST + socket auth, not as a message. */
export const ClientEvents = {
  PLAYER_READY: 'PLAYER_READY',
  CONTROLLER_INPUT: 'CONTROLLER_INPUT',
  HOST_COMMAND: 'HOST_COMMAND',
  LEAVE: 'LEAVE',
  PING: 'PING'
} as const;
export type ClientEventType = (typeof ClientEvents)[keyof typeof ClientEvents];

/** Server → client event types. SESSION_STATE is the snapshot; everything else is a delta. */
export const ServerEvents = {
  SESSION_STATE: 'SESSION_STATE',
  PLAYER_CONNECTED: 'PLAYER_CONNECTED',
  PLAYER_READY: 'PLAYER_READY',
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED',
  PLAYER_RECONNECTED: 'PLAYER_RECONNECTED',
  PLAYER_LEFT: 'PLAYER_LEFT',
  CONTROLLER_LAYOUT: 'CONTROLLER_LAYOUT',
  GAME_SELECTED: 'GAME_SELECTED',
  GAME_LOADED: 'GAME_LOADED',
  GAME_STARTED: 'GAME_STARTED',
  GAME_STATE: 'GAME_STATE',
  GAME_FINISHED: 'GAME_FINISHED',
  SESSION_ENDED: 'SESSION_ENDED',
  NOTIFICATION: 'NOTIFICATION'
} as const;
export type ServerEventType = (typeof ServerEvents)[keyof typeof ServerEvents];

/** The single socket.io event name both directions; envelope.type discriminates. */
export const WIRE_EVENT = 'msg';
