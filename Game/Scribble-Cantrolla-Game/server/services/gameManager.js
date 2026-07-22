const wordBank = require('./wordBank');
const logger = require('../utils/logger');

const gameManager = {

  // Helper to format players for client
  formatPlayer(player, hostId) {
    return {
      id: player.socketId,
      username: player.username,
      avatar: player.avatar,
      score: player.score,
      isReady: player.isReady,
      isHost: player.socketId === hostId,
      hasGuessed: player.hasGuessedCorrectly
    };
  },

  formatPlayers(room) {
    return room.players.map(p => this.formatPlayer(p, room.hostId));
  },

  startGame(io, room) {
    logger.game('GAME_STARTED', room.roomCode, `Total Players: ${room.players.length}`);
    room.gameState = 'PLAYING';
    room.players.forEach(p => {
      p.score = 0;
      p.hasGuessedCorrectly = false;
      p.isDrawing = false;
    });
    
    room.totalRounds = room.totalRounds || 3;
    room.currentRound = 0;
    
    // Randomize drawer order
    room.drawerOrder = [...room.players]
      .map(p => ({ player: p, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(p => p.player.socketId);
      
    room.drawerIndex = 0;
    
    io.to(room.roomCode).emit('gameStarted', {
      players: this.formatPlayers(room)
    });

    this.startRound(io, room);
  },
  
  startRound(io, room) {
    // If we've exhausted all drawers, increment round
    if (room.drawerIndex >= room.drawerOrder.length) {
      room.currentRound++;
      room.drawerIndex = 0;
    }
    
    if (room.currentRound >= room.totalRounds) {
      return this.endGame(io, room);
    }
    
    room.gameState = 'CHOOSING_WORD';
    room.players.forEach(p => {
      p.hasGuessedCorrectly = false;
      p.isDrawing = false;
    });
    room.guessedPlayers = [];
    room.drawingData = [];
    room.dislikeVotes = new Set();
    room.likeVotes = new Set();
    
    room.currentDrawer = room.drawerOrder[room.drawerIndex];
    room.players.forEach(p => {
      p.isDrawing = (p.socketId === room.currentDrawer);
    });
    
    const drawerPlayer = room.players.find(p => p.socketId === room.currentDrawer);
    logger.game('START_ROUND', room.roomCode, `Round ${room.currentRound + 1}/${room.totalRounds} | Drawer: ${drawerPlayer?.username || room.currentDrawer}`);

    room.drawerIndex++;
    
    const words = wordBank.getRandomWords(3);
    room.wordOptions = words;
    
    // Client expects { round, drawerId } in newRound event
    io.to(room.roomCode).emit('newRound', {
      round: room.currentRound + 1,
      totalRounds: room.totalRounds,
      drawerId: room.currentDrawer
    });

    // Also emit gameState change
    io.to(room.roomCode).emit('gameStateChanged', 'CHOOSING_WORD');
    
    // Client expects wordOptions as array directly (wordOptions state)
    io.to(room.currentDrawer).emit('wordOptions', { words: words });
    
    // Auto-select a word if drawer doesn't pick in 15 seconds
    room.timer = setTimeout(() => {
      if (room.gameState === 'CHOOSING_WORD') {
        logger.game('AUTO_WORD_SELECT', room.roomCode, `Drawer timed out selecting word. Auto-selected '${words[0]}'`);
        room.currentWord = words[0];
        this.startDrawing(io, room);
      }
    }, 15000);
  },
  
  startDrawing(io, room) {
    if (room.timer) clearTimeout(room.timer);
    if (room.hintTimer) clearTimeout(room.hintTimer);
    
    room.gameState = 'DRAWING';
    const totalTime = room.drawTime || 80;
    room.roundTime = totalTime;
    room.drawingData = [];
    room.guessedPlayers = [];
    room.wrongGuessCount = 0;
    room.revealCount = 0;
    room.dislikeVotes = new Set();
    room.likeVotes = new Set();
    
    const initialHint = this.generateHint(room.currentWord, 0);
    room.hints = initialHint;

    logger.game('START_DRAWING', room.roomCode, `Word: '${room.currentWord}' | Time: ${totalTime}s`);

    // Emit gameState change
    io.to(room.roomCode).emit('gameStateChanged', 'DRAWING');
    
    // Send hint to all players
    io.to(room.roomCode).emit('hintUpdate', { hint: initialHint });
    
    // Send actual word to drawer only
    io.to(room.currentDrawer).emit('wordSelected', { word: room.currentWord });
    
    // Start the countdown timer
    room.timer = setInterval(() => {
      room.roundTime--;
      // Client expects { time: number }
      io.to(room.roomCode).emit('timerUpdate', { time: room.roundTime });
      
      // Hint logic - reveal letters progressively
      const timeRemaining = room.roundTime;
      if (timeRemaining === Math.floor(totalTime * 0.6)) {
        room.hints = this.generateHint(room.currentWord, 1);
        logger.game('HINT_UPDATE', room.roomCode, `Hint 1: ${room.hints}`);
        io.to(room.roomCode).emit('hintUpdate', { hint: room.hints });
      } else if (timeRemaining === Math.floor(totalTime * 0.35)) {
        room.hints = this.generateHint(room.currentWord, 2);
        logger.game('HINT_UPDATE', room.roomCode, `Hint 2: ${room.hints}`);
        io.to(room.roomCode).emit('hintUpdate', { hint: room.hints });
      } else if (timeRemaining === Math.floor(totalTime * 0.2)) {
        room.hints = this.generateHint(room.currentWord, 3);
        logger.game('HINT_UPDATE', room.roomCode, `Hint 3: ${room.hints}`);
        io.to(room.roomCode).emit('hintUpdate', { hint: room.hints });
      }
      
      if (room.roundTime <= 0) {
        logger.game('ROUND_TIME_EXPIRED', room.roomCode, `Time expired for word '${room.currentWord}'`);
        this.endRound(io, room);
      }
    }, 1000);
  },
  
  endRound(io, room) {
    if (room.timer) clearInterval(room.timer);
    if (room.hintTimer) clearTimeout(room.hintTimer);
    room.timer = null;
    room.hintTimer = null;
    
    room.gameState = 'ROUND_END';
    logger.game('END_ROUND', room.roomCode, `The word was '${room.currentWord}'`);
    
    io.to(room.roomCode).emit('gameStateChanged', 'ROUND_END');
    
    // Client expects { word, players }
    io.to(room.roomCode).emit('roundEnd', {
      word: room.currentWord,
      players: this.formatPlayers(room)
    });
    
    setTimeout(() => {
      this.startRound(io, room);
    }, 5000);
  },
  
  endGame(io, room) {
    room.gameState = 'GAME_END';
    
    const sortedPlayers = this.formatPlayers(room).sort((a, b) => b.score - a.score);
    logger.game('END_GAME', room.roomCode, `Winner: ${sortedPlayers[0]?.username || 'None'} (Score: ${sortedPlayers[0]?.score || 0})`);
    
    // Client expects { players }
    io.to(room.roomCode).emit('gameEnd', {
      players: sortedPlayers
    });

    io.to(room.roomCode).emit('gameStateChanged', 'GAME_END');
    
    // Reset room state to lobby after a delay
    setTimeout(() => {
      room.gameState = 'LOBBY';
      room.currentRound = 0;
      room.currentWord = '';
      room.currentDrawer = null;
      room.drawingData = [];
      room.dislikeVotes = new Set();
      room.likeVotes = new Set();
      room.players.forEach(p => {
        p.isReady = false;
        p.isDrawing = false;
        p.hasGuessedCorrectly = false;
      });
      logger.game('ROOM_RESET_TO_LOBBY', room.roomCode);
    }, 10000);
  },
  
  generateHint(word, revealCount) {
    if (!word) return '';
    const cleanWord = word.trim().toLowerCase().replace(/\s+/g, ' ');
    let hintArray = cleanWord.split('').map(char => (char === ' ' ? '  ' : '_'));
    
    if (revealCount > 0) {
      let unrevealedIndexes = [];
      hintArray.forEach((char, index) => {
        if (char === '_') unrevealedIndexes.push(index);
      });
      
      const maxReveals = Math.min(revealCount, Math.floor(cleanWord.replace(/ /g, '').length / 2));
      
      for (let i = 0; i < maxReveals; i++) {
        if (unrevealedIndexes.length === 0) break;
        const randIdx = Math.floor(Math.random() * unrevealedIndexes.length);
        const wordIndex = unrevealedIndexes[randIdx];
        hintArray[wordIndex] = cleanWord[wordIndex];
        unrevealedIndexes.splice(randIdx, 1);
      }
    }
    
    return hintArray.join(' ').trim();
  }
};

module.exports = gameManager;
