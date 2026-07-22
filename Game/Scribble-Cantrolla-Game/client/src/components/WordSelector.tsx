import { useState } from 'react';
import { useGame } from '../context/GameContext';

export default function WordSelector() {
  const { wordOptions, selectWord, timer, gameState } = useGame();
  const [selected, setSelected] = useState(false);

  if (selected || gameState !== 'CHOOSING_WORD') return null;

  const handleSelect = (word: string) => {
    setSelected(true);
    selectWord(word);
  };

  return (
    <div className="absolute inset-0 bg-[rgba(46,42,61,0.7)] backdrop-blur-xs flex flex-col items-center justify-center z-30 animate-[fadeIn_0.3s] p-4">
      <div className="border-3 border-[var(--ink)] bg-[var(--paper)] rounded-2xl p-6 sm:p-8 max-w-md w-full flex flex-col items-center text-center shadow-[6px_6px_0_var(--shadow)]">
        <h2 className="text-2xl sm:text-3xl font-extrabold font-display text-[var(--ink)] mb-1">
          Choose a Word!
        </h2>
        <p className="font-mono text-xs font-bold text-[var(--ink)] opacity-70 mb-5 bg-[var(--sun)] px-3 py-1 rounded-full border border-[var(--ink)] shadow-xs">
          Time left: <span>{timer}s</span>
        </p>
        
        <div className="flex flex-col sm:flex-row gap-2.5 w-full justify-center">
          {wordOptions.map((word, i) => (
            <button
              key={i}
              onClick={() => handleSelect(word)}
              className="btn btn-sun py-2.5 px-4 text-base flex-1 font-body hover:scale-105 active:scale-95 transition-transform"
            >
              {word}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
