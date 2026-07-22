'use client';

import { useEffect, useRef, useState } from 'react';
import { playerColor, initialOf } from '../../lib/palette';

interface ScribbleState {
  game: 'scribble';
  phase: 'choosing' | 'drawing' | 'reveal' | 'done';
  round: number;
  totalRounds: number;
  drawer: { id: string; name: string } | null;
  hint: string;
  endsAt: number | null;
  colors: string[];
  strokes: Array<{ c: number; w: number; p: Array<[number, number]> }>;
  guessed: string[];
  points: Record<string, number>;
  players: Array<{ id: string; name: string }>;
  feed: Array<{ kind: string; text: string }>;
}

/**
 * The TV for Scribble: renders the drawer's strokes from host state, the
 * masked word, the countdown, and the room's standing — the first provider
 * host view on the platform.
 */
export function ScribbleHostView({ state }: { state: ScribbleState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const size = canvas.parentElement?.clientHeight ?? 480;
    canvas.width = size * (window.devicePixelRatio || 1);
    canvas.height = canvas.width;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const scale = canvas.width / 1000;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of state.strokes) {
      ctx.strokeStyle = state.colors[s.c] ?? '#111318';
      ctx.lineWidth = Math.max(1, s.w * scale);
      ctx.beginPath();
      s.p.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * scale, y * scale) : ctx.lineTo(x * scale, y * scale)));
      if (s.p.length === 1) ctx.lineTo(s.p[0]![0] * scale + 0.1, s.p[0]![1] * scale);
      ctx.stroke();
    }
  }, [state.strokes, state.colors]);

  const secondsLeft = state.endsAt ? Math.max(0, Math.ceil((state.endsAt - now) / 1000)) : null;
  const ranked = [...state.players].sort((a, b) => (state.points[b.id] ?? 0) - (state.points[a.id] ?? 0));

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* top bar: round · hint · timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, justifyContent: 'center' }}>
        <span className="font-mono" style={{ fontSize: 12.5, color: 'var(--faint)', letterSpacing: '.14em' }}>
          ROUND {Math.max(1, state.round)}/{state.totalRounds}
        </span>
        <span
          className="font-mono"
          style={{
            fontSize: state.phase === 'reveal' ? 34 : 28,
            fontWeight: 600,
            letterSpacing: '.3em',
            textTransform: 'uppercase',
            color: state.phase === 'reveal' ? 'var(--accent)' : 'var(--text)'
          }}
        >
          {state.phase === 'choosing' ? '· · ·' : state.hint}
        </span>
        {secondsLeft !== null && (
          <span
            className="font-mono"
            style={{
              fontSize: 16,
              fontWeight: 600,
              padding: '6px 13px',
              borderRadius: 999,
              border: '1px solid var(--line2)',
              color: secondsLeft <= 10 ? 'var(--warn)' : 'var(--muted)',
              animation: secondsLeft <= 10 ? 'blink 1s infinite' : undefined
            }}
          >
            {secondsLeft}s
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 20, justifyContent: 'center' }}>
        {/* the board */}
        <div style={{ position: 'relative', height: '100%', aspectRatio: '1', flex: 'none' }}>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: '#fff',
              borderRadius: 22,
              overflow: 'hidden',
              boxShadow: '0 30px 80px rgba(0,0,0,.5)'
            }}
          >
            <canvas ref={canvasRef} style={{ display: 'block' }} />
            {state.phase === 'choosing' && state.drawer && (
              <div
                className="font-grotesk"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0b0c12',
                  fontSize: 22,
                  fontWeight: 600
                }}
              >
                ✏️ {state.drawer.name} is picking a word…
              </div>
            )}
            {state.phase === 'reveal' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  background: 'rgba(255,255,255,.82)',
                  backdropFilter: 'blur(2px)'
                }}
              >
                <div className="font-mono" style={{ fontSize: 13, color: '#4b5563', letterSpacing: '.2em' }}>
                  THE WORD WAS
                </div>
                <div className="font-grotesk" style={{ fontSize: 44, fontWeight: 700, color: '#0b0c12', letterSpacing: '-.02em' }}>
                  {state.hint.toUpperCase()}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* room rail */}
        <div
          style={{
            width: 280,
            flex: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: 18,
            padding: 18,
            minHeight: 0
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
            {ranked.map((p) => {
              const isDrawer = state.drawer?.id === p.id;
              const hasGuessed = state.guessed.includes(p.id);
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    className="font-grotesk"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: playerColor(p.id),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 14,
                      color: '#fff',
                      boxShadow: hasGuessed ? '0 0 0 2px color-mix(in srgb, var(--accent) 60%, transparent)' : 'none'
                    }}
                  >
                    {initialOf(p.name)}
                  </div>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name} {isDrawer && '✏️'} {hasGuessed && <span style={{ color: 'var(--accent)' }}>✓</span>}
                  </span>
                  <span className="font-mono" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--muted)' }}>
                    {(state.points[p.id] ?? 0).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflow: 'hidden' }}>
            {state.feed.slice(-5).map((f, i) => (
              <div
                key={i}
                className="font-mono"
                style={{
                  fontSize: 11.5,
                  color: f.kind === 'correct' ? 'var(--accent)' : f.kind === 'reveal' ? 'var(--warn)' : 'var(--faint)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {f.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
