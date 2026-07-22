'use client';

import { useState } from 'react';
import type { GameInfo, PlayerPublic } from '../lib/protocol';

interface Props {
  game: GameInfo;
  players: PlayerPublic[];
  gamestate: unknown;
  onEndGame(): void;
  onEndSession(): void;
}

/**
 * Route: running — full-screen takeover. The design hands this whole surface
 * to the game. Provider host-view bundles land in a later phase; until then
 * the game's live host state renders in the reserved surface.
 */
export function RunningScreen({ game, players, gamestate, onEndGame, onEndSession }: Props) {
  const [menu, setMenu] = useState(false);
  const reconnecting = players.find((p) => p.presence === 'disconnected');
  const connectedCount = players.filter((p) => p.presence === 'connected').length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background:
          'repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0 18px, transparent 18px 36px), radial-gradient(120% 120% at 50% 0%, var(--panel2), #050609)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22
      }}
    >
      {gamestate == null ? (
        <div
          className="font-mono"
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            border: '1.5px dashed var(--line2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 13,
            color: 'var(--faint)',
            textAlign: 'center',
            animation: 'float 4s ease-in-out infinite'
          }}
        >
          GAME
        </div>
      ) : (
        <div
          style={{
            maxWidth: 640,
            width: 'calc(100% - 80px)',
            maxHeight: '38vh',
            borderRadius: 24,
            border: '1.5px dashed var(--line2)',
            padding: '18px 22px',
            overflow: 'auto'
          }}
        >
          <div
            className="font-mono"
            style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.14em', marginBottom: 10 }}
          >
            Live host state · drawn by the game
          </div>
          <pre className="font-mono" style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(gamestate, null, 2)}
          </pre>
        </div>
      )}

      <div style={{ textAlign: 'center' }}>
        <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 34, letterSpacing: '-.02em' }}>
          {game.name} is live
        </div>
        <div style={{ fontSize: 15, color: 'var(--muted)', marginTop: 12, maxWidth: 560, textWrap: 'pretty' }}>
          This is the game&apos;s full-screen main view. Controlla hands the whole screen to the game — the game
          visuals and the phone consoles are drawn by the game itself.
        </div>
      </div>

      <div
        className="font-mono"
        style={{
          position: 'absolute',
          top: 22,
          left: 26,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 13px',
          borderRadius: 999,
          background: 'rgba(0,0,0,.35)',
          border: '1px solid var(--line)',
          fontSize: 12,
          color: 'var(--muted)',
          opacity: 0.6
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', animation: 'pulseDot 2s infinite' }} />
        {connectedCount} connected
      </div>

      <div
        className="icon-btn"
        onClick={() => setMenu((m) => !m)}
        style={{
          position: 'absolute',
          top: 22,
          right: 26,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1px solid var(--line2)',
          background: 'rgba(0,0,0,.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          color: 'var(--muted)',
          cursor: 'pointer',
          backdropFilter: 'blur(6px)'
        }}
      >
        ⋯
      </div>

      {menu && (
        <>
          <div onClick={() => setMenu(false)} style={{ position: 'absolute', inset: 0 }} />
          <div
            style={{
              position: 'absolute',
              top: 72,
              right: 26,
              background: 'var(--panel)',
              border: '1px solid var(--line2)',
              borderRadius: 14,
              padding: 6,
              minWidth: 210,
              boxShadow: '0 20px 50px rgba(0,0,0,.55)'
            }}
          >
            <div
              className="menu-item"
              onClick={() => {
                setMenu(false);
                onEndGame();
              }}
              style={{ padding: '12px 14px', borderRadius: 9, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              End game · see results
            </div>
            <div
              className="menu-item-danger"
              onClick={() => {
                setMenu(false);
                onEndSession();
              }}
              style={{
                padding: '12px 14px',
                borderRadius: 9,
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--danger)',
                cursor: 'pointer'
              }}
            >
              End session
            </div>
          </div>
        </>
      )}

      {reconnecting && (
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '12px 20px',
            borderRadius: 999,
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            fontSize: 13.5,
            boxShadow: '0 16px 40px rgba(0,0,0,.5)'
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              border: '2px solid var(--warn)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          />
          <span style={{ color: 'var(--muted)' }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>{reconnecting.nickname}</span> reconnecting…
          </span>
        </div>
      )}
    </div>
  );
}
