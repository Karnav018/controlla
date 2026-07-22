import { Redis } from 'ioredis';
import { DISCONNECT_LUA, RECONNECT_LUA, POP_DUE_TIMER_LUA } from './lua';

export type RedisClient = Redis & {
  playerDisconnect(playersKey: string, timersKey: string, playerId: string, socketId: string, graceAtMs: number): Promise<number>;
  playerReconnect(playersKey: string, timersKey: string, playerId: string, socketId: string): Promise<string>;
  popDueTimer(timersKey: string, member: string, nowMs: number): Promise<number>;
};

export function createRedis(url: string): RedisClient {
  const redis = new Redis(url, { maxRetriesPerRequest: 3 });
  redis.defineCommand('playerDisconnect', { numberOfKeys: 2, lua: DISCONNECT_LUA });
  redis.defineCommand('playerReconnect', { numberOfKeys: 2, lua: RECONNECT_LUA });
  redis.defineCommand('popDueTimer', { numberOfKeys: 1, lua: POP_DUE_TIMER_LUA });
  return redis as RedisClient;
}
