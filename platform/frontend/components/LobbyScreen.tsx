'use client';

import { QRCodeSVG } from 'qrcode.react';
import type { GameInfo, PlayerPublic, SessionStatePayload } from '../lib/protocol';
import { initialOf, playerColor } from '../lib/palette';

interface Props {
  game: GameInfo;
  snapshot: SessionStatePayload | null;
  players: PlayerPublic[];
  busy: boolean;
  onBack(): void;
  onStart(): void;
}

/** Route: lobby — "Scan to join" (design 1A, centered). */
export function LobbyScreen({ game, snapshot, players, busy, onBack, onStart }: Props) {
  const joinUrl = snapshot?.joinUrl ?? '';
  const code = snapshot?.code ?? '';
  const readyCount = players.filter((p) => p.ready).length;
  const readyLine = players.length ? `${readyCount} of ${players.length} ready` : 'waiting for players to scan';
  const canStart = players.length >= game.minPlayers && !busy;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
      <div
        style={{
          margin: 'auto',
          maxWidth: 820,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            className="font-mono"
            style={{ fontSize: 13, color: 'var(--accent)', letterSpacing: '.24em', textTransform: 'uppercase' }}
          >
            Scan to join
          </div>
          <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 36, letterSpacing: '-.02em', marginTop: 8 }}>
            {game.name}
          </div>
        </div>

        <div
          style={{
            background: '#fff',
            borderRadius: 22,
            padding: 18,
            width: 236,
            height: 236,
            display: 'flex',
            boxShadow: '0 30px 80px rgba(0,0,0,.5)'
          }}
        >
          {joinUrl ? (
            <QRCodeSVG value={joinUrl} style={{ width: '100%', height: '100%' }} fgColor="#0b0c12" bgColor="#ffffff" />
          ) : (
            <div
              style={{
                margin: 'auto',
                width: 20,
                height: 20,
                border: '3px solid #0b0c12',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}
            />
          )}
        </div>



        {players.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, marginTop: 4 }}>
            <div className="font-mono" style={{ fontSize: 13, color: 'var(--muted)' }}>
              {players.length} in the room · {readyLine}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', maxWidth: 660 }}>
              {players.map((p) => (
                <div
                  key={p.playerId}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    margin: '0 6px 6px',
                    animation: 'popIn .4s ease',
                    opacity: p.presence === 'disconnected' ? 0.45 : 1
                  }}
                >
                  <div
                    className="font-grotesk"
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: playerColor(p.playerId),
                      border: '3px solid var(--bg)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 21,
                      color: '#fff',
                      boxShadow: p.ready ? '0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent)' : 'none'
                    }}
                  >
                    {initialOf(p.nickname)}
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      fontSize: 11.5,
                      color:
                        p.presence === 'disconnected' ? 'var(--warn)' : p.ready ? 'var(--accent)' : 'var(--ok)'
                    }}
                  >
                    {p.nickname}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <div
              style={{
                width: 20,
                height: 20,
                border: '3px solid var(--accent)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}
            />
            <div className="font-grotesk" style={{ fontSize: 18, color: 'var(--muted)' }}>
              Waiting for players to scan…
            </div>
          </div>
        )}

        <div style={{ fontSize: 12.5, color: 'var(--faint)', textAlign: 'center' }}>
          Players can join anytime — even after the game starts.
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          <div
            className="btn-ghost"
            onClick={onBack}
            style={{
              padding: '14px 24px',
              border: '1px solid var(--line2)',
              borderRadius: 13,
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            Return Home
          </div>
          <div
            className="font-grotesk"
            onClick={canStart ? onStart : undefined}
            style={{
              padding: '14px 34px',
              borderRadius: 13,
              fontWeight: 700,
              fontSize: 18,
              background: canStart ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
              color: canStart ? 'var(--accent-ink)' : 'var(--faint)',
              cursor: canStart ? 'pointer' : 'not-allowed',
              animation: canStart ? 'glow 2.4s infinite' : undefined
            }}
          >
            {busy ? 'Starting…' : canStart ? 'Start game →' : `Waiting for ${game.minPlayers}+ players`}
          </div>
        </div>
      </div>
    </div>
  );
}
