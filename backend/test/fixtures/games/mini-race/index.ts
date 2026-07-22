// TEST FIXTURE — not a product game. Exercises the full runtime surface:
// per-game options, game timers, shared scores, host state, endGame results.
import type { GameContext, GamePlayer, GamePlugin } from '../../../../src/sdk/types';

class MiniRacePlugin implements GamePlugin {
  private ctx!: GameContext;
  private taps = new Map<string, number>();
  private running = false;
  private endsAt = 0;

  metadata() {
    return {
      id: 'mini-race',
      name: 'Mini Race',
      version: '1.0.0',
      description: 'Fixture: tap race with configurable duration',
      minPlayers: 1,
      maxPlayers: 16,
      tickRate: 0
    };
  }

  async init(ctx: GameContext, players: readonly GamePlayer[]): Promise<void> {
    this.ctx = ctx;
    const opts = (ctx.options ?? {}) as { durationMs?: unknown };
    const durationMs =
      typeof opts.durationMs === 'number' && opts.durationMs >= 200 ? opts.durationMs : 3000;
    for (const p of players) this.taps.set(p.playerId, 0);
    this.endsAt = Date.now() + durationMs;
    this.running = true;

    await ctx.setAllControllerLayouts({
      layoutVersion: 1,
      components: [
        { kind: 'label', id: 'title', text: 'TAP!' },
        { kind: 'buttons', id: 'pad', buttons: [{ id: 'tap', label: 'TAP!' }] }
      ]
    });
    await this.push();
    ctx.timers.start('finish', durationMs, () => void this.finish());
  }

  async onPlayerJoin(player: GamePlayer): Promise<void> {
    this.taps.set(player.playerId, 0);
  }

  onPlayerLeave(player: GamePlayer): void {
    this.taps.delete(player.playerId);
  }

  onPlayerReconnect(): void {}

  async onInput(playerId: string, input: { controlId: string; action: string }): Promise<void> {
    if (!this.running || input.controlId !== 'tap' || input.action !== 'press') return;
    this.taps.set(playerId, (this.taps.get(playerId) ?? 0) + 1);
    await this.ctx.scores.add(playerId, 1); // session leaderboard accumulates across games
    await this.push();
  }

  private async push(): Promise<void> {
    await this.ctx.setHostState({
      game: 'mini-race',
      phase: this.running ? 'playing' : 'finished',
      endsAt: this.endsAt,
      taps: Object.fromEntries(this.taps)
    });
  }

  private async finish(): Promise<void> {
    this.running = false;
    const sorted = [...this.taps.entries()].sort((a, b) => b[1] - a[1]);
    const rankings = sorted.map(([playerId, score], i) => ({
      playerId,
      score,
      rank: i > 0 && score === sorted[i - 1]![1] ? i : i + 1
    }));
    await this.ctx.endGame({ rankings, detail: { taps: Object.fromEntries(this.taps) } });
  }
}

export function createPlugin(): GamePlugin {
  return new MiniRacePlugin();
}
