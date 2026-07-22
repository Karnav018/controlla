import { useGame } from '../context/GameContext';
import { Avatar } from './Avatar';
import { CrownIcon, BrushIcon } from './Icons';

const PLAYER_COLORS = ['var(--player-1)', 'var(--player-2)', 'var(--player-3)', 'var(--player-4)'];

export default function PlayerList() {
  const { players, drawerId, gameState } = useGame();

  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col h-full panel bg-[var(--paper)] overflow-hidden">
      <div className="p-3 bg-white border-b-2 border-[var(--ink)] font-extrabold text-sm font-display text-[var(--ink)] flex justify-between items-center">
        <span>PLAYERS</span>
        <span>SCORE</span>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2 scrollable">
        {sortedPlayers.map((p, i) => {
          const colorAccent = PLAYER_COLORS[i % PLAYER_COLORS.length];
          const isPicasso = p.id === drawerId;

          return (
            <div 
              key={p.id}
              className={`flex items-center justify-between p-2.5 rounded-xl border-2 border-[var(--ink)] transition-all ${
                isPicasso && gameState === 'DRAWING' ? 'bg-[var(--sun)] text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]' :
                p.hasGuessed ? 'bg-[var(--leaf)] text-white' : 
                'bg-white text-[var(--ink)]'
              }`}
              style={{ borderLeft: `6px solid ${colorAccent}` }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xs font-mono font-bold w-4 shrink-0">{i + 1}</span>
                
                <div className="relative shrink-0">
                  <Avatar avatar={p.avatar} size="sm" animated={true} />
                  {isPicasso && (
                    <div className="absolute -bottom-1 -right-1 bg-[var(--sun)] border-2 border-[var(--ink)] rounded-full p-0.5 z-10 text-[var(--ink)] shadow-xs animate-bounce" title="Picasso (Drawing!)">
                      <BrushIcon size={12} />
                    </div>
                  )}
                  {p.isHost && (
                    <div className="absolute -top-2 -right-1 z-10 text-[var(--sun)]">
                      <CrownIcon size={14} color="var(--ink)" className="fill-[var(--sun)]" />
                    </div>
                  )}
                </div>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-sm font-bold truncate font-body ${p.hasGuessed && !isPicasso ? 'text-white' : 'text-[var(--ink)]'}`}>
                      {p.username}
                    </span>
                  </div>

                  {/* Picasso / Drawer Badge */}
                  {isPicasso && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-[9px] font-extrabold font-mono uppercase bg-[var(--ink)] text-[var(--sun)] px-1.5 py-0.2 rounded border border-[var(--ink)] flex items-center gap-1 animate-pulse">
                        <BrushIcon size={9} />
                        <span>Picasso</span>
                      </span>
                    </div>
                  )}

                  {p.hasGuessed && !isPicasso && (
                    <span className="text-[10px] uppercase font-mono font-extrabold tracking-wider opacity-90 mt-0.5">
                      Guessed! ✓
                    </span>
                  )}
                </div>
              </div>
              
              <div className="font-mono text-sm font-bold ml-2 shrink-0">
                {p.score}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
