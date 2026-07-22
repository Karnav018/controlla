const logger = require('../utils/logger');

module.exports = function (io, socket, rooms, gameManager) {

  // Helper to format players for the client
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

  // Helper to check if a wrong guess is close (1 letter off)
  function isCloseGuess(guess, target) {
    if (!guess || !target) return false;
    const g = guess.trim().toLowerCase();
    const t = target.trim().toLowerCase();
    if (Math.abs(g.length - t.length) > 2) return false;
    
    if (g.length === t.length) {
      let diff = 0;
      for (let i = 0; i < g.length; i++) {
        if (g[i] !== t[i]) diff++;
      }
      return diff === 1;
    }
    return false;
  }
  
  socket.on('startGame', ({ roomCode }) => {
    logger.socket('startGame', socket.id, roomCode);
    const room = rooms.get(roomCode);
    if (!room) return;
    
    if (room.hostId !== socket.id) {
      logger.warn(`startGame Failed: Not host`, `Socket: ${socket.id}`);
      return socket.emit('error', { message: 'Only host can start the game' });
    }
    
    if (room.players.length < 2) {
      logger.warn(`startGame Failed: Not enough players (${room.players.length})`, `Room: ${roomCode}`);
      return socket.emit('error', { message: 'Need at least 2 players to start' });
    }
    
    logger.game('START_GAME', roomCode, `Started by host ${socket.id}`);
    gameManager.startGame(io, room);
  });

  socket.on('selectWord', ({ roomCode, word }) => {
    logger.socket('selectWord', socket.id, roomCode, { word });
    const room = rooms.get(roomCode);
    if (!room || room.currentDrawer !== socket.id) return;
    
    room.currentWord = (word || '').trim().toLowerCase().replace(/\s+/g, ' ');
    logger.game('WORD_SELECTED', roomCode, `Word: '${room.currentWord}' by drawer ${socket.id}`);
    gameManager.startDrawing(io, room);
  });

  socket.on('draw', ({ roomCode, strokeData }) => {
    const room = rooms.get(roomCode);
    if (!room || room.currentDrawer !== socket.id) return;
    
    room.drawingData.push(strokeData);
    socket.to(roomCode).emit('drawingData', strokeData);
  });

  socket.on('drawingData', (data) => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.currentDrawer !== socket.id) return;
    
    room.drawingData.push(data);
    socket.to(roomCode).emit('drawingData', data);
  });

  socket.on('clearCanvas', (data) => {
    const roomCode = (data && data.roomCode) || socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.currentDrawer !== socket.id) return;
    
    logger.game('CANVAS_CLEARED', roomCode, `Drawer ${socket.id} cleared canvas`);
    room.drawingData = [];
    socket.to(roomCode).emit('canvasCleared');
  });

  socket.on('undo', (data) => {
    const roomCode = (data && data.roomCode) || socket.data.roomCode;
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room || room.currentDrawer !== socket.id) return;
    
    room.drawingData.pop();
    socket.to(roomCode).emit('undoStroke');
  });

  socket.on('sendReaction', ({ roomCode, type }) => {
    const room = rooms.get(roomCode);
    if (!room || room.gameState !== 'DRAWING') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    if (socket.id === room.currentDrawer) return;

    if (!room.dislikeVotes) room.dislikeVotes = new Set();
    if (!room.likeVotes) room.likeVotes = new Set();

    if (type === 'dislike') {
      room.dislikeVotes.add(socket.id);
      room.likeVotes.delete(socket.id);
    } else if (type === 'like') {
      room.likeVotes.add(socket.id);
      room.dislikeVotes.delete(socket.id);
    }

    logger.game('REACTION_SENT', roomCode, `${player.username} -> ${type.toUpperCase()}`);

    io.to(roomCode).emit('reactionReceived', {
      sender: player.username,
      type: type
    });

    const nonDrawersCount = Math.max(1, room.players.length - 1);
    const dislikeRatio = room.dislikeVotes.size / nonDrawersCount;

    if (dislikeRatio >= 0.9) {
      logger.game('TURN_SKIPPED_DISLIKES', roomCode, `90%+ dislikes reached (${room.dislikeVotes.size}/${nonDrawersCount})`);
      io.to(roomCode).emit('chatMessage', {
        id: Date.now().toString() + '-skip',
        sender: 'System',
        text: `Turn skipped! 90%+ of players disliked Picasso's drawing.`,
        type: 'hint'
      });
      gameManager.endRound(io, room);
    }
  });

  socket.on('sendMessage', ({ roomCode, text, message }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const msgText = text || message || '';
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    
    if (room.currentDrawer === socket.id) {
      return;
    }
    
    if (room.gameState === 'DRAWING' && room.currentWord) {
      const isCorrect = msgText.trim().toLowerCase() === room.currentWord.trim().toLowerCase();
      
      if (isCorrect && !player.hasGuessedCorrectly) {
        player.hasGuessedCorrectly = true;
        room.guessedPlayers.push(socket.id);
        
        const timeRemaining = room.roundTime;
        const totalTime = room.drawTime || 80;
        const timeElapsed = totalTime - timeRemaining;
        const baseScore = 500;
        const timeDeduction = Math.floor(timeElapsed * 2); 
        const placementBonus = Math.max(0, 100 - (room.guessedPlayers.length - 1) * 20);
        const scoreEarned = Math.max(10, baseScore - timeDeduction + placementBonus);
        
        player.score += scoreEarned;
        
        const drawer = room.players.find(p => p.socketId === room.currentDrawer);
        if (drawer) {
          drawer.score += 100;
        }

        logger.game('CORRECT_GUESS', roomCode, `${player.username} guessed '${room.currentWord}' (Score +${scoreEarned})`);
        
        io.to(roomCode).emit('correctGuess', { 
          players: formatPlayers(room),
          username: player.username 
        });
        
        io.to(roomCode).emit('scoreUpdate', formatPlayers(room));
        
        if (room.guessedPlayers.length === room.players.length - 1) {
          logger.game('ALL_PLAYERS_GUESSED', roomCode, 'Ending round early as all non-drawers guessed correctly');
          gameManager.endRound(io, room);
        }
        return;
      }

      if (!player.hasGuessedCorrectly) {
        logger.socket('sendMessage', socket.id, roomCode, { guess: msgText });
        room.wrongGuessCount = (room.wrongGuessCount || 0) + 1;

        if (isCloseGuess(msgText, room.currentWord)) {
          logger.game('CLOSE_GUESS', roomCode, `${player.username}'s guess '${msgText}' is close to '${room.currentWord}'`);
          socket.emit('chatMessage', {
            id: Date.now().toString() + '-close',
            sender: 'System',
            text: `'${msgText}' is very close!`,
            type: 'hint'
          });
        }

        if (room.wrongGuessCount % 3 === 0) {
          room.revealCount = (room.revealCount || 0) + 1;
          room.hints = gameManager.generateHint(room.currentWord, room.revealCount);

          logger.game('HINT_REVEALED', roomCode, `Hint: ${room.hints}`);
          io.to(roomCode).emit('hintUpdate', { hint: room.hints });
          io.to(roomCode).emit('chatMessage', {
            id: Date.now().toString() + '-hint',
            sender: 'System',
            text: `Extra hint revealed after multiple wrong guesses: ${room.hints}`,
            type: 'hint'
          });
        }
      }
    }
    
    io.to(roomCode).emit('chatMessage', { 
      id: Date.now().toString() + '-' + socket.id,
      sender: player.username, 
      text: msgText,
      type: 'chat'
    });
  });
};
