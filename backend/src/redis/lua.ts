/**
 * Atomic presence transitions and timer pops. These exist because plain
 * MULTI cannot express the conditional logic, and the races they close are
 * real: a fast reconnect (new socket) racing the old socket's disconnect,
 * and a grace timer firing mid-rebind.
 *
 * Convention: RedisPlayer.socketId === '' means "no socket bound" (avoids
 * cjson null round-trip pitfalls).
 */

/**
 * KEYS[1]=players hash, KEYS[2]=timers zset
 * ARGV[1]=playerId, ARGV[2]=disconnecting socketId, ARGV[3]=grace fire-at ms
 * Returns 1 if the player was marked disconnected and a grace timer armed;
 * 0 if the player is gone or a NEWER socket owns the seat (stale disconnect).
 */
export const DISCONNECT_LUA = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return 0 end
local p = cjson.decode(raw)
if p.socketId ~= ARGV[2] then return 0 end
p.presence = 'disconnected'
p.socketId = ''
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(p))
redis.call('ZADD', KEYS[2], tonumber(ARGV[3]), 'grace:' .. ARGV[1])
return 1
`;

/**
 * KEYS[1]=players hash, KEYS[2]=timers zset
 * ARGV[1]=playerId, ARGV[2]=new socketId
 * Atomically rebinds the seat to the new socket AND removes any pending grace
 * timer — no window in which grace can fire mid-rebind.
 * Returns JSON: {status:'left'|'first'|'resumed'|'rebound', oldSocketId:string}
 */
export const RECONNECT_LUA = `
local raw = redis.call('HGET', KEYS[1], ARGV[1])
if not raw then return cjson.encode({status='left'}) end
local p = cjson.decode(raw)
local oldPresence = p.presence
local oldSocketId = p.socketId
local first = (p.everConnected == nil) or (p.everConnected == false)
p.presence = 'connected'
p.socketId = ARGV[2]
p.everConnected = true
redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(p))
redis.call('ZREM', KEYS[2], 'grace:' .. ARGV[1])
local status
if first then
  status = 'first'
elseif oldPresence == 'connected' and oldSocketId ~= '' then
  status = 'rebound'
else
  status = 'resumed'
end
return cjson.encode({status=status, oldSocketId=oldSocketId})
`;

/**
 * KEYS[1]=timers zset, ARGV[1]=member, ARGV[2]=now ms
 * Pop-if-due: removes the member only if its score is due. The returned 1 is
 * the exclusive license to fire the handler — makes setTimeout-vs-sweep
 * double-fires impossible.
 */
export const POP_DUE_TIMER_LUA = `
local score = redis.call('ZSCORE', KEYS[1], ARGV[1])
if not score then return 0 end
if tonumber(score) > tonumber(ARGV[2]) then return 0 end
redis.call('ZREM', KEYS[1], ARGV[1])
return 1
`;
