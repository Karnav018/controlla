import { wordList } from './words.js';

const COLORS = ['#111318', '#e11d48', '#f59e0b', '#16a34a', '#2563eb', '#9333ea', '#ffffff'];
const MAX_STROKES = 800;
const MAX_POINTS_PER_STROKE = 120;
const FEED_LENGTH = 6;

const num = (v, dflt, min, max) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;

export function createPlugin() {
  let ctx;
  let cfg;
  let order = []; // drawer rotation (playerIds, fixed at init; leavers skipped)
  let turnIx = -1;
  let round = 0;
  let phase = 'idle'; // choosing | drawing | reveal | done
  let drawerId = null;
  let word = '';
  let wordOptions = [];
  let hint = '';
  let revealLevel = 0;
  let wrongGuesses = 0;
  let turnStartedAt = 0;
  let endsAt = 0;
  let strokes = [];
  let guessed = new Set();
  let points = new Map(); // per-game score → final rankings
  let feed = [];
  let dirty = false;

  const roster = () => ctx.players();
  const nameOf = (id) => roster().find((p) => p.playerId === id)?.nickname ?? 'Player';
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  // ── hint logic ────────────────────────────────────────────────────────
  function makeHint(revealCount) {
    const clean = norm(word);
    const arr = clean.split('').map((ch) => (ch === ' ' ? ' ' : '_'));
    if (revealCount > 0) {
      const unrevealed = [];
      arr.forEach((ch, i) => ch === '_' && unrevealed.push(i));
      const maxReveals = Math.min(revealCount, Math.floor(clean.replace(/ /g, '').length / 2));
      for (let i = 0; i < maxReveals && unrevealed.length > 0; i++) {
        const pick = ctx.random.int(0, unrevealed.length - 1);
        arr[unrevealed[pick]] = clean[unrevealed[pick]];
        unrevealed.splice(pick, 1);
      }
    }
    return arr.join(' ').trim();
  }

  function isClose(guess, target) {
    if (guess.length !== target.length) return false;
    let diff = 0;
    for (let i = 0; i < guess.length; i++) if (guess[i] !== target[i]) diff++;
    return diff === 1;
  }

  // ── layouts ───────────────────────────────────────────────────────────
  const label = (id, text) => ({ kind: 'label', id, text });
  const layoutFor = (playerId) => {
    if (phase === 'choosing') {
      return playerId === drawerId
        ? {
            layoutVersion: 1,
            components: [
              label('t', 'Your turn to draw! Pick a word'),
              { kind: 'choice-list', id: 'word', choices: wordOptions.map((w, i) => ({ id: String(i), label: w })) }
            ]
          }
        : { layoutVersion: 1, components: [label('t', `${nameOf(drawerId)} is picking a word…`)] };
    }
    if (phase === 'drawing') {
      if (playerId === drawerId) {
        return {
          layoutVersion: 1,
          components: [label('t', `🎨 Picasso (Drawer): ${word.toUpperCase()}`), { kind: 'canvas', id: 'canvas' }]
        };
      }
      if (guessed.has(playerId)) {
        return { layoutVersion: 1, components: [label('t', 'You got it! ✓ Watch the TV')] };
      }
      return {
        layoutVersion: 1,
        components: [
          label('t', 'Guess the word — watch the TV'),
          { kind: 'text-input', id: 'guess', placeholder: 'your guess…', maxLength: 40 }
        ]
      };
    }
    if (phase === 'reveal') {
      return { layoutVersion: 1, components: [label('t', `The word was “${word.toUpperCase()}”`)] };
    }
    return { layoutVersion: 1, components: [label('t', 'Scribble')] };
  };

  const pushLayouts = async () => {
    for (const p of roster()) await ctx.setControllerLayout(p.playerId, layoutFor(p.playerId));
  };

  // ── host state ────────────────────────────────────────────────────────
  const pushHost = () =>
    ctx.setHostState({
      game: 'scribble',
      phase,
      round,
      totalRounds: cfg.rounds,
      drawer: drawerId ? { id: drawerId, name: nameOf(drawerId) } : null,
      hint: phase === 'reveal' ? norm(word) : hint,
      endsAt: phase === 'drawing' ? endsAt : null,
      colors: COLORS,
      strokes,
      guessed: [...guessed],
      points: Object.fromEntries(points),
      players: roster().map((p) => ({ id: p.playerId, name: p.nickname })),
      feed
    });

  const pushFeed = (entry) => {
    feed = [...feed.slice(-(FEED_LENGTH - 1)), entry];
  };

  // ── turn machine ──────────────────────────────────────────────────────
  async function startTurn() {
    const alive = roster();
    if (alive.length < 2) return endGame();

    for (;;) {
      turnIx++;
      if (turnIx >= order.length) {
        turnIx = 0;
        round++;
      }
      if (round > cfg.rounds) return endGame();
      if (round === 0) round = 1;
      const candidate = order[turnIx];
      if (alive.some((p) => p.playerId === candidate)) {
        drawerId = candidate;
        break;
      }
    }

    phase = 'choosing';
    word = '';
    hint = '';
    strokes = [];
    guessed = new Set();
    wrongGuesses = 0;
    revealLevel = 0;

    const source = cfg.words ?? wordList(cfg.theme);
    wordOptions = ctx.random.shuffle(source).slice(0, 3).map(norm);
    if (wordOptions.length === 0) wordOptions = ['cat'];

    await pushLayouts();
    await pushHost();
    ctx.timers.start('choose', cfg.wordChoiceMs, () => void selectWord(0));
  }

  async function selectWord(ix) {
    if (phase !== 'choosing') return;
    ctx.timers.cancel('choose');
    word = wordOptions[ix] ?? wordOptions[0];
    phase = 'drawing';
    hint = makeHint(0);
    turnStartedAt = Date.now();
    endsAt = turnStartedAt + cfg.drawTimeMs;

    for (const [i, frac] of [[1, 0.4], [2, 0.65], [3, 0.8]]) {
      ctx.timers.start(`hint${i}`, Math.round(cfg.drawTimeMs * frac), () => {
        if (phase !== 'drawing') return;
        revealLevel = Math.max(revealLevel, i);
        hint = makeHint(revealLevel);
        dirty = true;
      });
    }
    ctx.timers.start('turn', cfg.drawTimeMs, () => void endTurn('time'));

    await pushLayouts();
    await pushHost();
  }

  async function endTurn(reason) {
    if (phase !== 'drawing' && phase !== 'choosing') return;
    for (const t of ['choose', 'turn', 'hint1', 'hint2', 'hint3']) ctx.timers.cancel(t);
    phase = 'reveal';
    pushFeed({ kind: 'reveal', text: `The word was “${norm(word) || wordOptions[0]}” (${reason})` });
    await pushLayouts();
    await pushHost();
    ctx.timers.start('next', cfg.revealMs, () => void startTurn());
  }

  async function endGame() {
    if (phase === 'done') return;
    phase = 'done';
    const scores = Object.fromEntries(points);
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const rankings = [];
    let rank = 0;
    let prev = Number.POSITIVE_INFINITY;
    for (const [playerId, score] of sorted) {
      if (score < prev) {
        rank = rankings.length + 1;
        prev = score;
      }
      rankings.push({ playerId, score, rank });
    }
    await ctx.endGame({ rankings, detail: { game: 'scribble', points: scores } });
  }

  // ── the plugin object ─────────────────────────────────────────────────
  return {
    metadata() {
      return {
        id: 'scribble',
        name: 'Scribble',
        version: '1.0.0',
        description: 'Draw on your phone, everyone guesses on theirs. Classic party scribbling.',
        minPlayers: 2,
        maxPlayers: 12,
        tickRate: 4,
        hostViewUrl: '/games/scribble/assets/host-view.html'
      };
    },

    async init(context, players) {
      ctx = context;
      const o = ctx.options && typeof ctx.options === 'object' ? ctx.options : {};
      cfg = {
        rounds: num(o.rounds, 2, 1, 10),
        drawTimeMs: num(o.drawTimeMs, 60_000, 4_000, 180_000),
        wordChoiceMs: num(o.wordChoiceMs, 15_000, 1_000, 30_000),
        revealMs: num(o.revealMs, 4_000, 500, 15_000),
        theme: typeof o.theme === 'string' ? o.theme : 'classic',
        words: Array.isArray(o.words) && o.words.length > 0 ? o.words.map(norm) : null
      };
      order = ctx.random.shuffle(players.map((p) => p.playerId));
      for (const p of players) points.set(p.playerId, 0);
      round = 0;
      turnIx = -1;
      await startTurn();
    },

    async onPlayerJoin(player) {
      if (phase === 'done') return;
      if (!points.has(player.playerId)) points.set(player.playerId, 0);
      await ctx.setControllerLayout(player.playerId, layoutFor(player.playerId));
      dirty = true;
    },

    async onPlayerLeave(player) {
      guessed.delete(player.playerId);
      if (phase === 'done') return;
      if (roster().length < 2) return endGame();
      if (player.playerId === drawerId && (phase === 'choosing' || phase === 'drawing')) {
        pushFeed({ kind: 'system', text: `${player.nickname} left mid-draw` });
        return endTurn('drawer-left');
      }
      dirty = true;
    },

    onPlayerReconnect() {
      dirty = true;
    },

    async onInput(playerId, input) {
      if (phase === 'choosing' && playerId === drawerId && input.controlId === 'word' && input.action === 'select') {
        const ix = Number(input.value);
        return selectWord(Number.isInteger(ix) && ix >= 0 && ix < wordOptions.length ? ix : 0);
      }

      if (phase !== 'drawing') return;

      if (playerId === drawerId && input.controlId === 'canvas') {
        if (input.action === 'clear') {
          strokes = [];
          dirty = true;
        } else if (input.action === 'undo') {
          strokes.pop();
          dirty = true;
        } else if (input.action === 'stroke' && typeof input.value === 'string' && strokes.length < MAX_STROKES) {
          const [c, w, path] = input.value.split('|');
          const colorIx = num(Number(c), 0, 0, COLORS.length - 1);
          const width = num(Number(w), 4, 1, 40);
          const pts = (path ?? '')
            .split(';')
            .slice(0, MAX_POINTS_PER_STROKE)
            .map((pair) => pair.split(',').map(Number))
            .filter((p) => p.length === 2 && p.every((v) => Number.isFinite(v) && v >= 0 && v <= 1000))
            .map(([x, y]) => [Math.round(x), Math.round(y)]);
          if (pts.length >= 1) {
            strokes.push({ c: colorIx, w: width, p: pts });
            dirty = true;
          }
        }
        return;
      }

      if (input.controlId === 'guess' && input.action === 'submit' && playerId !== drawerId && !guessed.has(playerId)) {
        const guess = norm(input.value);
        if (!guess) return;
        if (guess === norm(word)) {
          guessed.add(playerId);
          const elapsedSec = Math.floor((Date.now() - turnStartedAt) / 1000);
          const placementBonus = Math.max(0, 100 - (guessed.size - 1) * 20);
          const earned = Math.max(10, 500 - elapsedSec * 2 + placementBonus);
          points.set(playerId, (points.get(playerId) ?? 0) + earned);
          points.set(drawerId, (points.get(drawerId) ?? 0) + 100);
          await ctx.scores.add(playerId, earned);
          await ctx.scores.add(drawerId, 100);
          pushFeed({ kind: 'correct', text: `${nameOf(playerId)} guessed it! +${earned}` });
          await ctx.setControllerLayout(playerId, layoutFor(playerId));
          await pushHost();
          const nonDrawers = roster().filter((p) => p.playerId !== drawerId);
          if (nonDrawers.every((p) => guessed.has(p.playerId))) return endTurn('everyone-guessed');
          return;
        }
        pushFeed({ kind: 'guess', text: `${nameOf(playerId)}: ${guess.slice(0, 40)}` });
        if (isClose(guess, norm(word))) await ctx.notify(playerId, `“${guess}” is very close!`);
        wrongGuesses++;
        if (wrongGuesses % 3 === 0) {
          revealLevel = Math.min(revealLevel + 1, 3);
          hint = makeHint(revealLevel);
        }
        dirty = true;
      }
    },

    update() {
      if (!dirty || phase === 'done') return;
      dirty = false;
      void pushHost();
    },

    destroy() {}
  };
}
