'use client';

import type { HistoryStats } from '../hooks/useHostSession';
import type { PlayerPublic } from '../lib/protocol';
import { initialOf, playerColor } from '../lib/palette';

interface Props {
  players: PlayerPublic[];
  history: HistoryStats;
  onPlayAgain(): void;
  onNewParty(): void;
}

const medalColor = (i: number) =>
  i === 0 ? 'var(--gold)' : i === 1 ? 'var(--silver)' : i === 2 ? 'var(--bronze)' : 'var(--faint)';

/**
 * End-of-session finale — Champion spotlight (Results design 1B): one big
 * winner moment with headline stats, runners-up tucked into a blurred
 * sidebar. Cumulative session data. "Play again" keeps the session (and every
 * phone) alive; "New party" ends it.
 */
export function SessionFinaleScreen({ players, history, onPlayAgain, onNewParty }: Props) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const winner = ranked[0];
  const winnerName = winner?.nickname ?? '—';

  const stats = [
    { label: 'Points', value: (winner?.score ?? 0).toLocaleString(), color: 'var(--accent)' },
    {
      label: 'Games won',
      value: String(winner ? (history.winsByPlayer[winner.playerId] ?? 0) : 0),
      color: 'var(--text)'
    },
    { label: 'Games played', value: String(history.gamesPlayed), color: 'var(--text)' },
    { label: 'Players', value: String(players.length), color: 'var(--text)' }
  ];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        borderRadius: 26,
        border: '1px solid var(--line)',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(80% 70% at 30% 30%, color-mix(in srgb, var(--accent) 20%, var(--bg2)), var(--bg))',
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr'
      }}
    >
      {/* champion spotlight */}
      <div style={{ padding: 52, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
        <div
          className="font-mono"
          style={{ fontSize: 13, color: 'var(--accent)', letterSpacing: '.24em', textTransform: 'uppercase' }}
        >
          Champion of the night · {history.gamesPlayed} {history.gamesPlayed === 1 ? 'game' : 'games'} played
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div
            className="font-grotesk"
            style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: winner ? playerColor(winner.playerId) : 'var(--panel2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 52,
              color: '#fff',
              animation: 'glow 2.6s infinite'
            }}
          >
            {initialOf(winnerName)}
          </div>
          <div>
            <div
              className="font-grotesk"
              style={{ fontWeight: 700, fontSize: 52, letterSpacing: '-.02em', lineHeight: 1 }}
            >
              {winnerName}
            </div>
            <div className="font-mono" style={{ fontSize: 16, color: 'var(--muted)', marginTop: 8 }}>
              {(winner?.score ?? 0).toLocaleString()} points
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 14,
                padding: '14px 18px',
                minWidth: 120
              }}
            >
              <div
                className="font-mono"
                style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.1em' }}
              >
                {s.label}
              </div>
              <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 24, marginTop: 6, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
          <div
            className="btn-ghost"
            onClick={onPlayAgain}
            style={{
              padding: '13px 24px',
              border: '1px solid var(--line2)',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            Play again
          </div>
          <div
            className="btn-accent"
            onClick={onNewParty}
            style={{
              padding: '13px 24px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 14,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              cursor: 'pointer'
            }}
          >
            New party
          </div>
        </div>
      </div>

      {/* blurred standings sidebar */}
      <div
        style={{
          background: 'color-mix(in srgb, var(--panel) 70%, transparent)',
          borderLeft: '1px solid var(--line)',
          padding: '36px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          backdropFilter: 'blur(8px)',
          overflow: 'auto'
        }}
      >
        <div className="font-grotesk" style={{ fontWeight: 600, fontSize: 16, color: 'var(--muted)' }}>
          Final standings
        </div>
        {ranked.length === 0 && (
          <div style={{ color: 'var(--faint)', fontSize: 14 }}>Nobody stuck around for the credits.</div>
        )}
        {ranked.map((p, i) => (
          <div
            key={p.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 13,
              padding: '10px 0',
              borderBottom: '1px solid var(--line)'
            }}
          >
            <span className="font-mono" style={{ fontSize: 13, color: medalColor(i), width: 18 }}>
              {i + 1}
            </span>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: playerColor(p.playerId),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
                color: '#fff'
              }}
            >
              {initialOf(p.nickname)}
            </div>
            <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{p.nickname}</span>
            <span className="font-mono" style={{ fontWeight: 600, fontSize: 14, color: medalColor(i) }}>
              {p.score.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
