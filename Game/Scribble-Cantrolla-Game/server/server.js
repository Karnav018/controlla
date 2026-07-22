require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const roomHandler = require('./socket/roomHandler');
const gameHandler = require('./socket/gameHandler');
const gameManager = require('./services/gameManager');
const rateLimiter = require('./middleware/rateLimiter');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);

// HTTP Activity Logger
app.use(logger.http);

// Allow all origins (localhost, local IP, any port)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));

// Health check endpoint for API monitoring
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size, timestamp: new Date().toISOString() });
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory store for all active rooms
const rooms = new Map();

io.use((socket, next) => {
  if (rateLimiter(socket)) {
    logger.warn('Rate Limit Exceeded', `Socket: ${socket.id}`);
    return next(new Error('Rate limit exceeded'));
  }
  next();
});

io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  logger.socket('CONNECT', socket.id, '', { ip: clientIp });

  // Register handlers
  roomHandler(io, socket, rooms);
  gameHandler(io, socket, rooms, gameManager);

  socket.on('disconnect', (reason) => {
    logger.socket('DISCONNECT', socket.id, socket.data?.roomCode || '', { reason });
  });
});

const PORT = process.env.PORT || 3001;
// Listen on 0.0.0.0 so local network devices can connect
server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running and listening on http://0.0.0.0:${PORT}`);
});
