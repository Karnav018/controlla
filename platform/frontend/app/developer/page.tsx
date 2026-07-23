'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '../../components/Logo';

interface DevUser {
  type: 'company' | 'freelance';
  companyName: string;
  name: string;
  email: string;
  devKey: string;
}

interface DevGame {
  id: string;
  title: string;
  slug: string;
  version: string;
  minPlayers: number;
  maxPlayers: number;
  category: string;
  description: string;
  status: 'Live' | 'Development' | 'Pending Review';
  createdAt: string;
}

export default function DeveloperPage() {
  const [user, setUser] = useState<DevUser | null>(null);
  const [tab, setTab] = useState<'signup' | 'login'>('signup');

  // Form states
  const [devType, setDevType] = useState<'company' | 'freelance'>('company');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Game registration form state
  const [newGame, setNewGame] = useState({
    title: '',
    slug: '',
    version: '1.0.0',
    minPlayers: 2,
    maxPlayers: 12,
    category: 'Party',
    description: '',
    endpointUrl: 'http://localhost:3001'
  });

  const [games, setGames] = useState<DevGame[]>([
    {
      id: 'g-101',
      title: 'Skribix',
      slug: 'skribix',
      version: '1.0.0',
      minPlayers: 2,
      maxPlayers: 12,
      category: 'Drawing / Party',
      description: 'Classic party scribbling and guessing game for phones and TVs.',
      status: 'Live',
      createdAt: '2026-07-23'
    }
  ]);

  const [publishedSuccess, setPublishedSuccess] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('controlla_dev_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  const handleSignUp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !email || !password) {
      setErrorMsg('Please fill in all required fields.');
      return;
    }
    const newUser: DevUser = {
      type: devType,
      companyName,
      name: contactName || companyName,
      email,
      devKey: 'dev_key_' + Math.random().toString(36).substring(2, 12)
    };
    setUser(newUser);
    localStorage.setItem('controlla_dev_user', JSON.stringify(newUser));
    setErrorMsg('');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter your email and password.');
      return;
    }
    const loggedUser: DevUser = {
      type: 'company',
      companyName: email.split('@')[0].toUpperCase() + ' Games Studio',
      name: email.split('@')[0],
      email,
      devKey: 'dev_key_live_' + Math.random().toString(36).substring(2, 10)
    };
    setUser(loggedUser);
    localStorage.setItem('controlla_dev_user', JSON.stringify(loggedUser));
    setErrorMsg('');
  };

  const handleQuickDemo = () => {
    const demoUser: DevUser = {
      type: 'company',
      companyName: 'PixelCraft Studios',
      name: 'Alex Developer',
      email: 'alex@pixelcraft.dev',
      devKey: 'dev_key_live_px98317a'
    };
    setUser(demoUser);
    localStorage.setItem('controlla_dev_user', JSON.stringify(demoUser));
    setErrorMsg('');
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('controlla_dev_user');
  };

  const handlePublishGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGame.title || !newGame.slug) return;

    const gameEntry: DevGame = {
      id: 'g-' + Math.floor(100 + Math.random() * 900),
      title: newGame.title,
      slug: newGame.slug.toLowerCase().replace(/\s+/g, '-'),
      version: newGame.version,
      minPlayers: Number(newGame.minPlayers),
      maxPlayers: Number(newGame.maxPlayers),
      category: newGame.category,
      description: newGame.description,
      status: 'Live',
      createdAt: new Date().toISOString().split('T')[0]
    };

    setGames([gameEntry, ...games]);
    setPublishedSuccess(true);
    setTimeout(() => setPublishedSuccess(false), 4000);
    setNewGame({
      title: '',
      slug: '',
      version: '1.0.0',
      minPlayers: 2,
      maxPlayers: 12,
      category: 'Party',
      description: '',
      endpointUrl: 'http://localhost:3001'
    });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#07080a',
        color: '#e2e8f0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* Header */}
      <header
        style={{
          height: 72,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 36px',
          background: '#090b0e'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Logo size={32} />
          <Link href="/host" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="font-grotesk" style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em' }}>
              Controlla <span style={{ color: 'var(--accent)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '.1em', marginLeft: 8 }}>Developer Hub</span>
            </span>
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link href="/host" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>
            ← Back to Host
          </Link>
          {user && (
            <button
              onClick={handleLogout}
              style={{
                padding: '8px 18px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: '#fff',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer'
              }}
            >
              Log Out
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '40px 36px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {!user ? (
          /* AUTHENTICATION VIEW */
          <div style={{ maxWidth: 480, margin: '40px auto 0' }}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <h1 className="font-grotesk" style={{ fontSize: 36, fontWeight: 800, color: '#fff', margin: 0 }}>
                Game Developer Portal
              </h1>
              <p style={{ color: '#94a3b8', fontSize: 15, marginTop: 10 }}>
                Build and publish custom party games for the Controlla platform.
              </p>
            </div>

            {/* Auth Card */}
            <div
              style={{
                background: '#0d0f14',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 20,
                padding: 32,
                boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
              }}
            >
              {/* Tab Selector */}
              <div
                style={{
                  display: 'flex',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 12,
                  padding: 4,
                  marginBottom: 24
                }}
              >
                <button
                  onClick={() => { setTab('signup'); setErrorMsg(''); }}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 9,
                    border: 'none',
                    background: tab === 'signup' ? 'var(--accent)' : 'transparent',
                    color: tab === 'signup' ? '#080a0d' : '#94a3b8',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  Sign Up
                </button>
                <button
                  onClick={() => { setTab('login'); setErrorMsg(''); }}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 9,
                    border: 'none',
                    background: tab === 'login' ? 'var(--accent)' : 'transparent',
                    color: tab === 'login' ? '#080a0d' : '#94a3b8',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer'
                  }}
                >
                  Log In
                </button>
              </div>

              {errorMsg && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#f87171',
                    fontSize: 13.5,
                    marginBottom: 20
                  }}
                >
                  {errorMsg}
                </div>
              )}

              {tab === 'signup' ? (
                /* SIGN UP FORM */
                <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Industry / Developer Type */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 8 }}>
                      Developer Type
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <button
                        type="button"
                        onClick={() => setDevType('company')}
                        style={{
                          padding: '12px',
                          borderRadius: 10,
                          border: devType === 'company' ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                          background: devType === 'company' ? 'rgba(198, 255, 0, 0.08)' : 'rgba(255,255,255,0.02)',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        🏢 Company / Studio
                      </button>
                      <button
                        type="button"
                        onClick={() => setDevType('freelance')}
                        style={{
                          padding: '12px',
                          borderRadius: 10,
                          border: devType === 'freelance' ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)',
                          background: devType === 'freelance' ? 'rgba(198, 255, 0, 0.08)' : 'rgba(255,255,255,0.02)',
                          color: '#fff',
                          fontWeight: 600,
                          fontSize: 13,
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        💻 Freelancer / Solo
                      </button>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                      {devType === 'company' ? 'Company / Studio Name *' : 'Freelance Handle / Name *'}
                    </label>
                    <input
                      type="text"
                      placeholder={devType === 'company' ? 'e.g. Apex Game Studios' : 'e.g. Alex Dev'}
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#040507',
                        color: '#fff',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                      Contact Name
                    </label>
                    <input
                      type="text"
                      placeholder="Your full name"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#040507',
                        color: '#fff',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      placeholder="dev@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#040507',
                        color: '#fff',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                      Password *
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#040507',
                        color: '#fff',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="play-btn"
                    style={{
                      marginTop: 8,
                      width: '100%',
                      padding: '14px',
                      borderRadius: 12,
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#090b0e',
                      fontWeight: 700,
                      fontSize: 16,
                      cursor: 'pointer'
                    }}
                  >
                    Register Developer Account
                  </button>
                </form>
              ) : (
                /* LOGIN FORM */
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                      Developer Email
                    </label>
                    <input
                      type="email"
                      placeholder="dev@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#040507',
                        color: '#fff',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                      Password
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#040507',
                        color: '#fff',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="play-btn"
                    style={{
                      marginTop: 8,
                      width: '100%',
                      padding: '14px',
                      borderRadius: 12,
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#090b0e',
                      fontWeight: 700,
                      fontSize: 16,
                      cursor: 'pointer'
                    }}
                  >
                    Log In to Developer Hub
                  </button>
                </form>
              )}

              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={handleQuickDemo}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  ⚡ Quick Test Login (Instant Demo Access)
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* DEVELOPER DASHBOARD VIEW */
          <div>
            {/* Developer Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(20,24,32,0.9) 0%, rgba(10,12,16,0.95) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 20,
                padding: '28px 32px',
                marginBottom: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 20
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h2 className="font-grotesk" style={{ fontSize: 28, fontWeight: 800, color: '#fff', margin: 0 }}>
                    {user.companyName}
                  </h2>
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      background: user.type === 'company' ? 'rgba(198, 255, 0, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                      color: user.type === 'company' ? 'var(--accent)' : '#38bdf8',
                      textTransform: 'uppercase'
                    }}
                  >
                    {user.type === 'company' ? '🏢 Company' : '💻 Freelancer'}
                  </span>
                </div>
                <p style={{ color: '#94a3b8', fontSize: 14, margin: '6px 0 0 0' }}>
                  Logged in as <strong style={{ color: '#cbd5e1' }}>{user.email}</strong>
                </p>
              </div>

              <div style={{ background: '#040507', padding: '10px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Developer API Key</div>
                <code style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>{user.devKey}</code>
              </div>
            </div>

            {publishedSuccess && (
              <div
                style={{
                  padding: '16px 20px',
                  borderRadius: 14,
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  color: '#4ade80',
                  fontWeight: 700,
                  fontSize: 15,
                  marginBottom: 32
                }}
              >
                🎉 Success! Your game package has been registered with the Controlla platform.
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 40 }}>
              {/* REGISTER NEW GAME FORM */}
              <div
                style={{
                  background: '#0c0e12',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20,
                  padding: 32
                }}
              >
                <h3 className="font-grotesk" style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 0, marginBottom: 6 }}>
                  🎮 Enter Your Own Game with Controlla
                </h3>
                <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 24 }}>
                  Fill in your game parameters to register it into Controlla&apos;s provider ecosystem.
                </p>

                <form onSubmit={handlePublishGame} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                      Game Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cosmic Trivia"
                      value={newGame.title}
                      onChange={(e) => setNewGame({ ...newGame, title: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#040507',
                        color: '#fff',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                        Game Slug (ID) *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. cosmic-trivia"
                        value={newGame.slug}
                        onChange={(e) => setNewGame({ ...newGame, slug: e.target.value })}
                        required
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: '#040507',
                          color: '#fff',
                          fontSize: 14,
                          outline: 'none'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                        Version
                      </label>
                      <input
                        type="text"
                        value={newGame.version}
                        onChange={(e) => setNewGame({ ...newGame, version: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: '#040507',
                          color: '#fff',
                          fontSize: 14,
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                        Min Players
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={newGame.minPlayers}
                        onChange={(e) => setNewGame({ ...newGame, minPlayers: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: '#040507',
                          color: '#fff',
                          fontSize: 14,
                          outline: 'none'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                        Max Players
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={newGame.maxPlayers}
                        onChange={(e) => setNewGame({ ...newGame, maxPlayers: Number(e.target.value) })}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.12)',
                          background: '#040507',
                          color: '#fff',
                          fontSize: 14,
                          outline: 'none'
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                      Category
                    </label>
                    <select
                      value={newGame.category}
                      onChange={(e) => setNewGame({ ...newGame, category: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#040507',
                        color: '#fff',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    >
                      <option value="Party">Party / Scribble</option>
                      <option value="Trivia">Trivia & Quiz</option>
                      <option value="Action">Arcade & Action</option>
                      <option value="Strategy">Strategy & Cards</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1', display: 'block', marginBottom: 6 }}>
                      Game Description
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Describe the gameplay experience..."
                      value={newGame.description}
                      onChange={(e) => setNewGame({ ...newGame, description: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: '#040507',
                        color: '#fff',
                        fontSize: 14,
                        outline: 'none',
                        resize: 'none'
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    className="play-btn"
                    style={{
                      marginTop: 10,
                      width: '100%',
                      padding: '14px',
                      borderRadius: 12,
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#090b0e',
                      fontWeight: 700,
                      fontSize: 16,
                      cursor: 'pointer'
                    }}
                  >
                    🚀 Publish Game to Controlla Platform
                  </button>
                </form>
              </div>

              {/* SDK & QUICK INTEGRATION GUIDE */}
              <div
                style={{
                  background: '#0c0e12',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 20,
                  padding: 32,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <h3 className="font-grotesk" style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 0, marginBottom: 12 }}>
                    🛠️ Controlla Game SDK Integration
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6 }}>
                    Connect your HTML5 / React / Unity game host view to Controlla in 3 simple steps:
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 20 }}>
                    <div style={{ background: '#040507', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>1. Define Plugin Manifest</div>
                      <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4 }}>
                        Place `index.js` in `platform/backend/games/[your-slug]/` declaring `name`, `minPlayers`, and `maxPlayers`.
                      </div>
                    </div>

                    <div style={{ background: '#040507', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>2. Bind Host View Engine</div>
                      <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4 }}>
                        Serve `host-view.html` to display live game state on the TV / Host screen.
                      </div>
                    </div>

                    <div style={{ background: '#040507', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>3. Handle Phone Controllers</div>
                      <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4 }}>
                        Listen for player inputs: `draw`, `text`, or `button` events over WebSocket.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sample Plugin Code Block */}
                <div style={{ marginTop: 24, background: '#040507', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>
                    Sample Plugin (`index.js`)
                  </div>
                  <pre style={{ margin: 0, fontSize: 12, color: '#38bdf8', fontFamily: 'var(--font-mono), monospace', overflowX: 'auto' }}>
{`module.exports = {
  id: '${newGame.slug || 'my-game'}',
  name: '${newGame.title || 'My Custom Game'}',
  minPlayers: ${newGame.minPlayers},
  maxPlayers: ${newGame.maxPlayers},
  createState() { return { phase: 'LOBBY' }; }
};`}
                  </pre>
                </div>
              </div>
            </div>

            {/* REGISTERED GAMES LIST TABLE */}
            <div
              style={{
                background: '#0c0e12',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 20,
                padding: 32
              }}
            >
              <h3 className="font-grotesk" style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginTop: 0, marginBottom: 20 }}>
                📋 Your Published Controlla Games
              </h3>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                      <th style={{ padding: '12px 16px' }}>Game Title</th>
                      <th style={{ padding: '12px 16px' }}>Slug / ID</th>
                      <th style={{ padding: '12px 16px' }}>Version</th>
                      <th style={{ padding: '12px 16px' }}>Category</th>
                      <th style={{ padding: '12px 16px' }}>Status</th>
                      <th style={{ padding: '12px 16px' }}>Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((g) => (
                      <tr key={g.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '16px', fontWeight: 700, color: '#fff' }}>{g.title}</td>
                        <td style={{ padding: '16px', fontFamily: 'var(--font-mono), monospace', color: 'var(--accent)' }}>{g.slug}</td>
                        <td style={{ padding: '16px', color: '#94a3b8' }}>v{g.version}</td>
                        <td style={{ padding: '16px', color: '#cbd5e1' }}>{g.category}</td>
                        <td style={{ padding: '16px' }}>
                          <span
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 700,
                              background: 'rgba(34, 197, 94, 0.15)',
                              color: '#4ade80'
                            }}
                          >
                            ● {g.status}
                          </span>
                        </td>
                        <td style={{ padding: '16px', color: '#94a3b8' }}>{g.createdAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
