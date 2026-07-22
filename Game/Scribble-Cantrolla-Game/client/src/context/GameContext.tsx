import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { socket } from '../socket/socket';

export type GameState = 'LOBBY' | 'CHOOSING_WORD' | 'DRAWING' | 'ROUND_END' | 'GAME_END';

export interface Player {
  id: string;
  username: string;
  avatar: string;
  score: number;
  isReady: boolean;
  isHost: boolean;
  hasGuessed: boolean;
}

export interface Message {
  id: string;
  sender: string;
  text: string;
  type: 'chat' | 'system' | 'guess' | 'hint' | 'like' | 'dislike';
}

export interface StrokeData {
  points: { x: number; y: number }[];
  color: string;
  size: number;
  tool: 'brush' | 'eraser';
}

interface GameContextType {
  username: string;
  setUsername: (name: string) => void;
  avatar: string;
  setAvatar: (avatar: string) => void;
  roomCode: string;
  setRoomCode: (code: string) => void;
  players: Player[];
  gameState: GameState;
  currentRound: number;
  totalRounds: number;
  currentWord: string;
  wordOptions: string[];
  timer: number;
  drawTime: number;
  theme: string;
  isDrawer: boolean;
  drawerId: string | null;
  messages: Message[];
  createRoom: (name: string, avatarId: string) => void;
  joinRoom: (code: string, name: string, avatarId: string) => void;
  toggleReady: () => void;
  startGame: () => void;
  selectWord: (word: string) => void;
  sendMessage: (text: string) => void;
  sendReaction: (type: 'like' | 'dislike') => void;
  leaveRoom: () => void;
  setRounds: (r: number) => void;
  setDrawTime: (t: number) => void;
  setTheme: (t: string) => void;
  socketId: string;
  serverError: string;
  clearServerError: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [gameState, setGameState] = useState<GameState>('LOBBY');
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [currentWord, setCurrentWord] = useState('');
  const [wordOptions, setWordOptions] = useState<string[]>([]);
  const [timer, setTimer] = useState(80);
  const [drawTime, setDrawTimeState] = useState(80);
  const [theme, setThemeState] = useState<string>('classic');
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [socketId, setSocketId] = useState<string>(socket.id || '');
  const [serverError, setServerError] = useState<string>('');

  const isDrawer = socketId === drawerId;

  const clearServerError = () => setServerError('');

  useEffect(() => {
    socket.on('connect', () => {
      setSocketId(socket.id || '');
      setServerError('');
    });

    socket.on('connect_error', () => {
      setServerError('Unable to connect to game server. Make sure server is running on port 3001.');
    });

    socket.on('roomCreated', (data: any) => {
      setRoomCode(data.roomCode);
      setPlayers(data.players || []);
      if (data.theme) setThemeState(data.theme);
      setServerError('');
    });

    socket.on('playerJoined', (data: any) => {
      setPlayers(data.players || []);
      if (data.theme) setThemeState(data.theme);
      setServerError('');
      if (data.newPlayer) {
        setMessages(p => [...p, {
          id: Date.now().toString(),
          sender: 'System',
          text: `${data.newPlayer.username} joined`,
          type: 'system'
        }]);
      }
    });

    socket.on('playerLeft', (data: any) => {
      setPlayers(data.players || []);
      if (data.leftPlayer) {
        setMessages(p => [...p, {
          id: Date.now().toString(),
          sender: 'System',
          text: `${data.leftPlayer.username} left`,
          type: 'system'
        }]);
      }
    });

    socket.on('playerUpdated', (data: any) => {
      setPlayers(data.players || []);
      if (data.totalRounds) setTotalRounds(data.totalRounds);
      if (data.drawTime) setDrawTimeState(data.drawTime);
      if (data.theme) setThemeState(data.theme);
    });

    socket.on('gameStateChanged', (state: GameState) => {
      setGameState(state);
    });

    socket.on('gameStarted', (data: any) => {
      if (data.players) setPlayers(data.players);
      setMessages([]);
      setCurrentWord('');
    });

    socket.on('newRound', (data: any) => {
      setCurrentRound(data.round);
      setTotalRounds(data.totalRounds || totalRounds);
      setDrawerId(data.drawerId);
      setCurrentWord('');
      setWordOptions([]);
      setGameState('CHOOSING_WORD');
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'System',
        text: `Round ${data.round} started!`,
        type: 'system'
      }]);
    });

    socket.on('wordOptions', (data: any) => {
      setWordOptions(data.words || data || []);
    });

    socket.on('wordSelected', (data: any) => {
      setCurrentWord(data.word);
      setGameState('DRAWING');
      setWordOptions([]);
    });

    socket.on('hintUpdate', (data: any) => {
      setGameState('DRAWING');
      setCurrentWord(prev => {
        return prev && !prev.includes('_') ? prev : (data.hint || data);
      });
    });

    socket.on('drawingData', () => {
      setGameState(prev => (prev === 'CHOOSING_WORD' ? 'DRAWING' : prev));
    });

    socket.on('timerUpdate', (data: any) => {
      setTimer(typeof data === 'number' ? data : data.time);
    });

    socket.on('chatMessage', (msg: any) => {
      setMessages(p => [...p, {
        id: msg.id || Date.now().toString(),
        sender: msg.sender,
        text: msg.text,
        type: msg.type || 'chat'
      }]);
    });

    socket.on('reactionReceived', (data: any) => {
      setMessages(p => [...p, {
        id: Date.now().toString(),
        sender: data.sender,
        text: data.type === 'like' ? 'liked Picasso\'s drawing!' : 'disliked Picasso\'s drawing!',
        type: data.type === 'like' ? 'like' : 'dislike'
      }]);
    });

    socket.on('correctGuess', (data: any) => {
      if (data.players) setPlayers(data.players);
      setMessages(p => [...p, {
        id: Date.now().toString(),
        sender: 'System',
        text: `${data.username} guessed the word!`,
        type: 'guess'
      }]);
    });

    socket.on('scoreUpdate', (data: any) => {
      if (Array.isArray(data)) {
        setPlayers(data);
      }
    });

    socket.on('roundEnd', (data: any) => {
      setCurrentWord(data.word);
      setGameState('ROUND_END');
      if (data.players) setPlayers(data.players);
    });

    socket.on('gameEnd', (data: any) => {
      if (data.players) setPlayers(data.players);
      setGameState('GAME_END');
    });

    socket.on('error', (data: any) => {
      console.error('Socket error:', data.message);
      setServerError(data.message || 'An error occurred');
    });

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('roomCreated');
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('playerUpdated');
      socket.off('gameStateChanged');
      socket.off('gameStarted');
      socket.off('newRound');
      socket.off('wordOptions');
      socket.off('wordSelected');
      socket.off('hintUpdate');
      socket.off('drawingData');
      socket.off('timerUpdate');
      socket.off('chatMessage');
      socket.off('reactionReceived');
      socket.off('correctGuess');
      socket.off('scoreUpdate');
      socket.off('roundEnd');
      socket.off('gameEnd');
      socket.off('error');
    };
  }, []);

  const createRoom = (name: string, avatarId: string) => {
    setUsername(name);
    setAvatar(avatarId);
    setServerError('');
    socket.connect();
    socket.emit('createRoom', { username: name, avatar: avatarId });
  };

  const joinRoom = (code: string, name: string, avatarId: string) => {
    setUsername(name);
    setAvatar(avatarId);
    setRoomCode(code);
    setServerError('');
    socket.connect();
    socket.emit('joinRoom', { roomCode: code, username: name, avatar: avatarId });
  };

  const toggleReady = () => socket.emit('toggleReady', { roomCode });
  const startGame = () => socket.emit('startGame', { roomCode });
  
  const selectWord = (word: string) => {
    setGameState('DRAWING');
    setCurrentWord(word);
    setWordOptions([]);
    socket.emit('selectWord', { roomCode, word });
  };

  const sendMessage = (text: string) => socket.emit('sendMessage', { roomCode, text });
  const sendReaction = (type: 'like' | 'dislike') => socket.emit('sendReaction', { roomCode, type });
  
  const leaveRoom = () => {
    socket.emit('leaveRoom', { roomCode });
    socket.disconnect();
    setRoomCode('');
    setPlayers([]);
    setGameState('LOBBY');
    setMessages([]);
    setCurrentWord('');
    setTimer(80);
    setCurrentRound(1);
    setDrawerId(null);
    setServerError('');
  };

  const setRounds = (r: number) => socket.emit('updateSettings', { roomCode, totalRounds: r });
  const updateDrawTime = (t: number) => {
    setDrawTimeState(t);
    socket.emit('updateSettings', { roomCode, drawTime: t });
  };
  const updateTheme = (t: string) => {
    setThemeState(t);
    socket.emit('updateSettings', { roomCode, theme: t });
  };

  return (
    <GameContext.Provider value={{
      username, setUsername, avatar, setAvatar, roomCode, setRoomCode,
      players, gameState, currentRound, totalRounds, currentWord, wordOptions,
      timer, drawTime, theme, isDrawer, drawerId, messages, socketId, serverError, clearServerError,
      createRoom, joinRoom, toggleReady, startGame, selectWord, sendMessage, sendReaction, leaveRoom,
      setRounds, setDrawTime: updateDrawTime, setTheme: updateTheme
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within GameProvider');
  return context;
};
