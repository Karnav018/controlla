'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminLogin,
  adminGames,
  adminPatchGame,
  adminUninstallGame,
  adminSessions,
  adminEndSession,
  adminStats,
  adminActivity,
  adminConfig,
  adminInstallGame,
  adminRescanGames
} from '../../lib/adminApi';
import { ApiError } from '../../lib/api';
import { gameTint, initialOf } from '../../lib/palette';
import type {
  AdminActivityItem,
  AdminConfigEntry,
  AdminGame,
  AdminSession,
  AdminStats
} from '../../lib/protocol';

const TOKEN_KEY = 'controlla.admin.token';
const EMAIL_KEY = 'controlla.admin.email';

/** Admin design theme: Violet accent (design default), scoped to this page. */
const THEME = { '--accent': 'oklch(0.72 0.2 300)', '--accent-ink': '#17071f' } as React.CSSProperties;

type Route = 'overview' | 'games' | 'sessions' | 'settings';

/**
 * Operator panel (Controlla Admin design). Deliberately unlinked from the
 * rest of the app — reachable only by typing /admin. Everything is live
 * server data, polled.
 */
export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem(TOKEN_KEY));
    setEmail(localStorage.getItem(EMAIL_KEY) ?? '');
    setBooted(true);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  if (!booted) return <div style={{ ...THEME, height: '100vh', background: 'var(--bg)' }} />;
  return token ? (
    <Dashboard token={token} email={email} onAuthLost={signOut} />
  ) : (
    <Login
      onSignedIn={(t, e) => {
        localStorage.setItem(TOKEN_KEY, t);
        localStorage.setItem(EMAIL_KEY, e);
        setToken(t);
        setEmail(e);
      }}
    />
  );
}

// ── login gate (unlinked; credentials only) ──────────────────────────────

function Login({ onSignedIn }: { onSignedIn(token: string, email: string): void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    if (!email.trim() || !password || busy) return;
    setBusy(true);
    setError(null);
    adminLogin(email.trim(), password)
      .then((res) => onSignedIn(res.adminToken, res.email))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Cannot reach the backend'))
      .finally(() => setBusy(false));
  };

  const field: React.CSSProperties = {
    background: 'var(--panel)',
    border: '1px solid var(--line2)',
    borderRadius: 12,
    padding: '15px 16px',
    fontSize: 15,
    color: 'var(--text)',
    outline: 'none'
  };

  return (
    <div
      style={{
        ...THEME,
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, justifyContent: 'center', marginBottom: 8 }}>
          <img src="/logo.png" alt="Controlla Logo" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'contain' }} />
          <div>
            <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>
              Controlla
            </div>
            <div className="font-mono" style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.14em', marginTop: 3 }}>
              ADMIN
            </div>
          </div>
        </div>
        <input style={field} type="email" placeholder="Email" value={email} autoFocus
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <input style={field} type="password" placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <button
          className="font-grotesk"
          onClick={submit}
          disabled={busy || !email.trim() || !password}
          style={{
            border: 'none', borderRadius: 12, padding: 15, fontSize: 16, fontWeight: 700,
            background: email.trim() && password ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
            color: email.trim() && password ? '#fff' : 'var(--faint)',
            cursor: busy ? 'wait' : 'pointer'
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {error && <div style={{ textAlign: 'center', color: 'var(--warn)', fontSize: 13.5 }}>{error}</div>}
      </div>
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────

function Toggle({ on, onClick, size = 22 }: { on: boolean; onClick(): void; size?: number }) {
  const knob = size - 4;
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        width: size * 1.75,
        height: size,
        borderRadius: 999,
        background: on ? 'var(--accent)' : 'rgba(255,255,255,0.14)',
        position: 'relative',
        display: 'inline-block',
        cursor: 'pointer',
        transition: 'background .15s',
        flex: 'none'
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? size * 1.75 - knob - 2 : 2,
          width: knob,
          height: knob,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left .15s'
        }}
      />
    </span>
  );
}

const card: React.CSSProperties = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14 };
const monoLabel: React.CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--faint)',
  textTransform: 'uppercase', letterSpacing: '.06em'
};

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── dashboard ────────────────────────────────────────────────────────────

function Dashboard({ token, email, onAuthLost }: { token: string; email: string; onAuthLost(): void }) {
  const [route, setRoute] = useState<Route>('overview');
  const [games, setGames] = useState<AdminGame[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activity, setActivity] = useState<AdminActivityItem[]>([]);
  const [config, setConfig] = useState<AdminConfigEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'local' | 'marketplace' | 'disabled'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [healthy, setHealthy] = useState(true);

  const refresh = useCallback(() => {
    Promise.all([adminGames(token), adminSessions(token), adminStats(token), adminActivity(token), adminConfig(token)])
      .then(([g, s, st, a, c]) => {
        setGames(g);
        setSessions(s);
        setStats(st);
        setActivity(a);
        setConfig(c);
        setHealthy(true);
        setSelectedId((cur) => cur ?? g[0]?.gameId ?? null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) onAuthLost();
        else setHealthy(false);
      });
  }, [token, onAuthLost]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const patch = (pluginId: string, flags: { enabled?: boolean; featured?: boolean }) => {
    setGames((gs) => gs.map((g) => (g.gameId === pluginId ? { ...g, ...flags } : g)));
    adminPatchGame(token, pluginId, flags).then(refresh, refresh);
  };
  const uninstall = (pluginId: string) => {
    setSelectedId(null);
    adminUninstallGame(token, pluginId).then(refresh, refresh);
  };

  const titles: Record<Route, [string, string]> = {
    overview: ['Overview', 'Platform health and game activity'],
    games: ['Games', 'Manage the plugin registry hosts can play'],
    sessions: ['Sessions', 'Live sessions across the platform'],
    settings: ['Settings', 'Runtime configuration (env-managed)']
  };
  const [pageTitle, pageSub] = titles[route];

  const filtered = useMemo(
    () =>
      games.filter((g) =>
        filter === 'all' ? true : filter === 'disabled' ? !g.enabled : g.source === filter
      ),
    [games, filter]
  );
  const selected = games.find((g) => g.gameId === selectedId) ?? filtered[0] ?? null;

  const navItems: Array<[Route, string]> = [
    ['overview', 'Overview'],
    ['games', 'Games'],
    ['sessions', 'Sessions'],
    ['settings', 'Settings']
  ];

  return (
    <div
      style={{
        ...THEME,
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--text)'
      }}
    >
      {/* sidebar */}
      <aside
        style={{
          width: 230,
          flex: 'none',
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, var(--panel), var(--bg))'
        }}
      >
        <div style={{ padding: '22px 20px 18px', display: 'flex', alignItems: 'center', gap: 11, borderBottom: '1px solid var(--line)' }}>
          <img src="/logo.png" alt="Controlla Logo" style={{ width: 30, height: 30, borderRadius: 8, objectFit: 'contain', flex: 'none' }} />
          <div>
            <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-.02em', lineHeight: 1 }}>Controlla</div>
            <div className="font-mono" style={{ fontSize: 10, color: 'var(--faint)', letterSpacing: '.14em', marginTop: 3 }}>ADMIN</div>
          </div>
        </div>
        <nav style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          {navItems.map(([id, label]) => {
            const on = route === id;
            return (
              <div
                key={id}
                className="menu-item"
                onClick={() => setRoute(id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 9,
                  cursor: 'pointer', color: on ? 'var(--text)' : 'var(--muted)',
                  background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                  fontSize: 13.5, fontWeight: 500
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2.5, background: on ? 'var(--accent)' : 'var(--faint)', flex: 'none' }} />
                {label}
              </div>
            );
          })}
        </nav>
        <div style={{ padding: 14, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#fff', flex: 'none' }}>
            {email.slice(0, 2).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
            <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>owner · full access</div>
          </div>
          <span className="icon-btn" onClick={onAuthLost} title="Sign out" style={{ cursor: 'pointer', color: 'var(--faint)', fontSize: 15 }}>⏻</span>
        </div>
      </aside>

      {/* main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{ height: 62, flex: 'none', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 26px' }}>
          <div>
            <div className="font-grotesk" style={{ fontWeight: 600, fontSize: 17, letterSpacing: '-.02em' }}>{pageTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{pageSub}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="font-mono" style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', border: '1px solid var(--line)', borderRadius: 999, fontSize: 12, color: 'var(--muted)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: healthy ? 'var(--ok)' : 'var(--danger)', animation: 'pulseDot 2s infinite' }} />
              {healthy ? 'runtime healthy' : 'backend unreachable'}
            </div>
            {route === 'games' && (
              <div onClick={() => setAddOpen(true)} style={{ padding: '9px 16px', borderRadius: 9, background: 'var(--accent)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                + Add game
              </div>
            )}
          </div>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 26px' }}>
          {route === 'overview' && stats && (
            <div style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
                {[
                  ['Active sessions', stats.activeSessions, 'lobby + playing'],
                  ['Players in rooms', stats.playersInRooms, 'live seats'],
                  ['Rounds played', stats.gamesPlayed, 'all time'],
                  ['Sessions all-time', stats.totalSessions, 'durable record']
                ].map(([label, value, sub]) => (
                  <div key={String(label)} style={{ ...card, padding: 20 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
                    <div className="font-mono" style={{ fontWeight: 600, fontSize: 30, marginTop: 8 }}>{Number(value).toLocaleString()}</div>
                    <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--faint)', marginTop: 6 }}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ ...card, padding: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Most played games</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
                    {stats.byGame.length === 0 && <div style={{ color: 'var(--faint)', fontSize: 13 }}>No rounds played yet.</div>}
                    {stats.byGame.slice(0, 5).map((g) => {
                      const max = stats.byGame[0]?.plays || 1;
                      return (
                        <div key={g.gameId} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                          <span style={{ width: 96, fontSize: 13.5, flex: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.gameId}</span>
                          <div style={{ flex: 1, height: 9, background: 'var(--panel2)', borderRadius: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.round((g.plays / max) * 100)}%`, background: 'var(--accent)', borderRadius: 6 }} />
                          </div>
                          <span className="font-mono" style={{ fontSize: 12, color: 'var(--muted)', width: 56, textAlign: 'right' }}>{g.plays.toLocaleString()}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ ...card, padding: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 16 }}>Recent activity</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {activity.length === 0 && <div style={{ color: 'var(--faint)', fontSize: 13 }}>Nothing yet.</div>}
                    {activity.slice(0, 6).map((a, i) => (
                      <div key={i} style={{ display: 'flex', gap: 11 }}>
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%', marginTop: 5, flex: 'none',
                          background: a.kind === 'game-finished' ? 'var(--ok)' : a.kind === 'game-installed' ? 'var(--accent)' : a.kind === 'game-aborted' ? 'var(--warn)' : 'var(--faint)'
                        }} />
                        <div>
                          <div style={{ fontSize: 12.5, lineHeight: 1.35 }}>{a.text}</div>
                          <div className="font-mono" style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2 }}>{timeAgo(a.at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {route === 'games' && (
            <div style={{ maxWidth: 1240, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                {[
                  ['Games installed', games.length],
                  ['Enabled for hosts', games.filter((g) => g.enabled).length],
                  ['Featured', games.filter((g) => g.featured).length],
                  ['Total plays', games.reduce((a, g) => a + g.playsFinished, 0)]
                ].map(([label, value]) => (
                  <div key={String(label)} style={{ ...card, borderRadius: 13, padding: '16px 18px' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{label}</div>
                    <div className="font-mono" style={{ fontWeight: 600, fontSize: 24, marginTop: 6 }}>{Number(value).toLocaleString()}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {(
                  [
                    ['all', 'All', games.length],
                    ['local', 'Local', games.filter((g) => g.source === 'local').length],
                    ['marketplace', 'Marketplace', games.filter((g) => g.source === 'marketplace').length],
                    ['disabled', 'Disabled', games.filter((g) => !g.enabled).length]
                  ] as const
                ).map(([id, label, count]) => {
                  const on = filter === id;
                  return (
                    <div
                      key={id}
                      onClick={() => setFilter(id)}
                      style={{
                        padding: '7px 14px', borderRadius: 9, fontSize: 13, fontWeight: 500, cursor: 'pointer',
                        border: `1px solid ${on ? 'color-mix(in srgb, var(--accent) 45%, var(--line2))' : 'var(--line)'}`,
                        background: on ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent',
                        color: on ? 'var(--text)' : 'var(--muted)'
                      }}
                    >
                      {label} <span className="font-mono" style={{ color: 'var(--faint)', fontSize: 11 }}>{count}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}>
                {/* table */}
                <div style={{ ...card, borderRadius: 15, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 74px', padding: '11px 18px', ...monoLabel, borderBottom: '1px solid var(--line)' }}>
                    <span>Game</span><span style={{ textAlign: 'right' }}>Plays</span><span style={{ textAlign: 'right' }}>Enabled</span>
                  </div>
                  {filtered.length === 0 && <div style={{ padding: 20, color: 'var(--faint)', fontSize: 13.5 }}>No games match this filter.</div>}
                  {filtered.map((g) => {
                    const tint = gameTint(g.gameId);
                    const sel = selected?.gameId === g.gameId;
                    return (
                      <div
                        key={g.gameId}
                        className="menu-item"
                        onClick={() => setSelectedId(g.gameId)}
                        style={{
                          display: 'grid', gridTemplateColumns: '1fr 72px 74px', alignItems: 'center',
                          padding: '13px 18px', borderBottom: '1px solid var(--line)', cursor: 'pointer',
                          background: sel ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'transparent'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                          <div className="font-grotesk" style={{ width: 38, height: 38, borderRadius: 10, background: `color-mix(in srgb, ${tint} 26%, var(--panel2))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 17, color: tint, flex: 'none' }}>
                            {initialOf(g.name)}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</span>
                              {g.featured && (
                                <span className="font-mono" style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 5, background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--accent)', flex: 'none' }}>
                                  FEATURED
                                </span>
                              )}
                            </div>
                            <div className="font-mono" style={{ fontSize: 11, color: 'var(--faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              v{g.version} · {g.source} · {g.minPlayers}–{g.maxPlayers} players
                            </div>
                          </div>
                        </div>
                        <span className="font-mono" style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'right' }}>{g.playsFinished.toLocaleString()}</span>
                        <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Toggle on={g.enabled} onClick={() => patch(g.gameId, { enabled: !g.enabled })} />
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* detail panel */}
                {selected && (
                  <div style={{ ...card, borderRadius: 15, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn .2s ease' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                      <div className="font-grotesk" style={{ width: 52, height: 52, borderRadius: 13, background: `color-mix(in srgb, ${gameTint(selected.gameId)} 26%, var(--panel2))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 24, color: gameTint(selected.gameId), flex: 'none' }}>
                        {initialOf(selected.name)}
                      </div>
                      <div>
                        <div className="font-grotesk" style={{ fontWeight: 600, fontSize: 18 }}>{selected.name}</div>
                        <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--faint)' }}>{selected.gameId} · v{selected.version}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5, textWrap: 'pretty' }}>
                      {selected.description ?? 'No description provided by the game package.'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {[
                        ['Version', `v${selected.version}`],
                        ['Players', `${selected.minPlayers}–${selected.maxPlayers}`],
                        ['Tick rate', selected.tickRate > 0 ? `${selected.tickRate} Hz` : 'event'],
                        ['Total plays', selected.playsFinished.toLocaleString()]
                      ].map(([label, value]) => (
                        <div key={label} style={{ background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 11, padding: '11px 13px' }}>
                          <div style={monoLabel}>{label}</div>
                          <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, marginTop: 5 }}>{value}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0' }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 500 }}>Enabled for hosts</div>
                          <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>Show in the game picker</div>
                        </div>
                        <Toggle size={23} on={selected.enabled} onClick={() => patch(selected.gameId, { enabled: !selected.enabled })} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 0' }}>
                        <div>
                          <div style={{ fontSize: 13.5, fontWeight: 500 }}>Featured</div>
                          <div style={{ fontSize: 11.5, color: 'var(--faint)' }}>Pin to the top of the picker</div>
                        </div>
                        <Toggle size={23} on={selected.featured} onClick={() => patch(selected.gameId, { featured: !selected.featured })} />
                      </div>
                    </div>
                    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
                      <div
                        onClick={() => {
                          if (window.confirm(`Uninstall ${selected.name}? The package is deleted from disk.`)) uninstall(selected.gameId);
                        }}
                        style={{ textAlign: 'center', padding: 10, borderRadius: 10, border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)', color: 'var(--danger)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                      >
                        Uninstall plugin
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {route === 'sessions' && (
            <div style={{ maxWidth: 1180, margin: '0 auto', ...card, overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr .7fr .7fr .7fr 90px', padding: '12px 20px', ...monoLabel, borderBottom: '1px solid var(--line)' }}>
                <span>Session</span><span>Game</span><span>Players</span><span>Age</span><span>Status</span><span style={{ textAlign: 'right' }}>Action</span>
              </div>
              {sessions.length === 0 && <div style={{ padding: 22, color: 'var(--faint)', fontSize: 14 }}>No active sessions.</div>}
              {sessions.map((s) => {
                const playing = s.status === 'playing';
                const stColor = playing ? 'var(--ok)' : 'var(--warn)';
                return (
                  <div key={s.sessionId} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr .7fr .7fr .7fr 90px', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
                    <span className="font-mono" style={{ fontSize: 12.5, letterSpacing: '.08em' }}>
                      {s.code}
                      {!s.live && <span className="font-mono" style={{ marginLeft: 8, fontSize: 10.5, color: 'var(--warn)' }}>stale</span>}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>{s.currentGameId ?? '—'}</span>
                    <span className="font-mono">{s.connectedCount}/{s.playerCount}</span>
                    <span className="font-mono" style={{ color: 'var(--muted)' }}>{timeAgo(s.createdAt)}</span>
                    <span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, fontSize: 11, background: `color-mix(in srgb, ${stColor} 16%, transparent)`, color: stColor }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: stColor }} />
                        {playing ? 'Playing' : 'Lobby'}
                      </span>
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <span
                        onClick={() => {
                          if (window.confirm(`End session ${s.code}? Everyone is disconnected.`)) endSessionRow(s);
                        }}
                        style={{ fontSize: 11.5, color: 'var(--danger)', cursor: 'pointer' }}
                      >
                        End
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {route === 'settings' && (
            <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--faint)' }}>
                Read-only — these come from the backend environment (<span className="font-mono">backend/.env</span>) and need a restart to change.
              </div>
              {config.map((c) => (
                <div key={c.key} style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
                  <div className="font-mono" style={{ fontSize: 13, fontWeight: 500 }}>{c.key}</div>
                  <div className="font-mono" style={{ fontSize: 12.5, color: 'var(--muted)', textAlign: 'right', wordBreak: 'break-all' }}>{c.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {addOpen && (
        <InstallModal
          token={token}
          onClose={() => setAddOpen(false)}
          onInstalled={() => {
            setAddOpen(false);
            refresh();
          }}
        />
      )}
    </div>
  );

  function endSessionRow(s: AdminSession) {
    adminEndSession(token, s.sessionId).then(refresh, refresh);
  }
}

// ── install modal ────────────────────────────────────────────────────────

function InstallModal({ token, onClose, onInstalled }: { token: string; onClose(): void; onInstalled(): void }) {
  const [dirName, setDirName] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    if (!dirName) setDirName(file.name.replace(/\.(m?js)$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-'));
    void file.text().then(setCode);
  };

  const install = () => {
    if (!dirName.trim() || !code || busy) return;
    setBusy(true);
    setMessage(null);
    adminInstallGame(token, dirName.trim(), code)
      .then((g) => {
        setMessage({ ok: true, text: `${g.name} v${g.version} installed — enable it when ready` });
        setTimeout(onInstalled, 900);
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Install failed' }))
      .finally(() => setBusy(false));
  };

  const rescan = () => {
    setBusy(true);
    adminRescanGames(token)
      .then(({ added }) => {
        setMessage({ ok: true, text: added.length ? `Found: ${added.map((g) => g.name).join(', ')}` : 'No new packages on disk' });
        if (added.length) setTimeout(onInstalled, 900);
      })
      .catch(() => setMessage({ ok: false, text: 'Rescan failed' }))
      .finally(() => setBusy(false));
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(3,4,7,.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, animation: 'fadeIn .15s ease' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 520, maxWidth: '92vw', background: 'var(--panel)', border: '1px solid var(--line2)', borderRadius: 18, padding: 26, animation: 'popUp .22s ease' }}
      >
        <div className="font-grotesk" style={{ fontWeight: 700, fontSize: 20, letterSpacing: '-.02em' }}>Install a game</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
          Upload a provider module. It joins the registry disabled until you turn it on.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
          <div>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Game module</div>
            <label style={{ display: 'block', padding: '12px 14px', border: '1px dashed var(--line2)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 13, color: fileName ? 'var(--text)' : 'var(--muted)', cursor: 'pointer' }}>
              {fileName ?? 'Choose index.js (exports createPlugin)…'}
              <input type="file" accept=".js,.mjs" style={{ display: 'none' }} onChange={(e) => pickFile(e.target.files?.[0])} />
            </label>
          </div>
          <div>
            <div style={{ ...monoLabel, marginBottom: 6 }}>Package name</div>
            <input
              value={dirName}
              placeholder="my-game"
              onChange={(e) => setDirName(e.target.value)}
              className="font-mono"
              style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--line2)', background: 'var(--bg2)', borderRadius: 10, fontSize: 13, color: 'var(--text)', outline: 'none' }}
            />
          </div>
          {message && (
            <div className="font-mono" style={{ fontSize: 12.5, color: message.ok ? 'var(--ok)' : 'var(--warn)' }}>{message.text}</div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
          <span onClick={rescan} className="font-mono" style={{ fontSize: 12, color: 'var(--faint)', cursor: 'pointer', textDecoration: 'underline' }}>
            rescan games folder
          </span>
          <span style={{ flex: 1 }} />
          <div onClick={onClose} className="btn-ghost" style={{ padding: '11px 20px', border: '1px solid var(--line2)', borderRadius: 10, fontWeight: 500, fontSize: 13.5, cursor: 'pointer' }}>
            Cancel
          </div>
          <div
            onClick={install}
            style={{ padding: '11px 22px', borderRadius: 10, fontWeight: 600, fontSize: 13.5, background: dirName.trim() && code ? 'var(--accent)' : 'rgba(255,255,255,0.08)', color: dirName.trim() && code ? '#fff' : 'var(--faint)', cursor: busy ? 'wait' : 'pointer' }}
          >
            {busy ? 'Working…' : 'Install game'}
          </div>
        </div>
      </div>
    </div>
  );
}
