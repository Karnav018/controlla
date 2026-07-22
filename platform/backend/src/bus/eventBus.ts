import type { Socket } from 'socket.io';
import type { ClientEnvelope } from '../protocol';
import type { Logger } from '../logger';
import type { PluginRuntimePort } from './types';
import type { PlayerService } from '../services/playerService';
import type { SessionService } from '../services/sessionService';
import type { SocketData } from '../ws/types';
import { AppError } from '../http/errors';

/**
 * Routes validated client envelopes: Controller → Platform → Plugin.
 * Role checks happen HERE against the socket's verified token identity —
 * never against anything the client claims in the envelope.
 */
export class EventBus {
  constructor(
    private runtime: PluginRuntimePort,
    private players: PlayerService,
    private sessions: SessionService,
    private log: Logger
  ) {}

  async dispatch(socket: Socket, env: ClientEnvelope): Promise<void> {
    const { sessionId, role, playerId } = socket.data as SocketData;

    switch (env.type) {
      case 'CONTROLLER_INPUT':
        if (role !== 'player') return this.deny(env, role);
        await this.runtime.onInput(sessionId, playerId, env.payload);
        return;

      case 'PLAYER_READY':
        if (role !== 'player') return this.deny(env, role);
        await this.players.setReady(sessionId, playerId, env.payload.ready);
        return;

      case 'HOST_COMMAND': {
        if (role !== 'host') return this.deny(env, role);
        const { command, gameId, options } = env.payload;
        if (command === 'END_SESSION') {
          await this.sessions.endSession(sessionId);
          return;
        }
        if (command === 'END_GAME') {
          await this.sessions.endCurrentGame(sessionId);
          return;
        }
        if (!gameId) throw new AppError(400, 'GAME_REQUIRED', `${command} needs a gameId`);
        if (command === 'START_SESSION') await this.sessions.startSession(sessionId, gameId, options);
        else await this.sessions.selectGame(sessionId, gameId, options);
        return;
      }

      case 'LEAVE':
        if (role !== 'player') return this.deny(env, role);
        await this.players.leave(sessionId, playerId);
        return;

      case 'PING':
        return; // answered with an ack at the inbound layer
    }
  }

  private deny(env: ClientEnvelope, role: string): void {
    this.log.warn({ type: env.type, role }, 'event dropped: wrong role');
  }
}
