import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { AvatarCustomizer } from '../components/AvatarCustomizer';
import { AvatarConfig, serializeAvatarConfig } from '../components/Avatar';
import { getRandomFunnyName } from '../utils/funnyNames';
import { DiceIcon, WarningIcon, SpinnerIcon, SparklesIcon } from '../components/Icons';

export default function HomePage() {
  const [name, setName] = useState('');
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>({ color: 0, eyes: 0, mouth: 0, pose: 0 });
  const [avatarString, setAvatarString] = useState(serializeAvatarConfig({ color: 0, eyes: 0, mouth: 0, pose: 0 }));
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loadingAction, setLoadingAction] = useState<'create' | 'join' | null>(null);
  
  const navigate = useNavigate();
  const { createRoom, joinRoom, roomCode, serverError, clearServerError } = useGame();

  useEffect(() => {
    if (roomCode) {
      setLoadingAction(null);
      navigate(`/lobby/${roomCode}`);
    }
  }, [roomCode, navigate]);

  useEffect(() => {
    if (serverError) {
      setErrorMsg(serverError);
      setLoadingAction(null);
    }
  }, [serverError]);

  const handleAvatarChange = (config: AvatarConfig, serialized: string) => {
    setAvatarConfig(config);
    setAvatarString(serialized);
  };

  const generateRandomName = () => {
    const randomName = getRandomFunnyName();
    setName(randomName);
    if (errorMsg) setErrorMsg('');
    clearServerError();
  };

  const handleCreate = () => {
    const finalName = name.trim() || getRandomFunnyName();
    setName(finalName);
    setErrorMsg('');
    clearServerError();
    setLoadingAction('create');
    createRoom(finalName, avatarString);
  };

  const handleJoin = () => {
    if (joinCode.length !== 6) {
      setErrorMsg('Room code must be 6 characters');
      return;
    }
    const finalName = name.trim() || getRandomFunnyName();
    setName(finalName);
    setErrorMsg('');
    clearServerError();
    setLoadingAction('join');
    joinRoom(joinCode.toUpperCase(), finalName, avatarString);
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto select-none relative">
      
      {/* Main Landing Panel */}
      <div className="relative z-10 w-full max-w-[360px] sm:max-w-md p-3.5 sm:p-5 panel animate-[fadeInUp_0.3s_ease-out] my-auto overflow-hidden">
        
        {/* Network / Loading Blur Backdrop Overlay */}
        {loadingAction && (
          <div className="absolute inset-0 z-30 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2 animate-[fadeIn_0.2s]">
            <SpinnerIcon size={32} className="text-[var(--coral)]" />
            <span className="font-display font-bold text-sm text-[var(--ink)] animate-pulse">
              {loadingAction === 'create' ? 'Creating Room...' : 'Joining Room...'}
            </span>
          </div>
        )}

        {/* Title Header */}
        <div className="text-center mb-2.5">
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-[var(--ink)] tracking-wide relative inline-block">
            Skribix Party
          </h1>
          <svg className="logo-squiggle w-28 h-2 mx-auto" viewBox="0 0 160 12" fill="none">
            <path d="M3 9C25 3 45 10 65 5C85 1 105 10 125 4C145 -2 155 8 157 7" stroke="var(--coral)" strokeWidth="4" strokeLinecap="round"/>
          </svg>
          <p className="text-[9px] sm:text-[11px] font-semibold text-[var(--ink)] opacity-70 mt-0.5 uppercase tracking-wider font-body">Draw • Guess • Win</p>
        </div>

        {errorMsg && (
          <div className="mb-2.5 p-2 bg-[var(--coral)] text-white text-xs font-bold rounded-lg border-2 border-[var(--ink)] shadow-sm flex items-center justify-center gap-1.5 animate-[bounceIn_0.3s]">
            <WarningIcon size={14} className="shrink-0" />
            <span className="leading-tight">{errorMsg}</span>
          </div>
        )}

        <div className="space-y-2.5">
          {/* Name Input Area */}
          <div>
            <div className="flex justify-between items-center mb-0.5">
              <label className="label mb-0 text-[10px]">Your Name</label>
              <button
                type="button"
                onClick={generateRandomName}
                disabled={!!loadingAction}
                className="text-[10px] font-bold text-[var(--coral)] hover:underline flex items-center gap-1 disabled:opacity-50"
                title="Generate funny random name"
              >
                <DiceIcon size={12} />
                <span>Random Name</span>
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                maxLength={15}
                value={name}
                disabled={!!loadingAction}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMsg) setErrorMsg('');
                  clearServerError();
                }}
                className="input py-1.5 px-3 text-xs sm:text-sm pr-8 disabled:opacity-60"
                placeholder="Enter name or leave blank..."
              />
              <button
                type="button"
                onClick={generateRandomName}
                disabled={!!loadingAction}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ink)] opacity-60 hover:opacity-100 hover:scale-110 transition-all disabled:opacity-40"
                title="Randomize Name"
              >
                <DiceIcon size={16} />
              </button>
            </div>
          </div>

          {/* Compact Responsive Avatar Customizer */}
          <AvatarCustomizer config={avatarConfig} onChange={handleAvatarChange} />

          {/* Action Buttons */}
          {!showJoin ? (
            <div className="flex gap-2 pt-0.5">
              <button
                onClick={handleCreate}
                disabled={!!loadingAction}
                className="flex-1 btn btn-coral py-2 text-sm sm:text-base flex items-center justify-center gap-1.5"
              >
                {loadingAction === 'create' ? (
                  <>
                    <SpinnerIcon size={16} />
                    <span>Creating...</span>
                  </>
                ) : (
                  <span>Create Room</span>
                )}
              </button>
              <button
                onClick={() => {
                  setShowJoin(true);
                  if (errorMsg) setErrorMsg('');
                  clearServerError();
                }}
                disabled={!!loadingAction}
                className="flex-1 btn btn-sky py-2 text-sm sm:text-base"
              >
                Join Room
              </button>
            </div>
          ) : (
            <div className="space-y-2 pt-0.5 animate-[fadeIn_0.3s_ease-out]">
              <div>
                <label className="label mb-0.5 text-[10px]">Room Code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  disabled={!!loadingAction}
                  onChange={(e) => {
                    setJoinCode(e.target.value.toUpperCase());
                    if (errorMsg) setErrorMsg('');
                    clearServerError();
                  }}
                  className="input input-mono py-1.5 text-base sm:text-lg disabled:opacity-60"
                  placeholder="XXXXXX"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowJoin(false);
                    if (errorMsg) setErrorMsg('');
                    clearServerError();
                  }}
                  disabled={!!loadingAction}
                  className="flex-1 btn btn-ghost py-1.5 text-xs sm:text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleJoin}
                  disabled={joinCode.length !== 6 || !!loadingAction}
                  className="flex-[2] btn btn-grape py-1.5 text-xs sm:text-sm flex items-center justify-center gap-1.5"
                >
                  {loadingAction === 'join' ? (
                    <>
                      <SpinnerIcon size={14} />
                      <span>Joining...</span>
                    </>
                  ) : (
                    <span>Join Game</span>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom-Right Watermark Badge */}
      <div className="fixed bottom-3 right-3 z-20 animate-[fadeIn_0.5s_ease-out]">
        <div className="chip bg-white text-[11px] font-extrabold text-[var(--ink)] shadow-[2.5px_2.5px_0_var(--ink)] border-2 border-[var(--ink)] flex items-center gap-1.5 py-1 px-3">
          <SparklesIcon size={13} color="var(--coral)" />
          <span>Made by <strong className="text-[var(--coral)] font-black">Controlla</strong></span>
        </div>
      </div>

    </div>
  );
}
