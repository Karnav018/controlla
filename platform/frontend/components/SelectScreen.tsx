'use client';

import type { GameInfo } from '../lib/protocol';
import { gameTint, initialOf } from '../lib/palette';

interface Props {
  games: GameInfo[];
  onPick(gameId: string): void;
}

/** Route: select — "Pick a game". Cards come from GET /games (provider registry). */
export function SelectScreen({ games, onPick }: Props) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
      <div style={{ margin: 'auto', maxWidth: 1160, width: '100%', padding: '26px 0 42px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div
            className="font-mono"
            style={{ fontSize: 13, color: 'var(--accent)', letterSpacing: '.22em', textTransform: 'uppercase' }}
          >
            Party mode
          </div>
          <div
            className="font-grotesk"
            style={{ fontWeight: 700, fontSize: 52, letterSpacing: '-.03em', lineHeight: 1, marginTop: 14 }}
          >
            Pick a game
          </div>
          <div style={{ fontSize: 16, color: 'var(--muted)', marginTop: 14 }}>
            Choose what everyone plays. Phones become the controllers.
          </div>
        </div>

        {games.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--faint)', fontSize: 15, padding: '40px 0' }}>
            <div
              style={{
                width: 20,
                height: 20,
                border: '3px solid var(--accent)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 14px'
              }}
            />
            No games installed yet — providers drop their packages into the platform&apos;s games directory.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20 }}>
            {games.map((g) => {
              const tint = gameTint(g.gameId);
              return (
                <div
                  key={g.gameId}
                  className="game-card"
                  onClick={() => onPick(g.gameId)}
                  style={
                    {
                      background: 'var(--panel)',
                      border: '1px solid var(--line)',
                      borderRadius: 20,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      '--card-tint': tint
                    } as React.CSSProperties
                  }
                >
                  <div style={{ height: 132, position: 'relative', overflow: 'hidden', background: 'var(--panel2)' }}>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(140deg, color-mix(in srgb, ${tint} 42%, var(--panel2)) 0%, var(--panel2) 68%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <span
                        className="font-grotesk"
                        style={{
                          fontWeight: 700,
                          fontSize: 74,
                          color: `color-mix(in srgb, ${tint} 70%, #fff)`,
                          opacity: 0.35,
                          letterSpacing: '-.04em'
                        }}
                      >
                        {initialOf(g.name)}
                      </span>
                    </div>
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: `linear-gradient(180deg, color-mix(in srgb, ${tint} 30%, transparent) 0%, transparent 40%, rgba(10,11,16,.55) 100%)`
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: 14,
                        left: 14,
                        padding: '5px 12px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: `color-mix(in srgb, ${tint} 40%, rgba(0,0,0,.4))`,
                        color: '#fff',
                        backdropFilter: 'blur(4px)'
                      }}
                    >
                      v{g.version}
                    </span>
                    {g.featured && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 14,
                          right: 14,
                          padding: '5px 11px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'var(--accent)',
                          color: 'var(--accent-ink)'
                        }}
                      >
                        ★ Featured
                      </span>
                    )}
                  </div>
                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <div className="font-grotesk" style={{ fontWeight: 600, fontSize: 22, letterSpacing: '-.01em' }}>
                        {g.name}
                      </div>
                      <span className="font-mono" style={{ fontSize: 12, color: 'var(--faint)' }}>
                        {g.minPlayers}–{g.maxPlayers} players
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 13.5,
                        color: 'var(--muted)',
                        lineHeight: 1.45,
                        minHeight: 38,
                        textWrap: 'pretty'
                      }}
                    >
                      {g.description ?? 'A provider game on the Controlla platform.'}
                    </div>
                    <div
                      style={{
                        marginTop: 2,
                        textAlign: 'center',
                        padding: 12,
                        borderRadius: 12,
                        fontWeight: 600,
                        fontSize: 15,
                        background: tint,
                        color: '#0a0b10'
                      }}
                    >
                      Play {g.name}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
