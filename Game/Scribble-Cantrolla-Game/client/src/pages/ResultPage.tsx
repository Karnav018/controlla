import { useNavigate, useParams } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { Avatar } from '../components/Avatar';
import { CrownIcon, SparklesIcon, GamepadIcon, TrophyIcon } from '../components/Icons';

const CONFETTI_COLORS = ['#FF6B5B', '#3FC1C9', '#FFC93C', '#9B72E8', '#4CAF7D', '#F2789F'];

export default function ResultPage() {
  const { roomCode: paramRoomCode } = useParams();
  const { players, leaveRoom, roomCode } = useGame();
  const navigate = useNavigate();

  const activeRoomCode = roomCode || paramRoomCode || '';

  // Sort players by score. Fallback to mock players if accessed directly via URL
  const activePlayers = players.length > 0 ? players : [
    { id: '1', username: 'WinnerPicasso', avatar: '{"color":2,"eyes":1,"mouth":2,"pose":2}', score: 1450, isHost: true, isReady: true, hasGuessed: true },
    { id: '2', username: 'DoodleKing', avatar: '{"color":0,"eyes":2,"mouth":1,"pose":1}', score: 1120, isHost: false, isReady: true, hasGuessed: true },
    { id: '3', username: 'SketchMaster', avatar: '{"color":3,"eyes":0,"mouth":3,"pose":3}', score: 890, isHost: false, isReady: true, hasGuessed: true },
  ];

  const sortedPlayers = [...activePlayers].sort((a, b) => b.score - a.score);
  const top3 = sortedPlayers.slice(0, 3);
  const rest = sortedPlayers.slice(3);

  const handleHome = () => {
    leaveRoom();
    navigate('/');
  };

  return (
    <div className="min-h-screen w-screen overflow-y-auto flex flex-col items-center justify-center p-3 sm:p-6 relative select-none">
      
      {/* Confetti Animation Background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {Array.from({ length: 35 }).map((_, idx) => {
          const color = CONFETTI_COLORS[idx % CONFETTI_COLORS.length];
          const left = `${(idx * 3) % 100}%`;
          const delay = `${(idx * 0.12) % 2}s`;
          const duration = `${2.5 + ((idx % 5) * 0.4)}s`;

          return (
            <div
              key={idx}
              className="confetti-piece"
              style={{
                left,
                backgroundColor: color,
                animationDelay: delay,
                animationDuration: duration,
              }}
            />
          );
        })}
      </div>

      {/* Main Results Notebook Card */}
      <div className="relative z-10 w-full max-w-2xl panel p-4 sm:p-7 animate-[fadeInUp_0.3s_ease-out] my-auto space-y-5 text-center">
        
        {/* Title Header */}
        <div className="space-y-1 border-b-2 border-[var(--paper-dot)] pb-3">
          <div className="flex items-center justify-center gap-2">
            <TrophyIcon size={32} color="var(--sun)" />
            <h1 className="text-3xl sm:text-4xl font-extrabold font-display text-[var(--ink)] tracking-wide">
              GAME OVER
            </h1>
            <SparklesIcon size={28} color="var(--coral)" />
          </div>
          {activeRoomCode && (
            <span className="chip bg-[var(--paper)] text-xs font-mono py-0.5 px-3">
              Room: {activeRoomCode}
            </span>
          )}
        </div>

        {/* Victory Podium Container */}
        <div className="pt-2 pb-1">
          <div className="flex items-end justify-center gap-2 sm:gap-4 md:gap-5 h-52 w-full max-w-lg mx-auto">
            
            {/* 2nd Place */}
            {top3[1] && (
              <div className="flex flex-col items-center animate-[fadeInUp_0.5s_ease-out_0.2s_both] flex-1 max-w-[120px]">
                <div className="mb-1 border-2 border-[var(--ink)] rounded-xl bg-white p-1 shadow-sm">
                  <Avatar avatar={top3[1].avatar} size={46} animated={true} />
                </div>
                <p className="font-bold text-xs truncate text-[var(--ink)] font-body max-w-full leading-tight">{top3[1].username}</p>
                <p className="text-[10px] font-mono font-bold text-[var(--ink)] opacity-80 leading-none mt-0.5">{top3[1].score} pts</p>
                <div className="w-full h-20 bg-[var(--sky)] border-2 border-[var(--ink)] rounded-t-xl mt-1.5 flex justify-center items-start pt-1.5 shadow-[3px_3px_0_var(--shadow)]">
                  <span className="text-lg font-bold font-display text-white">2</span>
                </div>
              </div>
            )}

            {/* 1st Place */}
            {top3[0] && (
              <div className="flex flex-col items-center animate-[fadeInUp_0.5s_ease-out_both] z-10 flex-1 max-w-[135px]">
                <div className="mb-0.5 text-[var(--sun)]">
                  <CrownIcon size={26} color="var(--ink)" className="fill-[var(--sun)]" />
                </div>
                <div className="mb-1 border-3 border-[var(--ink)] rounded-xl bg-white p-1 shadow-md">
                  <Avatar avatar={top3[0].avatar} size={54} animated={true} />
                </div>
                <p className="font-extrabold text-xs sm:text-sm truncate text-[var(--coral)] font-body max-w-full leading-tight">{top3[0].username}</p>
                <p className="text-[11px] font-mono font-bold text-[var(--ink)] leading-none mt-0.5">{top3[0].score} pts</p>
                <div className="w-full h-28 bg-[var(--sun)] border-2 border-[var(--ink)] rounded-t-xl mt-1.5 flex justify-center items-start pt-2 shadow-[4px_4px_0_var(--shadow)]">
                  <span className="text-2xl font-bold font-display text-[var(--ink)]">1</span>
                </div>
              </div>
            )}

            {/* 3rd Place */}
            {top3[2] && (
              <div className="flex flex-col items-center animate-[fadeInUp_0.5s_ease-out_0.4s_both] flex-1 max-w-[120px]">
                <div className="mb-1 border-2 border-[var(--ink)] rounded-xl bg-white p-1 shadow-sm">
                  <Avatar avatar={top3[2].avatar} size={46} animated={true} />
                </div>
                <p className="font-bold text-xs truncate text-[var(--ink)] font-body max-w-full leading-tight">{top3[2].username}</p>
                <p className="text-[10px] font-mono font-bold text-[var(--ink)] opacity-80 leading-none mt-0.5">{top3[2].score} pts</p>
                <div className="w-full h-14 bg-[var(--coral)] border-2 border-[var(--ink)] rounded-t-xl mt-1.5 flex justify-center items-start pt-1 shadow-[3px_3px_0_var(--shadow)]">
                  <span className="text-base font-bold font-display text-white">3</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard Table for 4th Place and below */}
        {rest.length > 0 && (
          <div className="w-full panel-sm p-2.5 bg-[var(--paper)] max-w-md mx-auto space-y-1">
            {rest.map((p, i) => (
              <div key={p.id || i} className="flex items-center justify-between py-1 px-2 bg-white rounded-lg border border-[var(--ink)] text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold w-4 shrink-0">{i + 4}</span>
                  <Avatar avatar={p.avatar} size={28} animated={true} />
                  <span className="font-bold truncate font-body">{p.username}</span>
                </div>
                <span className="font-mono font-bold shrink-0">{p.score} pts</span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom Play Again CTA */}
        <div className="pt-2 border-t-2 border-[var(--paper-dot)] flex justify-center">
          <button onClick={handleHome} className="btn btn-coral py-2.5 px-6 text-base flex items-center justify-center gap-2">
            <GamepadIcon size={20} />
            <span>Play Again</span>
          </button>
        </div>

      </div>
    </div>
  );
}
