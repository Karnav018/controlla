const messageCounts = new Map();

module.exports = function rateLimiter(socket) {
  const socketId = socket.id;
  const now = Date.now();
  
  if (!messageCounts.has(socketId)) {
    messageCounts.set(socketId, { count: 1, lastReset: now });
    return false;
  }
  
  const state = messageCounts.get(socketId);
  
  if (now - state.lastReset > 1000) {
    state.count = 1;
    state.lastReset = now;
    return false;
  }
  
  state.count++;
  
  if (state.count > 50) { // Limit to 50 events per second
    return true;
  }
  
  return false;
};
