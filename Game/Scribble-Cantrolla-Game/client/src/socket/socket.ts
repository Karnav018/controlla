import { io } from 'socket.io-client';

const getSocketUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname || 'localhost';
    return `http://${hostname}:3001`;
  }
  return 'http://localhost:3001';
};

export const socket = io(getSocketUrl(), {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
