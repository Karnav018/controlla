import type { Server } from 'socket.io';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { LiveStore } from '../redis/liveStore';
import type { EventBus } from '../bus/eventBus';
import type { PresenceService } from '../services/presenceService';
import type { TokenService } from '../services/tokenService';
import type { RoomEmitter } from './emitter';
import { socketAuthMiddleware } from './auth';
import { attachInbound } from './inbound';

interface GatewayDeps {
  cfg: Config;
  log: Logger;
  store: LiveStore;
  tokens: TokenService;
  presence: PresenceService;
  bus: EventBus;
  emitter: RoomEmitter;
}

export function attachGateway(io: Server, deps: GatewayDeps): void {
  io.use(socketAuthMiddleware(deps.tokens, deps.store));
  io.on('connection', (socket) => {
    attachInbound(socket, deps);
    socket.on('disconnect', () => {
      void deps.presence.handleDisconnect(socket);
    });
    void deps.presence.handleConnect(socket);
  });
}
