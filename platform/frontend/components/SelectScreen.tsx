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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      {games.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--faint)', fontSize: 15, margin: 'auto' }}>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
          {games.map((g) => {
            const tint = gameTint(g.gameId);
            return (
              <div
                key={g.gameId}
                className="game-card"
                style={
                  {
                    position: 'relative',
                    background: 'radial-gradient(120% 100% at 30% 50%, rgba(16, 20, 26, 0.8) 0%, rgba(8, 10, 14, 0.95) 100%)',
                    border: 'none',
                    borderRadius: 0,
                    overflow: 'hidden',
                    cursor: 'default',
                    display: 'flex',
                    flex: 1,
                    width: '100%',
                    boxShadow: 'none',
                    '--card-tint': tint
                  } as React.CSSProperties
                }
              >
                {/* Left Info & Action Panel */}
                <div
                  style={{
                    flex: '1 1 50%',
                    padding: '44px 30px 44px 44px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    zIndex: 2,
                    position: 'relative'
                  }}
                >
                  <div>
                    {/* Header Category & Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 13,
                          color: 'var(--accent)',
                          letterSpacing: '.2em',
                          textTransform: 'uppercase',
                          fontWeight: 700
                        }}
                      >
                        PARTY MODE
                      </span>
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 700,
                          background: 'rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.7)',
                          letterSpacing: '0.04em'
                        }}
                      >
                        v{g.version}
                      </span>
                      {g.featured && (
                        <span
                          style={{
                            padding: '4px 12px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 700,
                            background: 'var(--accent)',
                            color: '#0a0b10'
                          }}
                        >
                          ★ Featured
                        </span>
                      )}
                    </div>

                    {/* Game Title */}
                    <div
                      className="font-grotesk"
                      style={{
                        fontWeight: 800,
                        fontSize: 54,
                        color: '#ffffff',
                        letterSpacing: '-0.03em',
                        lineHeight: 1.1
                      }}
                    >
                      {g.name}
                    </div>

                    {/* Player Count */}
                    <div
                      className="font-mono"
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'var(--accent)',
                        marginTop: 10
                      }}
                    >
                      {g.minPlayers}–{g.maxPlayers} players
                    </div>

                    {/* Game Description */}
                    <div
                      style={{
                        fontSize: 16.5,
                        color: '#9aa0ac',
                        lineHeight: 1.6,
                        marginTop: 16,
                        maxWidth: 480
                      }}
                    >
                      {g.description ?? 'A provider game on the Controlla platform.'}
                    </div>
                  </div>

                  {/* Play Button */}
                  <div style={{ marginTop: 32 }}>
                    <div
                      className="play-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPick(g.gameId);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '16px 36px',
                        borderRadius: 999,
                        fontWeight: 700,
                        fontSize: 17,
                        background: 'var(--accent)',
                        color: '#0c0d10',
                        cursor: 'pointer',
                        boxShadow: '0 6px 24px color-mix(in srgb, var(--accent) 40%, transparent)',
                        transition: 'transform 0.2s ease, filter 0.2s ease'
                      }}
                    >
                      Play {g.name} <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>→</span>
                    </div>
                  </div>
                </div>

                {/* Right Thumbnail Space with Diagonal Divider & Smooth Border Fade */}
                <div
                  style={{
                    flex: '1 1 50%',
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'transparent',
                    maskImage: 'radial-gradient(circle at 55% 50%, rgba(0,0,0,1) 45%, rgba(0,0,0,0) 98%)',
                    WebkitMaskImage: 'radial-gradient(circle at 55% 50%, rgba(0,0,0,1) 45%, rgba(0,0,0,0) 98%)'
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0% 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      background: '#120d0a'
                    }}
                  >
                    <img
                      src="/games/skribix-thumbnail.jpg"
                      alt={`${g.name} Thumbnail`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        objectPosition: 'center 35%',
                        filter: 'brightness(0.92) contrast(1.05)',
                        maskImage: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 12%, rgba(0,0,0,1) 30%, rgba(0,0,0,1) 82%, rgba(0,0,0,0) 100%)',
                        WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.7) 12%, rgba(0,0,0,1) 30%, rgba(0,0,0,1) 82%, rgba(0,0,0,0) 100%)',
                        transition: 'transform 0.4s ease'
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                  </div>

                  {/* Diagonal Line Separator */}
                  <svg
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                      zIndex: 3
                    }}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                  >
                    <line
                      x1="20"
                      y1="0"
                      x2="0"
                      y2="100"
                      stroke="var(--accent)"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
