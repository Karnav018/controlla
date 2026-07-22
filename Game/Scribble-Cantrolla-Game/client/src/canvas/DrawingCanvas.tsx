import { useCanvas } from '../hooks/useCanvas';

interface DrawingCanvasProps {
  isDrawer: boolean;
}

export default function DrawingCanvas({ isDrawer }: DrawingCanvasProps) {
  const { canvasRef, bindEvents } = useCanvas(isDrawer);

  return (
    <div className={`flex-1 w-full bg-white rounded-xl overflow-hidden shadow-inner relative ${isDrawer ? 'cursor-crosshair' : 'cursor-default'}`}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        {...(isDrawer ? bindEvents : {})}
      />
      {!isDrawer && (
        <div className="absolute inset-0 pointer-events-none rounded-xl ring-2 ring-inset ring-purple-500/50"></div>
      )}
    </div>
  );
}
