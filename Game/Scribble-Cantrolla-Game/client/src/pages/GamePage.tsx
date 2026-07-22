import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGame } from '../context/GameContext';
import { useCanvas } from '../hooks/useCanvas';
import PlayerList from '../components/PlayerList';
import Chat from '../components/Chat';
import Timer from '../components/Timer';
import WordSelector from '../components/WordSelector';
import { BrushIcon, EraserIcon, BucketIcon, CircleIcon, SquareIcon, TriangleIcon, PaletteIcon, UndoIcon, TrashIcon, EyeIcon } from '../components/Icons';

const SPEC_SWATCHES = [
  '#2E2A3D', // Ink
  '#FF6B5B', // Coral
  '#3FC1C9', // Sky
  '#FFC93C', // Sun
  '#9B72E8', // Grape
  '#4CAF7D', // Leaf
  '#F2789F', // Pink
  '#FFFFFF', // White
];

export default function GamePage() {
  const { gameState, currentRound, totalRounds, currentWord, isDrawer, timer, drawTime, theme, players, drawerId, roomCode, leaveRoom } = useGame();
  const navigate = useNavigate();
  const canvas = useCanvas(isDrawer, roomCode);
  const [mobileTab, setMobileTab] = useState<'canvas' | 'players' | 'chat'>('canvas');

  useEffect(() => {
    if (gameState === 'GAME_END') {
      navigate('/results/' + (roomCode || window.location.pathname.split('/').pop()));
    }
  }, [gameState, navigate, roomCode]);

  const drawer = players.find(p => p.id === drawerId);

  const handleQuit = () => {
    leaveRoom();
    navigate('/');
  };

  return (
    <div className="h-screen flex flex-col p-2 sm:p-4 md:p-6 overflow-hidden select-none">
      
      {/* Top Bar Header */}
      <header className="flex flex-wrap justify-between items-center panel p-2.5 sm:p-4 mb-2 sm:mb-4 shrink-0 z-10 gap-2 sm:gap-4">
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="chip bg-[var(--sun)] text-xs sm:text-sm py-1 px-2.5 sm:px-3">
            <span className="text-[10px] sm:text-xs uppercase opacity-70">Round</span>
            <span className="text-sm sm:text-base font-bold">{currentRound} / {totalRounds}</span>
          </div>

          {/* Theme Display Badge */}
          <div className="chip bg-[var(--paper)] text-xs sm:text-sm py-1 px-2.5 sm:px-3 hidden sm:flex items-center gap-1">
            <span className="text-[10px] sm:text-xs uppercase opacity-70">Theme:</span>
            <span className="text-xs sm:text-sm font-bold capitalize text-[var(--coral)]">{theme || 'Random'}</span>
          </div>

          <Timer time={timer} maxTime={drawTime} />
        </div>

        {/* Masked / Active Word Display */}
        <div className="flex-1 text-center min-w-[150px] px-2">
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[var(--ink)] opacity-70 mb-0.5">
            {isDrawer ? 'Draw this word:' : (gameState === 'DRAWING' ? `${drawer?.username || 'Someone'} is drawing` : 'Waiting...')}
          </p>
          <div className="word-display text-xl sm:text-2xl md:text-3xl font-mono whitespace-pre font-bold tracking-[0.2em]">
            {(currentWord || '').trim() || Array(5).fill('_').join(' ')}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile View Toggle Buttons */}
          <div className="flex md:hidden border-2 border-[var(--ink)] rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setMobileTab('canvas')}
              className={`px-2 py-1 text-xs font-bold ${mobileTab === 'canvas' ? 'bg-[var(--sun)]' : 'bg-white'}`}
            >
              Board
            </button>
            <button
              onClick={() => setMobileTab('players')}
              className={`px-2 py-1 text-xs font-bold ${mobileTab === 'players' ? 'bg-[var(--sun)]' : 'bg-white'}`}
            >
              Players
            </button>
            <button
              onClick={() => setMobileTab('chat')}
              className={`px-2 py-1 text-xs font-bold ${mobileTab === 'chat' ? 'bg-[var(--sun)]' : 'bg-white'}`}
            >
              Chat
            </button>
          </div>

          <button onClick={handleQuit} className="btn btn-ghost btn-sm py-1 px-2.5 text-xs">
            Leave Game
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex gap-3 sm:gap-4 min-h-0 relative z-10">
        {/* Left Column: Player List */}
        <div className={`w-full md:w-60 lg:w-64 flex-col gap-4 shrink-0 ${mobileTab === 'players' ? 'flex' : 'hidden md:flex'}`}>
          <PlayerList />
        </div>

        {/* Center Column: Canvas Area */}
        <div className={`flex-1 flex-col gap-2 sm:gap-3 panel p-2 sm:p-3 relative overflow-hidden bg-white ${mobileTab === 'canvas' ? 'flex' : 'hidden md:flex'}`}>
          {/* Canvas Wrapper */}
          <div className={`flex-1 w-full bg-white rounded-xl overflow-hidden relative border-2 border-[var(--ink)] ${isDrawer ? 'cursor-crosshair' : 'cursor-default'}`}>
            <canvas
              ref={canvas.canvasRef}
              className="absolute inset-0 w-full h-full touch-none"
              {...(isDrawer ? canvas.bindEvents : {})}
            />
            {!isDrawer && (
              <div className="absolute top-2 right-2 chip bg-[var(--paper)] text-[10px] sm:text-xs opacity-75 flex items-center gap-1 py-0.5 px-2">
                <EyeIcon size={12} />
                <span>Viewing Mode</span>
              </div>
            )}
          </div>
          
          {/* Compact Toolbar for Drawer with Shapes */}
          {isDrawer && (
            <ToolBarInline canvas={canvas} />
          )}
          
          {gameState === 'CHOOSING_WORD' && isDrawer && <WordSelector />}
          {gameState === 'CHOOSING_WORD' && !isDrawer && !currentWord && (
             <div className="absolute inset-0 bg-[rgba(46,42,61,0.75)] backdrop-blur-xs flex items-center justify-center z-20 p-4">
               <div className="panel bg-[var(--paper)] p-6 text-center max-w-sm w-full">
                 <h2 className="text-xl sm:text-2xl font-bold font-display text-[var(--ink)] animate-pulse">
                   {drawer?.username || 'Drawer'} is choosing a word...
                 </h2>
               </div>
             </div>
          )}
          {gameState === 'ROUND_END' && (
             <div className="absolute inset-0 bg-[rgba(46,42,61,0.85)] flex flex-col items-center justify-center z-30 animate-[fadeIn_0.3s] p-4">
               <div className="panel bg-[var(--paper)] p-6 sm:p-8 text-center max-w-md w-full">
                 <p className="text-[var(--ink)] font-bold text-base sm:text-lg mb-1.5">The word was</p>
                 <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-mono text-[var(--coral)] uppercase tracking-widest">
                   {currentWord}
                 </h2>
               </div>
             </div>
          )}
        </div>

        {/* Right Column: Chat Feed */}
        <div className={`w-full md:w-72 lg:w-80 flex-col gap-4 shrink-0 ${mobileTab === 'chat' ? 'flex' : 'hidden md:flex'}`}>
          <Chat />
        </div>
      </div>
    </div>
  );
}

function ToolBarInline({ canvas }: { canvas: ReturnType<typeof import('../hooks/useCanvas').useCanvas> }) {
  const { color, setColor, size, setSize, tool, setTool, clearCanvas, fillCanvas, undoLastStroke } = canvas;

  const BRUSH_SIZES = [3, 8, 16, 26];

  return (
    <div className="h-12 sm:h-14 flex items-center justify-between gap-1 sm:gap-2 bg-[var(--paper)] rounded-xl px-2 sm:px-3 border-2 border-[var(--ink)] shrink-0 shadow-sm overflow-x-auto">
      {/* Main Tools: Brush, Eraser, Fill Bucket */}
      <div className="flex gap-1 border-r-2 border-[var(--ink)] pr-1 sm:pr-2 shrink-0">
        <button 
          onClick={() => setTool('brush')}
          className={`px-1.5 py-1 rounded-lg border-2 border-[var(--ink)] font-bold text-xs transition-all flex items-center gap-1 ${
            tool === 'brush' ? 'bg-[var(--sun)]' : 'bg-white hover:bg-gray-50'
          }`}
          title="Brush"
        >
          <BrushIcon size={13} />
          <span className="hidden md:inline">Brush</span>
        </button>
        <button 
          onClick={() => setTool('eraser')}
          className={`px-1.5 py-1 rounded-lg border-2 border-[var(--ink)] font-bold text-xs transition-all flex items-center gap-1 ${
            tool === 'eraser' ? 'bg-[var(--coral)] text-white' : 'bg-white hover:bg-gray-50'
          }`}
          title="Eraser (26px)"
        >
          <EraserIcon size={13} />
          <span className="hidden md:inline">Eraser</span>
        </button>
        <button 
          onClick={() => { setTool('fill'); fillCanvas(color); }}
          className={`px-1.5 py-1 rounded-lg border-2 border-[var(--ink)] font-bold text-xs transition-all flex items-center gap-1 ${
            tool === 'fill' ? 'bg-[var(--sky)] text-white' : 'bg-white hover:bg-gray-50'
          }`}
          title="Fill Full Screen Canvas"
        >
          <BucketIcon size={13} />
          <span className="hidden md:inline">Fill</span>
        </button>
      </div>

      {/* Shape Tools: Circle, Square, Triangle */}
      <div className="flex gap-1 border-r-2 border-[var(--ink)] pr-1 sm:pr-2 shrink-0">
        <button 
          onClick={() => setTool('circle')}
          className={`p-1.5 rounded-lg border-2 border-[var(--ink)] transition-all ${
            tool === 'circle' ? 'bg-[var(--sun)]' : 'bg-white hover:bg-gray-50'
          }`}
          title="Circle Tool"
        >
          <CircleIcon size={14} />
        </button>
        <button 
          onClick={() => setTool('square')}
          className={`p-1.5 rounded-lg border-2 border-[var(--ink)] transition-all ${
            tool === 'square' ? 'bg-[var(--sun)]' : 'bg-white hover:bg-gray-50'
          }`}
          title="Square Tool"
        >
          <SquareIcon size={14} />
        </button>
        <button 
          onClick={() => setTool('triangle')}
          className={`p-1.5 rounded-lg border-2 border-[var(--ink)] transition-all ${
            tool === 'triangle' ? 'bg-[var(--sun)]' : 'bg-white hover:bg-gray-50'
          }`}
          title="Triangle Tool"
        >
          <TriangleIcon size={14} />
        </button>
      </div>

      {/* Swatches (8 colors) + Custom Color Picker */}
      <div className="flex gap-1 sm:gap-1.5 items-center border-r-2 border-[var(--ink)] pr-1 sm:pr-2 shrink-0">
        {SPEC_SWATCHES.map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); if (tool === 'eraser') setTool('brush'); }}
            className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-[var(--ink)] transition-transform hover:scale-125 ${
              c === color && tool !== 'eraser' ? 'ring-2 ring-[var(--coral)] scale-110' : ''
            }`}
            style={{ backgroundColor: c }}
            title={c}
          />
        ))}

        {/* Custom Color Wheel Picker */}
        <label
          className="relative w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-[var(--ink)] cursor-pointer flex items-center justify-center bg-gradient-to-tr from-pink-500 via-yellow-400 to-blue-500 hover:scale-110 transition-transform ml-0.5"
          title="Pick Custom Color"
        >
          <PaletteIcon size={10} className="text-white drop-shadow" />
          <input
            type="color"
            value={color}
            onChange={(e) => { setColor(e.target.value); if (tool === 'eraser') setTool('brush'); }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
      </div>

      {/* Brush Sizes */}
      <div className="flex gap-1 items-center border-r-2 border-[var(--ink)] pr-1 sm:pr-2 shrink-0">
        {BRUSH_SIZES.map(s => (
          <button
            key={s}
            onClick={() => setSize(s)}
            className={`flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-[var(--ink)] transition-colors ${
              size === s ? 'bg-[var(--sun)]' : 'bg-white hover:bg-gray-50'
            }`}
            title={`${s}px brush`}
          >
            <div className="bg-[var(--ink)] rounded-full" style={{ width: Math.min(s + 1, 10), height: Math.min(s + 1, 10) }}></div>
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-1 shrink-0">
        <button 
          onClick={undoLastStroke}
          className="btn btn-ghost btn-sm py-1 px-1.5 text-xs"
          title="Undo last stroke"
        >
          <UndoIcon size={13} />
        </button>
        <button 
          onClick={clearCanvas}
          className="btn btn-coral btn-sm py-1 px-1.5 text-xs"
          title="Clear canvas"
        >
          <TrashIcon size={13} />
        </button>
      </div>
    </div>
  );
}
