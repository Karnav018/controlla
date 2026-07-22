/**
 * Activity & API Logger for Scribble Party Backend
 */

const getTimestamp = () => new Date().toISOString();

const logger = {
  info: (activity, details = '') => {
    console.log(`\x1b[36m[INFO]\x1b[0m [${getTimestamp()}] ${activity}`, details ? details : '');
  },

  socket: (event, socketId, roomCode = '', payload = '') => {
    const roomInfo = roomCode ? ` | Room: ${roomCode}` : '';
    const payloadInfo = payload ? ` | Payload: ${JSON.stringify(payload)}` : '';
    console.log(`\x1b[32m[SOCKET]\x1b[0m [${getTimestamp()}] Event: '${event}' | Socket: ${socketId}${roomInfo}${payloadInfo}`);
  },

  game: (action, roomCode, details = '') => {
    console.log(`\x1b[33m[GAME]\x1b[0m [${getTimestamp()}] Room: ${roomCode} | Action: ${action}`, details ? details : '');
  },

  http: (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`\x1b[35m[HTTP]\x1b[0m [${getTimestamp()}] ${req.method} ${req.originalUrl} | Status: ${res.statusCode} | IP: ${req.ip} | ${duration}ms`);
    });
    next();
  },

  warn: (warning, details = '') => {
    console.warn(`\x1b[33m[WARN]\x1b[0m [${getTimestamp()}] ${warning}`, details ? details : '');
  },

  error: (error, details = '') => {
    console.error(`\x1b[31m[ERROR]\x1b[0m [${getTimestamp()}] ${error}`, details ? details : '');
  }
};

module.exports = logger;
