'use client';

import { useEffect, useRef, useState } from 'react';
import { CANVAS_COLORS } from '../lib/protocol';

interface Props {
  controlId: string;
  onInput(controlId: string, action: string, value?: string | number | boolean): void;
}

type Stroke = { c: number; w: number; p: Array<[number, number]> };

const WIDTHS = [4, 10, 22];
const CHUNK = 80; // points per CONTROLLER_INPUT message (fits the 2000-char value budget)

/**
 * The `canvas` layout component: a freehand drawing surface for the phone.
 * Coordinates are quantized to a 0..1000 square and streamed to the game as
 * stroke chunks ("colorIx|width|x,y;x,y;…"); the TV re-renders them from
 * host state. Local echo keeps drawing latency at zero for the drawer.
 */
export function DrawCanvas({ controlId, onInput }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const liveRef = useRef<Stroke | null>(null);
  const [colorIx, setColorIx] = useState(0);
  const [width, setWidth] = useState(WIDTHS[1]!);

  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx2d = canvas?.getContext('2d');
    if (!canvas || !ctx2d) return;
    const scale = canvas.width / 1000;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.lineCap = 'round';
    ctx2d.lineJoin = 'round';
    for (const s of [...strokesRef.current, ...(liveRef.current ? [liveRef.current] : [])]) {
      ctx2d.strokeStyle = CANVAS_COLORS[s.c] ?? '#111318';
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
      const size = canvas.parentElement?.clientWidth ?? 320;
      canvas.width = size * (window.devicePixelRatio || 1);
      canvas.height = canvas.width;
      canvas.style.height = `${size}px`;
      redraw();
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
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
    liveRef.current = { c: colorIx, w: width, p: [toUnit(e)] };
    redraw();
  };

  const move = (e: React.PointerEvent) => {
    const live = liveRef.current;
    if (!live) return;
    const [x, y] = toUnit(e);
    const [lx, ly] = live.p[live.p.length - 1]!;
    if (Math.abs(x - lx) + Math.abs(y - ly) < 6) return; // sample sparsely
    live.p.push([x, y]);
    if (live.p.length >= CHUNK) {
      // Ship the chunk; continue the line from its last point.
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

  const tool = (active: boolean): React.CSSProperties => ({
    width: 34,
    height: 34,
    borderRadius: 10,
    border: active ? '2.5px solid var(--accent)' : '1.5px solid var(--line2)',
    cursor: 'pointer',
    flex: 'none'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 16px 44px rgba(0,0,0,.45)' }}>
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{ display: 'block', width: '100%', touchAction: 'none' }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {CANVAS_COLORS.map((c, i) => (
          <div
            key={c}
            onClick={() => setColorIx(i)}
            style={{ ...tool(colorIx === i), background: c, boxShadow: c === '#ffffff' ? 'inset 0 0 0 1px rgba(0,0,0,.2)' : undefined }}
            title={i === CANVAS_COLORS.length - 1 ? 'Eraser' : undefined}
          />
        ))}
        <span style={{ flex: 1 }} />
        {WIDTHS.map((w) => (
          <div
            key={w}
            onClick={() => setWidth(w)}
            style={{ ...tool(width === w), display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel)' }}
          >
            <span style={{ width: Math.max(4, w * 0.8), height: Math.max(4, w * 0.8), borderRadius: '50%', background: 'var(--text)' }} />
          </div>
        ))}
        <div
          onClick={() => {
            strokesRef.current.pop();
            redraw();
            onInput(controlId, 'undo');
          }}
          className="btn-ghost"
          style={{ padding: '8px 13px', border: '1px solid var(--line2)', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}
        >
          ↩ Undo
        </div>
        <div
          onClick={() => {
            strokesRef.current = [];
            redraw();
            onInput(controlId, 'clear');
          }}
          className="btn-ghost"
          style={{ padding: '8px 13px', border: '1px solid var(--line2)', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}
        >
          ✕ Clear
        </div>
      </div>
    </div>
  );
}
