'use client';

import { useEffect, useRef, useState } from 'react';
import { CANVAS_COLORS } from '../lib/protocol';

interface Props {
  controlId: string;
  onInput(controlId: string, action: string, value?: string | number | boolean): void;
}

type Stroke = { c: number; w: number; p: Array<[number, number]> };

const WIDTHS = [4, 10, 22];
const CHUNK = 80;

export function DrawCanvas({ controlId, onInput }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<Stroke | null>(null);
  const [colorIx, setColorIx] = useState(0);
  const [width, setWidth] = useState(WIDTHS[1]!);
  const [toolMode, setToolMode] = useState<'brush' | 'eraser'>('brush');
  const [isLandscape, setIsLandscape] = useState(false);

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext('2d');
    if (!canvas || !ctx2d) return;
    const scale = canvas.width / 1000;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
    for (const s of [...strokesRef.current, ...(liveRef.current ? [liveRef.current] : [])]) {
      ctx2d.strokeStyle = s.c === 99 ? '#ffffff' : (CANVAS_COLORS[s.c] ?? '#111318');
      ctx2d.lineWidth = Math.max(1, s.w * scale);
      ctx2d.beginPath();
      s.p.forEach(([x, y], i) => (i === 0 ? ctx2d.moveTo(x * scale, y * scale) : ctx2d.lineTo(x * scale, y * scale)));
      if (s.p.length === 1) ctx2d.lineTo(s.p[0]![0] * scale + 0.1, s.p[0]![1] * scale);
      ctx2d.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const fit = () => {
      const parent = canvas.parentElement;
      const landscape = window.innerWidth > window.innerHeight && window.innerWidth < 1100;
      setIsLandscape(landscape);

      let size = 320;
      if (parent) {
        if (landscape) {
          size = Math.min(parent.clientWidth * 0.6, window.innerHeight - 100);
        } else {
          size = Math.min(parent.clientWidth, window.innerHeight - 200);
        }
      }
      canvas.width = size * (window.devicePixelRatio || 1);
      canvas.height = size * (window.devicePixelRatio || 1);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      redraw();
    };

    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('orientationchange', fit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toUnit = (e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000);
    return [Math.min(1000, Math.max(0, x)), Math.min(1000, Math.max(0, y))];
  };

  const flush = (stroke: Stroke) => {
    if (stroke.p.length === 0) return;
    onInput(controlId, 'stroke', `${stroke.c}|${stroke.w}|${stroke.p.map((p) => p.join(',')).join(';')}`);
  };

  const down = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const actualColor = toolMode === 'eraser' ? 99 : colorIx;
    liveRef.current = { c: actualColor, w: width, p: [toUnit(e)] };
    redraw();
  };

  const move = (e: React.PointerEvent) => {
    const live = liveRef.current;
    if (!live) return;
    const [x, y] = toUnit(e);
    const [lx, ly] = live.p[live.p.length - 1]!;
    if (Math.abs(x - lx) + Math.abs(y - ly) < 6) return;
    live.p.push([x, y]);
    if (live.p.length >= CHUNK) {
      flush(live);
      strokesRef.current.push(live);
      liveRef.current = { c: live.c, w: live.w, p: [[x, y]] };
    }
    redraw();
  };

  const up = () => {
    const live = liveRef.current;
    liveRef.current = null;
    if (live && live.p.length > 0) {
      flush(live);
      strokesRef.current.push(live);
    }
    redraw();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isLandscape ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        width: '100%'
      }}
    >
      {/* Canvas Box */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '2.5px solid #2b2836',
          boxShadow: '0 6px 0 #2b2836',
          overflow: 'hidden',
          flex: 'none'
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ display: 'block', touchAction: 'none', background: '#ffffff' }}
        />
      </div>

      {/* 3D Party Control Toolbar */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: '#ffffff',
          border: '2.5px solid #2b2836',
          borderRadius: 18,
          padding: '12px 14px',
          boxShadow: '0 5px 0 #2b2836',
          flex: 1,
          width: isLandscape ? 'auto' : '100%'
        }}
      >
        {/* Tool Mode Buttons */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
          <button
            onClick={() => setToolMode('brush')}
            style={{
              border: '2px solid #2b2836',
              borderRadius: 12,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 800,
              background: toolMode === 'brush' ? '#fcd34d' : '#fff',
              color: '#2b2836',
              cursor: 'pointer',
              boxShadow: toolMode === 'brush' ? '0 2.5px 0 #2b2836' : 'none'
            }}
          >
            ✏️ Brush
          </button>
          <button
            onClick={() => setToolMode('eraser')}
            style={{
              border: '2px solid #2b2836',
              borderRadius: 12,
              padding: '6px 14px',
              fontSize: 13,
              fontWeight: 800,
              background: toolMode === 'eraser' ? '#fcd34d' : '#fff',
              color: '#2b2836',
              cursor: 'pointer',
              boxShadow: toolMode === 'eraser' ? '0 2.5px 0 #2b2836' : 'none'
            }}
          >
            🧹 Eraser
          </button>
        </div>

        {/* Color Palette & Brush Sizes & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {CANVAS_COLORS.map((c, i) => (
            <div
              key={c}
              onClick={() => {
                setColorIx(i);
                setToolMode('brush');
              }}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: c,
                border: colorIx === i && toolMode === 'brush' ? '3px solid #2b2836' : '2px solid #2b2836',
                transform: colorIx === i && toolMode === 'brush' ? 'scale(1.15)' : 'scale(1)',
                cursor: 'pointer',
                boxShadow: '0 2px 0 #2b2836',
                transition: 'transform 0.1s ease'
              }}
            />
          ))}

          <div style={{ flex: 1 }} />

          {/* Stroke Widths */}
          {WIDTHS.map((w) => (
            <div
              key={w}
              onClick={() => setWidth(w)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                border: width === w ? '2.5px solid #2b2836' : '1.5px solid #d1d5db',
                background: width === w ? '#fef08a' : '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <span
                style={{
                  width: Math.max(4, w * 0.6),
                  height: Math.max(4, w * 0.6),
                  borderRadius: '50%',
                  background: '#2b2836'
                }}
              />
            </div>
          ))}

          {/* Undo */}
          <button
            onClick={() => {
              strokesRef.current.pop();
              redraw();
              onInput(controlId, 'undo');
            }}
            style={{
              border: '2px solid #2b2836',
              borderRadius: 10,
              padding: '5px 10px',
              fontSize: 13,
              fontWeight: 800,
              background: '#fff',
              color: '#2b2836',
              cursor: 'pointer',
              boxShadow: '0 2px 0 #2b2836'
            }}
          >
            ↩
          </button>

          {/* Clear */}
          <button
            onClick={() => {
              strokesRef.current = [];
              redraw();
              onInput(controlId, 'clear');
            }}
            style={{
              border: '2px solid #2b2836',
              borderRadius: 10,
              padding: '5px 10px',
              fontSize: 13,
              fontWeight: 800,
              background: '#ef4444',
              color: '#fff',
              cursor: 'pointer',
              boxShadow: '0 2px 0 #2b2836'
            }}
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}
