'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_URL, createSession, fetchGames, fetchResults } from '../lib/api';
import {
  WIRE_EVENT,
  PROTOCOL_VERSION,
  type Envelope,
  type GameInfo,
  type LastGameResults,
  type PlayerPublic,
  type SessionStatePayload
} from '../lib/protocol';

const STORE_KEY = 'controlla.host.session';
const GAME_KEY = 'controlla.host.selectedGame';

interface StoredSession {
  sessionId: string;
  hostToken: string;
  code: string;
}

export interface Toast {
  id: number;
  code: string;
  message: string;
}

export interface HistoryStats {
  gamesPlayed: number;
  winsByPlayer: Record<string, number>;
}

export type HostRoute = 'select' | 'lobby' | 'running' | 'results' | 'finale';

export interface HostSession {
  route: HostRoute;
  games: GameInfo[];
  selectedGame: GameInfo | null;
  session: StoredSession | null;
  snapshot: SessionStatePayload | null;
  players: PlayerPublic[];
  gamestate: unknown;
  lastResults: LastGameResults | null;
  history: HistoryStats;
  connected: boolean;
  busy: boolean;
  toasts: Toast[];
  pickGame(gameId: string): void;
  backToSelect(): void;
  startGame(): void;
  playAgain(): void;
  endGame(): void;
  /** Show the end-of-session podium (session stays alive — phones keep their seats). */
  showFinale(): void;
  /** Leave the finale without ending the session. */
  exitFinale(): void;
  endSession(): void;
}

let toastSeq = 0;

/**
 * The host screen's connection to the platform. Server-authoritative by
 * design: this hook renders snapshots + deltas and sends commands — it never
 * decides anything itself. Reconnection = reconnect with the stored hostToken
 * and let SESSION_STATE rebuild everything (the platform's snapshot rule).
 */
export function useHostSession(): HostSession {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [session, setSession] = useState<StoredSession | null>(null);
  const [snapshot, setSnapshot] = useState<SessionStatePayload | null>(null);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [gamestate, setGamestate] = useState<unknown>(null);
  const [lastResultsLocal, setLastResultsLocal] = useState<LastGameResults | null>(null);
  const [history, setHistory] = useState<HistoryStats>({ gamesPlayed: 0, winsByPlayer: {} });
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [finale, setFinale] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const seqRef = useRef(0);
  const lastServerSeqRef = useRef(0);
  const sessionRef = useRef<StoredSession | null>(null);
  sessionRef.current = session;

  const toast = useCallback((code: string, message: string) => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, code, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const clearLocal = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(GAME_KEY);
    setSession(null);
    setSnapshot(null);
    setSelectedGameId(null);
    setGamestate(null);
    setLastResultsLocal(null);
    setHistory({ gamesPlayed: 0, winsByPlayer: {} });
    setConnected(false);
    setFinale(false);
    lastServerSeqRef.current = 0;
    seqRef.current = 0;
  }, []);

  const refreshHistory = useCallback((sessionId: string) => {
    void fetchResults(sessionId)
      .then((res) => {
        const finished = res.games.filter((g) => g.finishedAt && g.results);
        const winsByPlayer: Record<string, number> = {};
        for (const g of finished) {
          const winner = g.results?.rankings?.[0];
          if (winner) winsByPlayer[winner.playerId] = (winsByPlayer[winner.playerId] ?? 0) + 1;
        }
        setHistory({ gamesPlayed: finished.length, winsByPlayer });
      })
      .catch(() => {});
  }, []);

  const handleEnvelope = useCallback(
    (env: Envelope) => {
      // Snapshot + deltas rule: apply a delta only if newer than what we hold.
      if (env.type === 'SESSION_STATE') {
        lastServerSeqRef.current = env.seq;
        const snap = env.payload as SessionStatePayload;
        setSnapshot(snap);
        setLastResultsLocal(snap.lastResults);
        if (snap.game) setSelectedGameId(snap.game.gameId);
        return;
      }
      if (env.seq <= lastServerSeqRef.current) return;
      lastServerSeqRef.current = env.seq;

      const patchPlayers = (fn: (players: PlayerPublic[]) => PlayerPublic[]) =>
        setSnapshot((s) => (s ? { ...s, players: fn(s.players) } : s));

      switch (env.type) {
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
        case 'PLAYER_DISCONNECTED': {
          const { playerId } = env.payload as { playerId: string };
          patchPlayers((ps) => ps.map((p) => (p.playerId === playerId ? { ...p, presence: 'disconnected' } : p)));
          return;
        }
        case 'PLAYER_RECONNECTED': {
          const { playerId } = env.payload as { playerId: string };
          patchPlayers((ps) => ps.map((p) => (p.playerId === playerId ? { ...p, presence: 'connected' } : p)));
          return;
        }
        case 'PLAYER_LEFT': {
          const { playerId } = env.payload as { playerId: string };
          patchPlayers((ps) => ps.filter((p) => p.playerId !== playerId));
          return;
        }
        case 'GAME_STARTED': {
          const { gameId, instanceId } = env.payload as { gameId: string; instanceId: string };
          setSelectedGameId(gameId);
          localStorage.setItem(GAME_KEY, gameId);
          setGamestate(null);
          setLastResultsLocal(null);
          setSnapshot((s) => (s ? { ...s, status: 'playing', game: { gameId, instanceId }, lastResults: null } : s));
          setBusy(false);
          return;
        }
        case 'GAME_STATE': {
          setGamestate((env.payload as { state: unknown }).state);
          return;
        }
        case 'GAME_FINISHED': {
          const { gameId, instanceId, finishedAt, results } = env.payload as {
            gameId: string;
            instanceId: string;
            finishedAt: number;
            results: LastGameResults['results'];
          };
          const last: LastGameResults = { gameId, instanceId, finishedAt, results };
          setLastResultsLocal(last);
          setGamestate(null);
          setSnapshot((s) => (s ? { ...s, status: 'lobby', game: null, lastResults: last } : s));
          const sid = sessionRef.current?.sessionId;
          if (sid) refreshHistory(sid);
          setBusy(false);
          return;
        }
        case 'SESSION_ENDED': {
          clearLocal();
          return;
        }
        case 'NOTIFICATION': {
          const { code, message } = env.payload as { code: string; message: string };
          toast(code, message);
          setBusy(false);
          return;
        }
        default:
          return; // GAME_SELECTED / GAME_LOADED / CONTROLLER_LAYOUT — nothing to render on the host
      }
    },
    [clearLocal, refreshHistory, toast]
  );

  const connectSocket = useCallback(
    (stored: StoredSession) => {
      socketRef.current?.disconnect();
      const socket = io(API_URL, { auth: { token: stored.hostToken }, transports: ['websocket'] });
      socketRef.current = socket;
      socket.on('connect', () => setConnected(true));
      socket.on('disconnect', () => setConnected(false));
      socket.on('connect_error', (err) => {
        if (err.message === 'SESSION_NOT_FOUND' || err.message === 'UNAUTHORIZED') clearLocal();
      });
      socket.on(WIRE_EVENT, handleEnvelope);
    },
    [clearLocal, handleEnvelope]
  );

  const send = useCallback((type: string, payload: unknown) => {
    const stored = sessionRef.current;
    const socket = socketRef.current;
    if (!stored || !socket) return;
    const env: Envelope = {
      v: PROTOCOL_VERSION,
      type,
      sessionId: stored.sessionId,
      senderId: 'host',
      seq: ++seqRef.current,
      ts: Date.now(),
      payload
    };
    socket.emit(WIRE_EVENT, env);
  }, []);

  // Boot: load games; resume a stored session if present.
  useEffect(() => {
    void fetchGames()
      .then(setGames)
      .catch(() => toast('OFFLINE', 'Cannot reach the Controlla backend'));
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      try {
        const stored = JSON.parse(raw) as StoredSession;
        setSession(stored);
        setSelectedGameId(localStorage.getItem(GAME_KEY));
        connectSocket(stored);
        refreshHistory(stored.sessionId);
      } catch {
        localStorage.removeItem(STORE_KEY);
      }
    }
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickGame = useCallback(
    (gameId: string) => {
      setSelectedGameId(gameId);
      localStorage.setItem(GAME_KEY, gameId);
      setLastResultsLocal(null);
      setSnapshot(null);

      // Always generate a fresh unique room session & QR code
      if (sessionRef.current) {
        socketRef.current?.disconnect();
        socketRef.current = null;
        localStorage.removeItem(STORE_KEY);
        setSession(null);
      }

      setBusy(true);
      void createSession()
        .then((res) => {
          const stored: StoredSession = { sessionId: res.sessionId, hostToken: res.hostToken, code: res.code };
          localStorage.setItem(STORE_KEY, JSON.stringify(stored));
          setSession(stored);
          connectSocket(stored);
        })
        .catch((err) => toast('ERROR', err?.message ?? 'Could not create a session'))
        .finally(() => setBusy(false));
    },
    [connectSocket, toast]
  );

  const backToSelect = useCallback(() => {
    if (sessionRef.current) {
      try { send('HOST_COMMAND', { command: 'END_SESSION' }); } catch {}
    }
    clearLocal();
  }, [clearLocal, send]);

  const startGame = useCallback(() => {
    if (!selectedGameId) return;
    setBusy(true);
    send('HOST_COMMAND', { command: 'START_SESSION', gameId: selectedGameId });
  }, [selectedGameId, send]);

  const playAgain = useCallback(() => {
    const gameId = lastResultsLocal?.gameId ?? selectedGameId;
    if (!gameId) return;
    setBusy(true);
    send('HOST_COMMAND', { command: 'SELECT_GAME', gameId });
  }, [lastResultsLocal, selectedGameId, send]);

  const endGame = useCallback(() => send('HOST_COMMAND', { command: 'END_GAME' }), [send]);

  const showFinale = useCallback(() => {
    // Refresh wins/games-played so the podium reflects the whole night.
    const sid = sessionRef.current?.sessionId;
    if (sid) refreshHistory(sid);
    setFinale(true);
  }, [refreshHistory]);

  const exitFinale = useCallback(() => setFinale(false), []);

  const endSession = useCallback(() => {
    send('HOST_COMMAND', { command: 'END_SESSION' });
    // SESSION_ENDED clears local state; also clear defensively if the socket is gone.
    setTimeout(() => {
      if (sessionRef.current && !socketRef.current?.connected) clearLocal();
    }, 1500);
  }, [clearLocal, send]);

  const selectedGame = games.find((g) => g.gameId === selectedGameId) ?? null;
  const lastResults = lastResultsLocal ?? snapshot?.lastResults ?? null;

  const route: HostRoute = !session
    ? 'select'
    : finale
      ? 'finale'
      : !selectedGameId
        ? 'select'
        : snapshot?.status === 'playing'
          ? 'running'
          : lastResults
            ? 'results'
            : 'lobby';

  return {
    route,
    games,
    selectedGame,
    session,
    snapshot,
    players: snapshot?.players ?? [],
    gamestate,
    lastResults,
    history,
    connected,
    busy,
    toasts,
    pickGame,
    backToSelect,
    startGame,
    playAgain,
    endGame,
    showFinale,
    exitFinale,
    endSession
  };
}
