import { useCanvas } from '../hooks/useCanvas';

const PRESET_COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#eab308', '#22c55e', 
  '#3b82f6', '#a855f7', '#ec4899', '#78350f', '#6b7280', '#06b6d4'
];

export default function ToolBar() {
  const { color, setColor, size, setSize, tool, setTool, clearCanvas } = useCanvas(true);

  return (
    <div className="h-16 flex items-center gap-4 bg-black/40 backdrop-blur-md rounded-xl px-4 border border-white/10 shrink-0">
      <div className="flex gap-1 border-r border-white/10 pr-4">
        <button 
          onClick={() => setTool('brush')}
          className={`p-2 rounded-lg transition-colors ${tool === 'brush' ? 'bg-purple-500/50 text-white' : 'text-gray-400 hover:bg-white/10'}`}
          title="Brush"
        >
          🖌️
        </button>
        <button 
          onClick={() => setTool('eraser')}
          className={`p-2 rounded-lg transition-colors ${tool === 'eraser' ? 'bg-pink-500/50 text-white' : 'text-gray-400 hover:bg-white/10'}`}
          title="Eraser"
        >
          🧽
        </button>
      </div>

      <div className="flex gap-1 items-center border-r border-white/10 pr-4">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${c === color && tool === 'brush' ? 'ring-2 ring-white scale-110' : ''}`}
            style={{ backgroundColor: c }}
          />
        ))}
        <input 
          type="color" 
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0 ml-2"
        />
      </div>

      <div className="flex gap-3 items-center border-r border-white/10 pr-4 flex-1">
        {[3, 8, 15].map(s => (
          <button
            key={s}
            onClick={() => setSize(s)}
            className={`flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/10 transition-colors ${size === s ? 'bg-white/20' : ''}`}
          >
            <div className="bg-white rounded-full" style={{ width: s, height: s }}></div>
          </button>
        ))}
        <input
          type="range"
          min="1"
          max="30"
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="w-24 accent-purple-500"
        />
      </div>

      <div className="flex gap-2">
        <button 
          onClick={clearCanvas}
          className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
          title="Clear Canvas"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
