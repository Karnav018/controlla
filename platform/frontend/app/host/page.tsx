'use client';

import { useHostSession, type HostRoute } from '../../hooks/useHostSession';
import { SelectScreen } from '../../components/SelectScreen';
import { LobbyScreen } from '../../components/LobbyScreen';
import { RunningScreen } from '../../components/RunningScreen';
import { ResultsScreen } from '../../components/ResultsScreen';
import { SessionFinaleScreen } from '../../components/SessionFinaleScreen';

const STEP_ORDER: Record<HostRoute, number> = { select: 0, lobby: 1, running: 2, results: 2, finale: 2 };
const STEPS: Array<[string, number]> = [
  ['Pick game', 0],
  ['Lobby', 1],
  ['Live', 2]
];

export default function HostPage() {
  const s = useHostSession();
  const order = STEP_ORDER[s.route];

  return (
    <div
      style={{
        height: '100vh',
        overflow: 'hidden',
        background: 'radial-gradient(120% 90% at 50% -10%, var(--bg2), var(--bg))',
        color: 'var(--text)',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {s.route !== 'running' && s.route !== 'finale' && (
        <header
          style={{
            height: 72,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 34px'
          }}
        >
          <div
            onClick={s.backToSelect}
            style={{ display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer' }}
            title="Return Home"
          >
            <img
              src="/logo.png"
              alt="Controlla Logo"
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                objectFit: 'contain',
                boxShadow: '0 0 20px color-mix(in srgb, var(--accent) 30%, transparent)'
              }}
            />
            <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 22, letterSpacing: '-.02em' }}>
              Controlla
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="font-mono" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--faint)' }}>
              {STEPS.map(([label, i]) => (
                <span
                  key={label}
                  onClick={label === 'Pick game' ? s.backToSelect : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: label === 'Pick game' ? 'pointer' : 'default'
                  }}
                >
                  <span style={{ color: order === i ? 'var(--accent)' : order > i ? 'var(--muted)' : 'var(--faint)' }}>
                    {label}
                  </span>
                  {i < 2 && <span style={{ color: 'var(--line2)' }}>›</span>}
                </span>
              ))}
            </div>
          </div>
        </header>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: s.route === 'finale' ? '34px' : '0 34px 34px'
        }}
      >
        {s.route === 'select' && <SelectScreen games={s.games} onPick={s.pickGame} />}
        {s.route === 'lobby' && s.selectedGame && (
          <LobbyScreen
            game={s.selectedGame}
            snapshot={s.snapshot}
            players={s.players}
            busy={s.busy}
            onBack={s.backToSelect}
            onStart={s.startGame}
          />
        )}
        {s.route === 'running' && s.selectedGame && (
          <RunningScreen
            game={s.selectedGame}
            players={s.players}
            gamestate={s.gamestate}
            onEndGame={s.endGame}
            onEndSession={() => {
              // Finish the round so the night's records are complete, then podium.
              s.endGame();
              s.showFinale();
            }}
          />
        )}
        {s.route === 'results' && s.lastResults && (
          <ResultsScreen
            lastResults={s.lastResults}
            players={s.players}
            history={s.history}
            onPlayAgain={s.playAgain}
            onEndSession={s.showFinale}
            busy={s.busy}
          />
        )}
        {s.route === 'finale' && (
          <SessionFinaleScreen
            players={s.players}
            history={s.history}
            onPlayAgain={() => {
              s.exitFinale();
              s.backToSelect(); // straight to the game picker — same session, same phones
            }}
            onNewParty={s.endSession}
          />
        )}
      </div>

      {/* NOTIFICATION toasts */}
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        {s.toasts.map((t) => (
          <div
            key={t.id}
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              background: 'var(--panel)',
              border: '1px solid var(--line2)',
              boxShadow: '0 16px 40px rgba(0,0,0,.5)',
              fontSize: 13.5,
              maxWidth: 340,
              animation: 'toastIn .25s ease'
            }}
          >
            <span className="font-mono" style={{ color: 'var(--warn)', fontSize: 11, letterSpacing: '.08em' }}>
              {t.code}
            </span>
            <div style={{ color: 'var(--muted)', marginTop: 3 }}>{t.message}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
