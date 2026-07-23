'use client';

import { Suspense, useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { resolveGameUrl } from '../../../lib/api';
import { usePlayerSession } from '../../../hooks/usePlayerSession';
import { ControllerPad } from '../../../components/ControllerPad';
import { GameConsoleFrame } from '../../../components/GameConsoleFrame';
import { initialOf, playerColor } from '../../../lib/palette';
import { Logo } from '../../../components/Logo';

export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <PlayInner />
    </Suspense>
  );
}

function PlayInner() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = String(params.code ?? '').toUpperCase();
  const s = usePlayerSession(code, search.get('t'));
  const [nickname, setNickname] = useState('');
  const [copied, setCopied] = useState(false);

  const [isPortrait, setIsPortrait] = useState(false);

  const copyLink = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = url;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const triggerFullscreenAndLandscape = () => {
    if (typeof window === 'undefined') return;
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
      if (window.screen?.orientation && 'lock' in window.screen.orientation) {
        (window.screen.orientation as any).lock('landscape').catch(() => {});
      }
    } catch {}
  };

  const handleJoin = (name: string) => {
    triggerFullscreenAndLandscape();
    s.join(name);
  };

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerWidth < window.innerHeight && window.innerWidth < 850);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'radial-gradient(120% 90% at 50% -10%, var(--bg2), var(--bg))',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column',
        padding: '18px 20px calc(20px + env(safe-area-inset-bottom))'
      }}
    >
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={26} />
          <span className="font-grotesk" style={{ fontWeight: 700, fontSize: 17 }}>
            {s.currentGame?.name || 'Skribix'}
          </span>
        </div>
      </div>

      {/* reconnecting banner */}
      {s.phase === 'in' && !s.connected && (
        <div
          className="font-mono"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 12,
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            fontSize: 12.5,
            color: 'var(--warn)',
            marginBottom: 10
          }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              border: '2px solid var(--warn)',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}
          />
          reconnecting — your seat is safe
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        {(s.phase === 'boot' || s.phase === 'joining') && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 22,
                height: 22,
                border: '3px solid var(--accent)',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}
            />
            <div style={{ color: 'var(--muted)', fontSize: 15 }}>
              {s.phase === 'joining' ? 'Grabbing your seat…' : 'Waking up…'}
            </div>
          </div>
        )}

        {s.phase === 'join' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ textAlign: 'center' }}>
              <div
                className="font-mono"
                style={{ fontSize: 12, color: 'var(--accent)', letterSpacing: '.24em', textTransform: 'uppercase' }}
              >
                Joining party
              </div>
            </div>
            <input
              value={nickname}
              maxLength={24}
              placeholder="Your name"
              autoFocus
              onChange={(e) => setNickname(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && nickname.trim() && handleJoin(nickname.trim())}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line2)',
                borderRadius: 16,
                padding: '18px 18px',
                fontSize: 18,
                textAlign: 'center',
                color: 'var(--text)',
                outline: 'none'
              }}
            />
            <button
              className="font-grotesk"
              onClick={() => nickname.trim() && handleJoin(nickname.trim())}
              disabled={!nickname.trim()}
              style={{
                border: 'none',
                borderRadius: 16,
                padding: '18px',
                fontSize: 19,
                fontWeight: 700,
                background: nickname.trim() ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                color: nickname.trim() ? 'var(--accent-ink)' : 'var(--faint)',
                cursor: nickname.trim() ? 'pointer' : 'not-allowed',
                animation: nickname.trim() ? 'glow 2.4s infinite' : undefined
              }}
            >
              I&apos;m in →
            </button>
            {s.error && (
              <div style={{ textAlign: 'center', color: 'var(--warn)', fontSize: 13.5 }}>{s.error}</div>
            )}
          </div>
        )}

        {s.phase === 'in' && s.status === 'lobby' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, width: '100%', maxWidth: 440, margin: '0 auto' }}>
            {s.me && (
              <div style={{ position: 'relative' }}>
                <div
                  className="font-grotesk"
                  style={{
                    width: 84,
                    height: 84,
                    borderRadius: '50%',
                    background: playerColor(s.me.playerId),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 36,
                    color: '#fff',
                    boxShadow: '0 0 0 3px color-mix(in srgb, var(--accent) 60%, transparent)',
                    animation: 'popIn .4s ease'
                  }}
                >
                  {initialOf(s.me.nickname)}
                </div>
                {s.isMaster && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -4,
                      right: -8,
                      background: '#f59e0b',
                      color: '#000',
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: '.06em',
                      padding: '3px 9px',
                      borderRadius: 999,
                      boxShadow: '0 4px 10px rgba(0,0,0,.4)'
                    }}
                  >
                    MASTER HOST
                  </div>
                )}
              </div>
            )}
            <div style={{ textAlign: 'center' }}>
              <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 26 }}>
                {s.isMaster ? `Room Master, ${s.me?.nickname}` : `You're in, ${s.me?.nickname}`}
              </div>
              <div style={{ color: 'var(--muted)', fontSize: 14.5, marginTop: 6 }}>
                {s.isMaster ? 'You control the game start from your phone!' : 'Waiting for Room Master to start the game.'}
              </div>
              <div className="font-mono" style={{ color: 'var(--faint)', fontSize: 12.5, marginTop: 6 }}>
                {s.players.length} in the room
              </div>
            </div>

            {s.isMaster ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <button
                  onClick={copyLink}
                  style={{
                    border: '1px solid var(--line2)',
                    borderRadius: 14,
                    padding: '12px 18px',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'var(--text)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                  {copied ? 'Link Copied to Clipboard!' : 'Share Room Link to Friends'}
                </button>

                <button
                  className="font-grotesk"
                  onClick={() => s.players.length >= 2 && s.startGame('scribble')}
                  disabled={s.players.length < 2}
                  style={{
                    border: 'none',
                    borderRadius: 16,
                    padding: '18px',
                    fontSize: 20,
                    fontWeight: 800,
                    background: s.players.length >= 2 ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
                    color: s.players.length >= 2 ? 'var(--accent-ink)' : 'var(--faint)',
                    cursor: s.players.length >= 2 ? 'pointer' : 'not-allowed',
                    boxShadow: s.players.length >= 2 ? '0 8px 24px color-mix(in srgb, var(--accent) 40%, transparent)' : 'none',
                    WebkitTapHighlightColor: 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10
                  }}
                >
                  {s.players.length >= 2 ? (
                    <>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      START GAME
                    </>
                  ) : (
                    'Waiting for 2+ Players to Join...'
                  )}
                </button>

                {/* Player List for Master with Kick / Remove buttons */}
                <div
                  style={{
                    background: 'var(--panel)',
                    border: '1px solid var(--line2)',
                    borderRadius: 16,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10
                  }}
                >
                  <div className="font-mono" style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                    Party Players ({s.players.length})
                  </div>
                  {s.players.map((p) => (
                    <div
                      key={p.playerId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 10
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: playerColor(p.playerId),
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 13
                          }}
                        >
                          {initialOf(p.nickname)}
                        </span>
                        <span style={{ fontSize: 14.5, fontWeight: 600 }}>
                          {p.nickname} {p.playerId === s.me?.playerId ? '(You)' : ''}
                        </span>
                      </div>
                      {p.playerId !== s.me?.playerId && (
                        <button
                          onClick={() => s.kickPlayer(p.playerId)}
                          style={{
                            border: '1px solid color-mix(in srgb, var(--warn) 40%, transparent)',
                            background: 'transparent',
                            color: 'var(--warn)',
                            borderRadius: 8,
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <button
                className="font-grotesk"
                onClick={() => s.setReady(!s.me?.ready)}
                style={{
                  border: s.me?.ready ? '1px solid var(--line2)' : 'none',
                  borderRadius: 16,
                  padding: '18px 44px',
                  fontSize: 19,
                  fontWeight: 700,
                  background: s.me?.ready ? 'transparent' : 'var(--accent)',
                  color: s.me?.ready ? 'var(--muted)' : 'var(--accent-ink)',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                {s.me?.ready ? 'Not ready' : "I'm ready!"}
              </button>
            )}

            <button
              onClick={s.leaveParty}
              style={{
                border: 'none',
                background: 'none',
                color: 'var(--faint)',
                fontSize: 13,
                cursor: 'pointer',
                textDecoration: 'underline'
              }}
            >
              leave the party
            </button>
          </div>
        )}

        {s.phase === 'in' && s.status === 'playing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%', maxWidth: 480, margin: '0 auto', flex: 1 }}>
            {s.currentGame?.controllerViewUrl && s.me ? (
              // The game's own console UI — the platform just carries the wire.
              <GameConsoleFrame
                url={resolveGameUrl(s.currentGame.controllerViewUrl)}
                layout={s.layout}
                context={{ playerId: s.me.playerId, nickname: s.me.nickname, code, gameId: s.currentGame.gameId }}
                onInput={s.sendInput}
              />
            ) : s.layout ? (
              <ControllerPad layout={s.layout} onInput={s.sendInput} />
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 16 }}>
                <div className="font-grotesk" style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                  Game on
                </div>
                Watch the TV — no controls needed right now.
              </div>
            )}
          </div>
        )}

        {s.phase === 'ended' && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 28 }}>
              Party&apos;s over
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 15 }}>Thanks for playing. Scan a new QR to go again.</div>
          </div>
        )}
      </div>

      {s.status === 'playing' && isPortrait && (
        <div
          onClick={triggerFullscreenAndLandscape}
          style={{
            position: 'fixed',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '8px 16px',
            borderRadius: 999,
            background: '#fcd34d',
            border: '2px solid #2b2836',
            fontSize: 12.5,
            fontWeight: 800,
            color: '#2b2836',
            boxShadow: '0 4px 12px rgba(0,0,0,.3)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            animation: 'popIn .3s ease'
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 2.1l4 4-4 4"/><path d="M3 12a9 9 0 0115-6.7L21 6"/><path d="M7 21.9l-4-4 4-4"/><path d="M21 12a9 9 0 01-15 6.7L3 18"/></svg>
          Rotate phone sideways for Full Screen
        </div>
      )}

      {s.notice && (
        <div
          style={{
            position: 'fixed',
            bottom: 'calc(18px + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '11px 18px',
            borderRadius: 999,
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            fontSize: 13.5,
            color: 'var(--muted)',
            boxShadow: '0 16px 40px rgba(0,0,0,.5)',
            animation: 'toastIn .25s ease'
          }}
        >
          {s.notice}
        </div>
      )}
    </div>
  );
}
