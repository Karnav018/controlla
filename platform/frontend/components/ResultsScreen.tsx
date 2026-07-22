'use client';

import type { HistoryStats } from '../hooks/useHostSession';
import type { LastGameResults, PlayerPublic } from '../lib/protocol';
import { initialOf, playerColor } from '../lib/palette';

interface Props {
  lastResults: LastGameResults;
  players: PlayerPublic[];
  history: HistoryStats;
  onPlayAgain(): void;
  onEndSession(): void;
  busy: boolean;
}

const medalColor = (i: number) =>
  i === 0 ? 'var(--gold)' : i === 1 ? 'var(--silver)' : i === 2 ? 'var(--bronze)' : 'var(--faint)';

/** Route: results — "Champion of the night" (design 1B). */
export function ResultsScreen({ lastResults, players, history, onPlayAgain, onEndSession, busy }: Props) {
  const byId = new Map(players.map((p) => [p.playerId, p]));
  const nameOf = (playerId: string) => byId.get(playerId)?.nickname ?? 'Player';
  const rankings = lastResults.results.rankings ?? [];
  const winner = rankings[0];
  const winnerName = winner ? nameOf(winner.playerId) : '—';
  const winnerTotal = winner ? (byId.get(winner.playerId)?.score ?? winner.score) : 0;

  // All values are server truth: the finished instance is persisted to Mongo
  // BEFORE GAME_FINISHED is emitted, so the fetched history already includes
  // this game — no invented floors.
  const stats = [
    { label: 'Points', value: winnerTotal.toLocaleString(), color: 'var(--accent)' },
    { label: 'Games won', value: String(winner ? (history.winsByPlayer[winner.playerId] ?? 0) : 0), color: 'var(--text)' },
    { label: 'Games played', value: String(history.gamesPlayed), color: 'var(--text)' },
    { label: 'Players', value: String(players.length), color: 'var(--text)' }
  ];

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'grid',
        gridTemplateColumns: '1.5fr 1fr',
        gap: 28,
        maxWidth: 1200,
        width: '100%',
        margin: '0 auto',
        alignItems: 'stretch',
        padding: '8px 0 6px'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22 }}>
        <div
          className="font-mono"
          style={{ fontSize: 13, color: 'var(--accent)', letterSpacing: '.24em', textTransform: 'uppercase' }}
        >
          {lastResults.results.aborted ? 'Round ended early' : 'Champion of the night'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <div
            className="font-grotesk"
            style={{
              width: 112,
              height: 112,
              borderRadius: '50%',
              background: winner ? playerColor(winner.playerId) : 'var(--panel2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 48,
              color: '#fff',
              animation: 'glow 2.6s infinite'
            }}
          >
            {initialOf(winnerName)}
          </div>
          <div>
            <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 50, letterSpacing: '-.02em', lineHeight: 1 }}>
              {winnerName}
            </div>
            <div className="font-mono" style={{ fontSize: 15, color: 'var(--muted)', marginTop: 8 }}>
              {(winner?.score ?? 0).toLocaleString()} points this game
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 14,
                padding: '14px 18px',
                minWidth: 118
              }}
            >
              <div
                className="font-mono"
                style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.1em' }}
              >
                {s.label}
              </div>
              <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 23, marginTop: 6, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <div
            className="btn-ghost"
            onClick={onEndSession}
            style={{
              padding: '13px 24px',
              border: '1px solid var(--line2)',
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer'
            }}
          >
            New party
          </div>
          <div
            className="btn-accent"
            onClick={busy ? undefined : onPlayAgain}
            style={{
              padding: '13px 26px',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 15,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              cursor: busy ? 'wait' : 'pointer'
            }}
          >
            {busy ? 'Starting…' : 'Play again'}
          </div>
        </div>
      </div>

      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 18,
          padding: '24px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0
        }}
      >
        <div className="font-grotesk" style={{ fontWeight: 600, fontSize: 16, color: 'var(--muted)' }}>
          Final standings
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          {rankings.length === 0 && (
            <div style={{ color: 'var(--faint)', fontSize: 14, padding: '10px 0' }}>
              No standings for this round.
            </div>
          )}
          {rankings.map((r, i) => (
            <div
              key={r.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 13,
                padding: '11px 0',
                borderBottom: '1px solid var(--line)'
              }}
            >
              <span className="font-mono" style={{ fontSize: 13, color: medalColor(i), width: 18 }}>
                {r.rank}
              </span>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: playerColor(r.playerId),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 14,
                  color: '#fff'
                }}
              >
                {initialOf(nameOf(r.playerId))}
              </div>
              <span style={{ flex: 1, fontWeight: 500, fontSize: 15 }}>{nameOf(r.playerId)}</span>
              <span className="font-mono" style={{ fontWeight: 600, fontSize: 15, color: medalColor(i) }}>
                {r.score.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
