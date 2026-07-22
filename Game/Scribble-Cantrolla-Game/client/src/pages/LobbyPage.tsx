import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { Avatar, serializeAvatarConfig } from '../components/Avatar';
import { getRandomFunnyName } from '../utils/funnyNames';
import { CrownIcon, RocketIcon, HourglassIcon, CopyIcon, LinkIcon, CheckIcon, UserPlusIcon, SpinnerIcon, WarningIcon } from '../components/Icons';

const PLAYER_SLOT_COLORS = ['var(--player-1)', 'var(--player-2)', 'var(--player-3)', 'var(--player-4)'];

const WORD_THEMES = [
  { id: 'mix', name: 'Random' },
  { id: 'classic', name: 'Classic' },
  { id: 'marvel', name: 'Marvel' },
  { id: 'galaxy', name: 'Galaxy' },
  { id: 'popculture', name: 'Movies' },
  { id: 'food', name: 'Food' },
  { id: 'gaming', name: 'Gaming' }
];

export default function LobbyPage() {
  const { roomCode: paramRoomCode } = useParams();
  const navigate = useNavigate();
  const { 
    roomCode, players, socketId, username, avatar, joinRoom, startGame, leaveRoom, 
    setRounds, setDrawTime, setTheme, totalRounds, drawTime, theme, gameState,
    serverError, clearServerError
  } = useGame();
  
  const [copyState, setCopyState] = useState<'none' | 'code' | 'link'>('none');
  const [isStarting, setIsStarting] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  
  const isLeavingRef = useRef(false);
  const joinedRef = useRef(false);

  const activeRoomCode = roomCode || paramRoomCode || '';

  // Auto-join room EXACTLY ONCE if accessed directly via URL slug and not yet joined
  useEffect(() => {
    if (paramRoomCode && !roomCode && !joinedRef.current && !isLeavingRef.current && players.length === 0) {
      joinedRef.current = true;
      const defaultName = username || getRandomFunnyName();
      const defaultAvatar = avatar || serializeAvatarConfig({ color: 0, eyes: 0, mouth: 0, pose: 0 });
      joinRoom(paramRoomCode.toUpperCase(), defaultName, defaultAvatar);
    }
  }, [paramRoomCode, roomCode, players.length, username, avatar, joinRoom]);

  useEffect(() => {
    if (gameState === 'CHOOSING_WORD' || gameState === 'DRAWING') {
      setIsStarting(false);
      navigate(`/game/${activeRoomCode}`);
    }
  }, [gameState, navigate, activeRoomCode]);

  useEffect(() => {
    if (serverError && !isLeavingRef.current) {
      setIsStarting(false);
      setIsLeaving(false);
    }
  }, [serverError]);

  const copyCodeOnly = () => {
    navigator.clipboard.writeText(activeRoomCode);
    setCopyState('code');
    setTimeout(() => setCopyState('none'), 2000);
  };

  const copyInviteLink = () => {
    const fullUrl = `${window.location.origin}/lobby/${activeRoomCode}`;
    navigator.clipboard.writeText(fullUrl);
    setCopyState('link');
    setTimeout(() => setCopyState('none'), 2000);
  };

  const handleLeave = () => {
    isLeavingRef.current = true;
    joinedRef.current = true;
    setIsLeaving(true);
    clearServerError();
    navigate('/', { replace: true });
    leaveRoom();
  };

  const handleStartGame = () => {
    setIsStarting(true);
    clearServerError();
    startGame();
  };

  const me = players.find(p => p.id === socketId) || players[0];
  const isHost = me?.isHost;

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center p-2 sm:p-4 overflow-y-auto select-none">
      
      {/* Compact Main Lobby Card */}
      <div className="relative z-10 w-full max-w-3xl panel p-3.5 sm:p-5 animate-[fadeInUp_0.3s_ease-out] my-auto space-y-3 overflow-hidden">
        
        {/* Network / Loading Backdrop Blur Overlay */}
        {(isStarting || isLeaving) && (
          <div className="absolute inset-0 z-30 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 animate-[fadeIn_0.2s]">
            <SpinnerIcon size={36} className="text-[var(--coral)]" />
            <span className="font-display font-bold text-base text-[var(--ink)] animate-pulse">
              {isStarting ? 'Launching Game...' : 'Leaving Room...'}
            </span>
          </div>
        )}

        {/* Header Bar */}
        <div className="flex items-center justify-between border-b-2 border-[var(--paper-dot)] pb-2">
          <button 
            onClick={handleLeave} 
            disabled={isLeaving || isStarting}
            className="btn btn-ghost btn-sm py-1 px-3 text-xs flex items-center gap-1.5"
          >
            {isLeaving ? (
              <>
                <SpinnerIcon size={12} />
                <span>Leaving...</span>
              </>
            ) : (
              <span>← Leave Room</span>
            )}
          </button>
          
          <div className="flex items-center gap-2">
            <span className="chip bg-[var(--paper)] text-xs font-bold py-0.5 px-3">
              {players.length} {players.length === 1 ? 'Pawn' : 'Pawns'}
            </span>
          </div>
        </div>

        {serverError && !isLeavingRef.current && (
          <div className="p-2.5 bg-[var(--coral)] text-white text-xs font-bold rounded-lg border-2 border-[var(--ink)] shadow-sm flex items-center justify-between gap-1.5 animate-[bounceIn_0.3s]">
            <div className="flex items-center gap-1.5">
              <WarningIcon size={16} className="shrink-0" />
              <span>{serverError}</span>
            </div>
            <button 
              onClick={handleLeave}
              className="btn btn-ink btn-sm py-0.5 px-2 text-[10px]"
            >
              Go Home
            </button>
          </div>
        )}

        {/* Room Code Share Banner with Dual Icon Copy Buttons */}
        <div className="bg-[var(--sun)] border-2 border-[var(--ink)] rounded-xl p-2.5 sm:p-3 shadow-[3px_3px_0_var(--shadow)] flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest text-[var(--ink)] opacity-75 leading-none">
              Room Code
            </span>
            <span className="font-mono text-2xl sm:text-3xl font-bold tracking-[0.18em] text-[var(--ink)] leading-tight">
              {activeRoomCode}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Copy Room Code Button */}
            <button
              onClick={copyCodeOnly}
              className="btn btn-ink py-2 px-2.5 text-xs font-mono flex items-center gap-1"
              title="Copy Room Code Only"
            >
              {copyState === 'code' ? <CheckIcon size={16} className="text-emerald-400" /> : <CopyIcon size={16} />}
              <span className="text-[11px] font-bold">{copyState === 'code' ? 'Code Copied!' : 'Code'}</span>
            </button>

            {/* Copy Full Invite Link Button */}
            <button
              onClick={copyInviteLink}
              className="btn btn-coral py-2 px-2.5 text-xs font-mono flex items-center gap-1"
              title="Copy Full Invite Link URL"
            >
              {copyState === 'link' ? <CheckIcon size={16} /> : <LinkIcon size={16} />}
              <span className="text-[11px] font-bold">{copyState === 'link' ? 'Link Copied!' : 'Link'}</span>
            </button>
          </div>
        </div>

        {/* Two-Column Grid: Players & Options */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          
          {/* Left Column: Joined Players */}
          <div className="lg:col-span-2 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold font-display text-[var(--ink)]">
                Party Members
              </h3>
              <span className="text-[10px] font-body opacity-60">Any number of players can join</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {/* Joined Players */}
              {players.map((p, idx) => {
                const slotColor = PLAYER_SLOT_COLORS[idx % PLAYER_SLOT_COLORS.length];
                return (
                  <div 
                    key={p.id} 
                    className="relative p-2 panel flex flex-col items-center gap-1 bg-white animate-[fadeIn_0.3s_ease-out]"
                    style={{ borderTop: `4px solid ${slotColor}` }}
                  >
                    {p.isHost && (
                      <div className="absolute top-1 right-1 text-[var(--sun)]" title="Host">
                        <CrownIcon size={14} color="var(--ink)" className="fill-[var(--sun)]" />
                      </div>
                    )}
                    <Avatar avatar={p.avatar} size={42} animated={true} />
                    <div className="text-center w-full min-w-0">
                      <p className="font-bold truncate text-[var(--ink)] text-[11px] font-body leading-tight">
                        {p.username}
                      </p>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--coral)] leading-none mt-0.5">
                        {p.id === socketId ? '( You )' : (p.isHost ? 'Host' : 'Player')}
                      </p>
                    </div>
                  </div>
                );
              })}

              {/* Waiting Placeholders */}
              {Array.from({ length: Math.max(0, 4 - players.length) }).map((_, i) => (
                <div 
                  key={`empty-${i}`} 
                  onClick={copyInviteLink}
                  className="p-2 border-2 border-dashed border-[var(--ink)] opacity-40 hover:opacity-80 rounded-xl flex flex-col items-center justify-center gap-1 min-h-[85px] cursor-pointer transition-all hover:bg-[var(--paper)]"
                  title="Click to copy invite link"
                >
                  <UserPlusIcon size={18} className="text-[var(--ink)] opacity-70" />
                  <p className="text-[10px] font-bold font-body text-center leading-tight">
                    Invite
                  </p>
                  <span className="text-[8px] underline font-mono">Copy Link</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Game Settings */}
          <div className="space-y-2">
            <h3 className="text-sm font-bold font-display text-[var(--ink)]">
              Game Options
            </h3>

            <div className="p-2.5 panel-sm bg-[var(--paper)] space-y-2">
              {/* Word Pack Theme (No Emojis) */}
              <div>
                <label className="label text-[10px] mb-1">Word Pack Theme</label>
                <div className="grid grid-cols-2 gap-1">
                  {WORD_THEMES.map(t => (
                    <button
                      key={t.id}
                      disabled={!isHost || isStarting}
                      onClick={() => setTheme(t.id)}
                      className={`py-1 px-1.5 rounded-lg font-bold text-[10px] border-2 border-[var(--ink)] transition-all truncate text-center ${
                        (theme || 'mix') === t.id 
                          ? 'bg-[var(--grape)] text-white shadow-[1.5px_1.5px_0px_var(--shadow)]' 
                          : 'bg-white text-[var(--ink)] hover:bg-gray-50'
                      } ${(!isHost || isStarting) && 'opacity-60 cursor-not-allowed'}`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label text-[10px] mb-1">Rounds</label>
                <div className="flex gap-1.5">
                  {[3, 5, 7].map(r => (
                    <button
                      key={r}
                      disabled={!isHost || isStarting}
                      onClick={() => setRounds(r)}
                      className={`flex-1 py-1 px-1.5 rounded-lg font-bold text-xs border-2 border-[var(--ink)] transition-all ${
                        totalRounds === r 
                          ? 'bg-[var(--coral)] text-white shadow-[1.5px_1.5px_0px_var(--shadow)]' 
                          : 'bg-white text-[var(--ink)] hover:bg-gray-50'
                      } ${(!isHost || isStarting) && 'opacity-60 cursor-not-allowed'}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label text-[10px] mb-1">Draw Time</label>
                <div className="flex gap-1.5">
                  {[60, 80, 100].map(t => (
                    <button
                      key={t}
                      disabled={!isHost || isStarting}
                      onClick={() => setDrawTime(t)}
                      className={`flex-1 py-1 px-1.5 rounded-lg font-bold text-xs border-2 border-[var(--ink)] transition-all ${
                        drawTime === t 
                          ? 'bg-[var(--sun)] text-[var(--ink)] shadow-[1.5px_1.5px_0px_var(--shadow)]' 
                          : 'bg-white text-[var(--ink)] hover:bg-gray-50'
                      } ${(!isHost || isStarting) && 'opacity-60 cursor-not-allowed'}`}
                    >
                      {t}s
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Start Game CTA */}
        <div className="pt-2 border-t-2 border-[var(--paper-dot)]">
          {isHost ? (
            <div className="space-y-1">
              <button
                onClick={handleStartGame}
                disabled={players.length < 2 || isStarting}
                className="w-full btn btn-coral py-2.5 text-base flex items-center justify-center gap-2"
              >
                {isStarting ? (
                  <>
                    <SpinnerIcon size={18} />
                    <span>Launching Game...</span>
                  </>
                ) : (
                  <>
                    <span>Start Game</span>
                    <RocketIcon size={18} />
                  </>
                )}
              </button>
              {players.length < 2 && (
                <p className="text-center text-[10px] font-bold text-[var(--coral)] leading-tight">
                  Need at least 2 players to start! Share code with a friend.
                </p>
              )}
            </div>
          ) : (
            <div className="p-2 panel-sm bg-white text-center flex items-center justify-center gap-2">
              <HourglassIcon size={16} className="animate-spin text-[var(--ink)] opacity-70" />
              <p className="text-xs font-bold text-[var(--ink)] animate-pulse">
                Waiting for host ({players.find(p => p.isHost)?.username || 'Host'}) to start game...
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
