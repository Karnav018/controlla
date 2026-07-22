const crypto = require('crypto');
const logger = require('../utils/logger');

function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

module.exports = function (io, socket, rooms) {

  // Helper to format player for client (maps server fields to client interface)
  function formatPlayer(player, hostId) {
    return {
      id: player.socketId,
      username: player.username,
      avatar: player.avatar,
      score: player.score,
      isReady: player.isReady,
      isHost: player.socketId === hostId,
      hasGuessed: player.hasGuessedCorrectly
    };
  }

  function formatPlayers(room) {
    return room.players.map(p => formatPlayer(p, room.hostId));
  }

  socket.on('createRoom', ({ username, avatar }) => {
    let roomCode;
    do {
      roomCode = generateRoomCode();
    } while (rooms.has(roomCode));

    const player = {
      socketId: socket.id,
      username,
      avatar,
      score: 0,
      isReady: false,
      isDrawing: false,
      hasGuessedCorrectly: false
    };

    const room = {
      roomCode,
      hostId: socket.id,
      players: [player],
      gameState: 'LOBBY',
      currentRound: 0,
      totalRounds: 3,
      currentWord: '',
      currentDrawer: null,
      drawingData: [],
      hints: '',
      roundTime: 80,
      drawTime: 80,
      theme: 'classic',
      maxPlayers: 999999,
      scores: {},
      guessedPlayers: [],
      wordOptions: [],
      timer: null,
      hintTimer: null,
      drawerOrder: [],
      drawerIndex: 0
    };

    rooms.set(roomCode, room);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    logger.socket('createRoom', socket.id, roomCode, { username, avatar });
    logger.game('ROOM_CREATED', roomCode, `Host: ${username} (${socket.id})`);

    socket.emit('roomCreated', {
      roomCode: room.roomCode,
      players: formatPlayers(room),
      theme: room.theme
    });
  });

  socket.on('joinRoom', ({ roomCode, username, avatar }) => {
    logger.socket('joinRoom', socket.id, roomCode, { username });
    const room = rooms.get(roomCode);
    
    if (!room) {
      logger.warn(`joinRoom Failed: Room ${roomCode} not found`, `Socket: ${socket.id}`);
      return socket.emit('error', { message: 'Room not found' });
    }
    
    if (room.players.length >= room.maxPlayers) {
      logger.warn(`joinRoom Failed: Room ${roomCode} is full`, `Socket: ${socket.id}`);
      return socket.emit('error', { message: 'Room is full' });
    }
    
    if (room.gameState !== 'LOBBY') {
      logger.warn(`joinRoom Failed: Room ${roomCode} game in progress`, `Socket: ${socket.id}`);
      return socket.emit('error', { message: 'Game already in progress' });
    }

    const player = {
      socketId: socket.id,
      username,
      avatar,
      score: 0,
      isReady: false,
      isDrawing: false,
      hasGuessedCorrectly: false
    };

    room.players.push(player);
    socket.join(roomCode);
    socket.data.roomCode = roomCode;

    logger.game('PLAYER_JOINED', roomCode, `${username} joined (Total: ${room.players.length})`);

    // Send full room data to the joining player
    socket.emit('roomCreated', {
      roomCode: room.roomCode,
      players: formatPlayers(room),
      theme: room.theme || 'classic'
    });

    // Notify existing players
    socket.to(roomCode).emit('playerJoined', {
      players: formatPlayers(room),
      newPlayer: formatPlayer(player, room.hostId),
      theme: room.theme || 'classic'
    });
  });

  socket.on('toggleReady', ({ roomCode }) => {
    logger.socket('toggleReady', socket.id, roomCode);
    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (player) {
      player.isReady = !player.isReady;
      logger.game('PLAYER_READY_TOGGLE', roomCode, `${player.username} ready: ${player.isReady}`);
      io.to(roomCode).emit('playerUpdated', {
        players: formatPlayers(room),
        totalRounds: room.totalRounds,
        drawTime: room.drawTime,
        theme: room.theme || 'classic'
      });
    }
  });

  socket.on('updateSettings', ({ roomCode, totalRounds, drawTime, theme }) => {
    logger.socket('updateSettings', socket.id, roomCode, { totalRounds, drawTime, theme });
    const room = rooms.get(roomCode);
    if (!room) return;
    if (room.hostId !== socket.id) return; // Only host can change settings

    if (totalRounds !== undefined) room.totalRounds = totalRounds;
    if (drawTime !== undefined) room.drawTime = drawTime;
    if (theme !== undefined) room.theme = theme;

    logger.game('SETTINGS_UPDATED', roomCode, `Rounds: ${room.totalRounds}, DrawTime: ${room.drawTime}s, Theme: ${room.theme}`);

    io.to(roomCode).emit('playerUpdated', {
      players: formatPlayers(room),
      totalRounds: room.totalRounds,
      drawTime: room.drawTime,
      theme: room.theme
    });
  });

  const handleLeave = () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex !== -1) {
      const leavingPlayer = room.players[playerIndex];
      room.players.splice(playerIndex, 1);
      
      socket.leave(roomCode);
      delete socket.data.roomCode;

      logger.game('PLAYER_LEFT', roomCode, `${leavingPlayer.username} left (Remaining: ${room.players.length})`);

      if (room.players.length === 0) {
        if (room.timer) clearInterval(room.timer);
        if (room.hintTimer) clearTimeout(room.hintTimer);
        rooms.delete(roomCode);
        logger.game('ROOM_DESTROYED', roomCode, 'All players left, room closed');
      } else {
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].socketId;
          logger.game('HOST_TRANSFERRED', roomCode, `New Host: ${room.players[0].username}`);
        }

        io.to(roomCode).emit('playerLeft', {
          players: formatPlayers(room),
          leftPlayer: { username: leavingPlayer.username }
        });
        
        if (room.gameState === 'DRAWING' || room.gameState === 'CHOOSING_WORD') {
          if (room.currentDrawer === socket.id) {
            logger.game('DRAWER_LEFT', roomCode, 'Current drawer left during round');
            io.to(roomCode).emit('chatMessage', {
              id: Date.now().toString(),
              sender: 'System',
              text: 'The drawer has left the game!',
              type: 'system'
            });
          }
        }
      }
    }
  };

  socket.on('leaveRoom', handleLeave);
  socket.on('disconnecting', handleLeave);
};
