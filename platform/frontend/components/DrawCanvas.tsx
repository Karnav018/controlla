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
      const landscape = window.innerWidth > window.innerHeight;
      setIsLandscape(landscape);

      let pxW = 320;
      let pxH = 320;

      if (parent) {
        if (landscape) {
          // Maximize height and fill available width minus slim 90px right panel
          pxH = Math.max(200, window.innerHeight - 80);
          pxW = Math.max(200, parent.clientWidth - 110);
        } else {
          pxW = parent.clientWidth;
          pxH = Math.min(parent.clientWidth, window.innerHeight - 220);
        }
      }

      const ratio = window.devicePixelRatio || 1;
      canvas.width = pxW * ratio;
      canvas.height = pxH * ratio;
      canvas.style.width = `${pxW}px`;
      canvas.style.height = `${pxH}px`;
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
        alignItems: 'stretch',
        justifyContent: 'center',
        gap: 12,
        width: '100%',
        height: isLandscape ? 'calc(100dvh - 65px)' : 'auto'
      }}
    >
      {/* WHITE SPACE (Large Canvas Box) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '2.5px solid #2b2836',
          boxShadow: '0 6px 0 #2b2836',
          overflow: 'hidden',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
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

      {/* EDITOR TOOLBAR (Slim Right Panel in Landscape, Strip in Portrait) */}
      <div
        style={{
          display: 'flex',
          flexDirection: isLandscape ? 'column' : 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          background: '#ffffff',
          border: '2.5px solid #2b2836',
          borderRadius: 18,
          padding: isLandscape ? '10px 8px' : '12px 14px',
          boxShadow: '0 5px 0 #2b2836',
          width: isLandscape ? '94px' : '100%',
          flex: 'none'
        }}
      >
        {/* Mode Toggles */}
        <div style={{ display: 'flex', flexDirection: isLandscape ? 'column' : 'row', gap: 6, width: '100%' }}>
          <button
            onClick={() => setToolMode('brush')}
            title="Brush"
            style={{
              flex: 1,
              border: '2px solid #2b2836',
              borderRadius: 10,
              padding: '6px 4px',
              fontSize: 12,
              fontWeight: 800,
              background: toolMode === 'brush' ? '#fcd34d' : '#fff',
              color: '#2b2836',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/></svg>
            {!isLandscape && 'Brush'}
          </button>
          <button
            onClick={() => setToolMode('eraser')}
            title="Eraser"
            style={{
              flex: 1,
              border: '2px solid #2b2836',
              borderRadius: 10,
              padding: '6px 4px',
              fontSize: 12,
              fontWeight: 800,
              background: toolMode === 'eraser' ? '#fcd34d' : '#fff',
              color: '#2b2836',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 20H7L3 16C2 15 2 13 3 12L13 2C14 1 16 1 17 2L21 6C22 7 22 9 21 10L11 20"/><path d="M17 6L7 16"/></svg>
            {!isLandscape && 'Eraser'}
          </button>
        </div>

        {/* Color Palette Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isLandscape ? 'repeat(2, 1fr)' : 'repeat(8, 1fr)',
            gap: 6,
            justifyItems: 'center'
          }}
        >
          {CANVAS_COLORS.map((c, i) => (
            <div
              key={c}
              onClick={() => {
                setColorIx(i);
                setToolMode('brush');
              }}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: c,
                border: colorIx === i && toolMode === 'brush' ? '3px solid #2b2836' : '1.5px solid #2b2836',
                transform: colorIx === i && toolMode === 'brush' ? 'scale(1.15)' : 'scale(1)',
                cursor: 'pointer'
              }}
            />
          ))}
        </div>

        {/* Stroke Sizes */}
        <div style={{ display: 'flex', flexDirection: isLandscape ? 'row' : 'row', gap: 4 }}>
          {WIDTHS.map((w) => (
            <div
              key={w}
              onClick={() => setWidth(w)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 8,
                border: width === w ? '2px solid #2b2836' : '1px solid #d1d5db',
                background: width === w ? '#fef08a' : '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <span
                style={{
                  width: Math.max(3, w * 0.5),
                  height: Math.max(3, w * 0.5),
                  borderRadius: '50%',
                  background: '#2b2836'
                }}
              />
            </div>
          ))}
        </div>

        {/* Action Buttons: Undo & Clear */}
        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
          <button
            onClick={() => {
              strokesRef.current.pop();
              redraw();
              onInput(controlId, 'undo');
            }}
            title="Undo"
            style={{
              flex: 1,
              border: '2px solid #2b2836',
              borderRadius: 8,
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 800,
              background: '#fff',
              color: '#2b2836',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
          </button>

          <button
            onClick={() => {
              strokesRef.current = [];
              redraw();
              onInput(controlId, 'clear');
            }}
            title="Clear"
            style={{
              flex: 1,
              border: '2px solid #2b2836',
              borderRadius: 8,
              padding: '6px 0',
              fontSize: 12,
              fontWeight: 800,
              background: '#ef4444',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
