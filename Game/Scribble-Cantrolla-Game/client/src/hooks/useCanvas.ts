import { useRef, useState, useEffect, useCallback } from 'react';
import { socket } from '../socket/socket';
import { StrokeData } from '../context/GameContext';

export type CanvasTool = 'brush' | 'eraser' | 'fill' | 'circle' | 'square' | 'triangle';

export function useCanvas(isDrawer: boolean, roomCode?: string) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#2E2A3D');
  const [size, setSize] = useState(5);
  const [tool, setTool] = useState<CanvasTool>('brush');
  
  const currentStrokeRef = useRef<{x: number, y: number}[]>([]);
  const strokeHistoryRef = useRef<StrokeData[]>([]);

  const drawShape = useCallback((ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, strokeColor: string, strokeSize: number, strokeTool: CanvasTool) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = strokeSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (strokeTool === 'fill') {
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      return;
    }

    if (strokeTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-over';
      return;
    }

    if (strokeTool === 'brush') {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.closePath();
      return;
    }

    // Geometric Shapes: Circle, Square, Triangle
    ctx.beginPath();
    if (strokeTool === 'circle') {
      const radius = Math.hypot(x1 - x0, y1 - y0);
      ctx.arc(x0, y0, radius, 0, Math.PI * 2);
    } else if (strokeTool === 'square') {
      const minX = Math.min(x0, x1);
      const minY = Math.min(y0, y1);
      const w = Math.abs(x1 - x0);
      const h = Math.abs(y1 - y0);
      ctx.rect(minX, minY, w, h);
    } else if (strokeTool === 'triangle') {
      ctx.moveTo(x0, y1);
      ctx.lineTo((x0 + x1) / 2, y0);
      ctx.lineTo(x1, y1);
      ctx.closePath();
    }
    ctx.stroke();
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX ?? 0 : (e as any).clientX;
    const clientY = 'touches' in e ? e.touches[0]?.clientY ?? 0 : (e as any).clientY;
    return {
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    };
  };

  const fillCanvas = (fillColor?: string) => {
    if (!canvasRef.current || !isDrawer) return;
    const targetColor = fillColor || color;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.fillStyle = targetColor;
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      strokeHistoryRef.current.push({
        points: [],
        color: targetColor,
        size: 0,
        tool: 'fill' as any
      });
      socket.emit('draw', {
        roomCode,
        strokeData: {
          points: [],
          color: targetColor,
          size: 0,
          tool: 'fill'
        }
      });
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawer) return;
    if (tool === 'fill') {
      fillCanvas();
      return;
    }
    setIsDrawing(true);
    const coords = getCoordinates(e);
    currentStrokeRef.current = [coords, coords];
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isDrawer || tool === 'fill' || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    
    e.preventDefault();
    const coords = getCoordinates(e);

    const w = canvasRef.current.width;
    const h = canvasRef.current.height;

    if (tool === 'brush' || tool === 'eraser') {
      const lastCoords = currentStrokeRef.current[currentStrokeRef.current.length - 1];
      drawShape(ctx, lastCoords.x * w, lastCoords.y * h, coords.x * w, coords.y * h, color, size, tool);
      currentStrokeRef.current.push(coords);

      socket.emit('draw', {
        roomCode,
        strokeData: {
          points: [lastCoords, coords],
          color,
          size,
          tool
        }
      });
    } else {
      // Shape live preview: update 2nd point
      currentStrokeRef.current[1] = coords;
      redrawAll();
      const p0 = currentStrokeRef.current[0];
      drawShape(ctx, p0.x * w, p0.y * h, coords.x * w, coords.y * h, color, size, tool);
    }
  };

  const stopDrawing = () => {
    if (!isDrawer || !isDrawing) return;
    setIsDrawing(false);

    if (tool !== 'brush' && tool !== 'eraser' && tool !== 'fill') {
      const p0 = currentStrokeRef.current[0];
      const p1 = currentStrokeRef.current[1];
      if (p0 && p1) {
        const strokeData: StrokeData = {
          points: [p0, p1],
          color,
          size,
          tool: tool as any
        };
        strokeHistoryRef.current.push(strokeData);
        socket.emit('draw', { roomCode, strokeData });
      }
    } else if (currentStrokeRef.current.length > 1) {
      strokeHistoryRef.current.push({
        points: [...currentStrokeRef.current],
        color,
        size,
        tool: tool as any
      });
    }
    currentStrokeRef.current = [];
  };

  const clearCanvas = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      if (isDrawer) {
        strokeHistoryRef.current = [];
        socket.emit('clearCanvas', { roomCode });
      }
    }
  };

  const undoLastStroke = () => {
    if (!canvasRef.current || !isDrawer) return;
    strokeHistoryRef.current.pop();
    redrawAll();
    socket.emit('undo', { roomCode });
  };

  const redrawAll = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const w = canvasRef.current.width;
    const h = canvasRef.current.height;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    
    strokeHistoryRef.current.forEach(stroke => {
      if (stroke.tool === ('fill' as any)) {
        ctx.fillStyle = stroke.color;
        ctx.fillRect(0, 0, w, h);
      } else if (stroke.tool === 'brush' || stroke.tool === 'eraser') {
        for (let i = 1; i < stroke.points.length; i++) {
          drawShape(
            ctx,
            stroke.points[i - 1].x * w, stroke.points[i - 1].y * h,
            stroke.points[i].x * w, stroke.points[i].y * h,
            stroke.color, stroke.size, stroke.tool
          );
        }
      } else if (stroke.points.length >= 2) {
        drawShape(
          ctx,
          stroke.points[0].x * w, stroke.points[0].y * h,
          stroke.points[1].x * w, stroke.points[1].y * h,
          stroke.color, stroke.size, stroke.tool as CanvasTool
        );
      }
    });
  };

  useEffect(() => {
    const handleDrawingData = (data: StrokeData) => {
      if (!canvasRef.current || isDrawer) return;
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      const w = canvasRef.current.width;
      const h = canvasRef.current.height;

      if (data.tool === ('fill' as any)) {
        ctx.fillStyle = data.color;
        ctx.fillRect(0, 0, w, h);
        return;
      }
      
      if (data.points && data.points.length >= 2) {
        drawShape(ctx, data.points[0].x * w, data.points[0].y * h, data.points[1].x * w, data.points[1].y * h, data.color, data.size, data.tool as CanvasTool);
      }
    };

    const resetCanvas = () => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
      strokeHistoryRef.current = [];
      currentStrokeRef.current = [];
    };

    socket.on('drawingData', handleDrawingData);
    socket.on('canvasCleared', resetCanvas);
    socket.on('newRound', resetCanvas);
    socket.on('roundEnd', resetCanvas);
    socket.on('gameStateChanged', (state: string) => {
      if (state === 'CHOOSING_WORD' || state === 'DRAWING' || state === 'ROUND_END') {
        resetCanvas();
      }
    });

    return () => {
      socket.off('drawingData', handleDrawingData);
      socket.off('canvasCleared', resetCanvas);
      socket.off('newRound', resetCanvas);
      socket.off('roundEnd', resetCanvas);
      socket.off('gameStateChanged');
    };
  }, [isDrawer, drawShape]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!canvasRef.current) return;
      const parent = canvasRef.current.parentElement;
      if (parent) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = canvasRef.current.width;
        tempCanvas.height = canvasRef.current.height;
        tempCtx?.drawImage(canvasRef.current, 0, 0);

        canvasRef.current.width = parent.clientWidth;
        canvasRef.current.height = parent.clientHeight;
        
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          ctx.drawImage(tempCanvas, 0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    canvasRef,
    color, setColor,
    size, setSize,
    tool, setTool,
    clearCanvas,
    fillCanvas,
    undoLastStroke,
    bindEvents: {
      onMouseDown: startDrawing,
      onMouseMove: draw,
      onMouseUp: stopDrawing,
      onMouseLeave: stopDrawing,
      onTouchStart: startDrawing,
      onTouchMove: draw,
      onTouchEnd: stopDrawing
    }
  };
}
