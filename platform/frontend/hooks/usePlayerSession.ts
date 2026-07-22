'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, ApiError, fetchGames } from '../lib/api';
import {
  WIRE_EVENT,
  PROTOCOL_VERSION,
  type ControllerLayout,
  type Envelope,
  type GameInfo,
  type PlayerPublic,
  type SessionStatePayload,
  type SessionStatus
} from '../lib/protocol';

export type PlayerPhase = 'boot' | 'join' | 'joining' | 'in' | 'ended';

export interface PlayerSession {
  phase: PlayerPhase;
  error: string | null;
  connected: boolean;
  status: SessionStatus;
  players: PlayerPublic[];
  me: PlayerPublic | null;
  layout: ControllerLayout | null;
  /** Catalogue entry for the game currently running (console URL etc.). */
  currentGame: GameInfo | null;
  notice: string | null;
  join(nickname: string): void;
  setReady(ready: boolean): void;
  sendInput(controlId: string, action: string, value?: string | number | boolean): void;
  leaveParty(): void;
}

interface StoredPlayer {
  sessionId: string;
  playerId: string;
  playerToken: string;
}

const storeKey = (code: string) => `controlla.player.${code}`;

/**
 * The phone controller's connection to the platform. Join once (the token in
 * localStorage is the resume credential), then everything — lobby, layouts,
 * game switches — arrives as snapshots + deltas. Locking the phone and coming
 * back is a plain reconnect; the server replays the current layout.
 */
export function usePlayerSession(code: string, joinToken: string | null): PlayerSession {
  const [phase, setPhase] = useState<PlayerPhase>('boot');
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<SessionStatePayload | null>(null);
  const [layout, setLayout] = useState<ControllerLayout | null>(null);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void fetchGames().then(setGames).catch(() => {});
  }, []);

  const socketRef = useRef<Socket | null>(null);
  const seqRef = useRef(0);
  const lastServerSeqRef = useRef(0);
  const storedRef = useRef<StoredPlayer | null>(null);
  const wakeLockRef = useRef<{ release(): Promise<void> } | null>(null);

  const clear = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    localStorage.removeItem(storeKey(code));
    storedRef.current = null;
    setSnapshot(null);
    setLayout(null);
    seqRef.current = 0;
    lastServerSeqRef.current = 0;
  }, [code]);

  const handleEnvelope = useCallback((env: Envelope) => {
    if (env.type === 'SESSION_STATE') {
      lastServerSeqRef.current = env.seq;
      setSnapshot(env.payload as SessionStatePayload);
      return;
    }
    if (env.seq <= lastServerSeqRef.current) return;
    lastServerSeqRef.current = env.seq;

    const patchPlayers = (fn: (ps: PlayerPublic[]) => PlayerPublic[]) =>
      setSnapshot((s) => (s ? { ...s, players: fn(s.players) } : s));

    switch (env.type) {
      case 'CONTROLLER_LAYOUT':
        setLayout((env.payload as { layout: ControllerLayout | null }).layout);
        return;
      case 'GAME_STARTED':
        setSnapshot((s) => (s ? { ...s, status: 'playing' } : s));
        setNotice(null);
        // Keep the screen awake during gameplay (best effort).
        void (navigator as any).wakeLock?.request?.('screen').then(
          (l: any) => (wakeLockRef.current = l),
          () => {}
        );
        return;
      case 'GAME_FINISHED':
        setSnapshot((s) => (s ? { ...s, status: 'lobby' } : s));
        setLayout(null);
        void wakeLockRef.current?.release().catch(() => {});
        wakeLockRef.current = null;
        return;
      case 'SESSION_ENDED':
        setPhase('ended');
        setConnected(false);
        socketRef.current?.disconnect();
        localStorage.removeItem(storeKey(code));
        return;
      case 'PLAYER_CONNECTED': {
        const { player } = env.payload as { player: PlayerPublic };
        patchPlayers((ps) => [...ps.filter((p) => p.playerId !== player.playerId), player]);
        return;
      }
      case 'PLAYER_READY': {
        const { playerId, ready } = env.payload as { playerId: string; ready: boolean };
        patchPlayers((ps) => ps.map((p) => (p.playerId === playerId ? { ...p, ready } : p)));
        return;
      }
      case 'PLAYER_LEFT': {
        const { playerId } = env.payload as { playerId: string };
        patchPlayers((ps) => ps.filter((p) => p.playerId !== playerId));
        return;
      }
      case 'PLAYER_DISCONNECTED':
      case 'PLAYER_RECONNECTED': {
        const { playerId } = env.payload as { playerId: string };
        const presence = env.type === 'PLAYER_RECONNECTED' ? 'connected' : 'disconnected';
        patchPlayers((ps) => ps.map((p) => (p.playerId === playerId ? { ...p, presence } : p)));
        return;
      }
      case 'NOTIFICATION': {
        const { code: nCode, message } = env.payload as { code: string; message: string };
        if (nCode === 'NOT_IN_SESSION') {
          // Grace expired — the seat is gone; offer a fresh join.
          localStorage.removeItem(storeKey(code));
          storedRef.current = null;
          setPhase('join');
          setError('Your seat expired — join again');
          return;
        }
        setNotice(message);
        setTimeout(() => setNotice(null), 3500);
        return;
      }
      default:
        return;
    }
  }, [code]);

  const connect = useCallback(
    (stored: StoredPlayer) => {
      storedRef.current = stored;
      socketRef.current?.disconnect();
      const socket = io(API_URL, {
        auth: { token: stored.playerToken },
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 400,
        reconnectionDelayMax: 2500
      });
      socketRef.current = socket;
      socket.on('connect', () => {
        setConnected(true);
        setPhase('in');
      });
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', (err) => {
        if (err.message === 'SESSION_NOT_FOUND') {
          clear();
          setPhase('ended');
        } else if (err.message === 'UNAUTHORIZED') {
          clear();
          setPhase('join');
        }
      });
      socket.on(WIRE_EVENT, handleEnvelope);
    },
    [clear, handleEnvelope]
  );

  // Boot: resume a stored seat for this code, else show the join form.
  useEffect(() => {
    const raw = localStorage.getItem(storeKey(code));
    if (raw) {
      try {
        connect(JSON.parse(raw) as StoredPlayer);
        return () => {
          socketRef.current?.disconnect();
          socketRef.current = null;
        };
      } catch {
        localStorage.removeItem(storeKey(code));
      }
    }
    setPhase('join');
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Phones lock constantly — nudge the socket the moment we're visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && storedRef.current && !socketRef.current?.connected) {
        socketRef.current?.connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, []);

  const join = useCallback(
    (nickname: string) => {
      setPhase('joining');
      setError(null);
      void (async () => {
        try {
          const resolved = await fetch(`${API_URL}/sessions/code/${encodeURIComponent(code)}`).then(async (r) => {
            if (!r.ok) throw new ApiError(r.status, 'SESSION_NOT_FOUND', 'That party code was not found');
            return (await r.json()) as { sessionId: string };
          });
          const res = await fetch(`${API_URL}/sessions/${resolved.sessionId}/join`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ nickname, ...(joinToken ? { joinToken } : {}) })
          });
          const json = await res.json();
          if (!res.ok) throw new ApiError(res.status, json?.error ?? 'ERROR', json?.message);
          const stored: StoredPlayer = {
            sessionId: resolved.sessionId,
            playerId: json.playerId,
            playerToken: json.playerToken
          };
          localStorage.setItem(storeKey(code), JSON.stringify(stored));
          connect(stored);
        } catch (err) {
          setPhase('join');
          setError(err instanceof ApiError ? (err.message ?? err.code) : 'Could not reach the party');
        }
      })();
    },
    [code, connect, joinToken]
  );

  const send = useCallback((type: string, payload: unknown) => {
    const stored = storedRef.current;
    const socket = socketRef.current;
    if (!stored || !socket?.connected) return;
    const env: Envelope = {
      v: PROTOCOL_VERSION,
      type,
      sessionId: stored.sessionId,
      senderId: stored.playerId,
      seq: ++seqRef.current,
      ts: Date.now(),
      payload
    };
    socket.emit(WIRE_EVENT, env);
  }, []);

  const setReady = useCallback((ready: boolean) => send('PLAYER_READY', { ready }), [send]);
  const sendInput = useCallback(
    (controlId: string, action: string, value?: string | number | boolean) =>
      send('CONTROLLER_INPUT', { controlId, action, ...(value !== undefined ? { value } : {}) }),
    [send]
  );
  const leaveParty = useCallback(() => {
    send('LEAVE', {});
    clear();
    setPhase('join');
  }, [clear, send]);

  const players = snapshot?.players ?? [];
  const me = players.find((p) => p.playerId === (snapshot?.you?.playerId ?? storedRef.current?.playerId)) ?? null;
  const currentGame = snapshot?.game ? (games.find((g) => g.gameId === snapshot.game?.gameId) ?? null) : null;

  return {
    phase,
    error,
    connected,
    status: snapshot?.status ?? 'lobby',
    players,
    me,
    layout,
    currentGame,
    notice,
    join,
    setReady,
    sendInput,
    leaveParty
  };
}
