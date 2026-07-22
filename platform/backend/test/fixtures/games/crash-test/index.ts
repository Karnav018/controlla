// TEST FIXTURE — deliberately faulty plugin proving the runtime's containment
// guarantee: a crashing game aborts itself, never the session.
import type { GameContext, GamePlugin } from '../../../../src/sdk/types';

class CrashTestPlugin implements GamePlugin {
  metadata() {
    return {
      id: 'crash-test',
      name: 'Crash Test',
      version: '1.0.0',
      description: 'Fixture: throws on first input',
      minPlayers: 1,
      maxPlayers: 32,
      tickRate: 0
    };
  }

  async init(ctx: GameContext): Promise<void> {
    await ctx.setAllControllerLayouts({
      layoutVersion: 1,
      components: [{ kind: 'buttons', id: 'main', buttons: [{ id: 'boom', label: 'BOOM' }] }]
    });
    await ctx.setHostState({ game: 'crash-test', armed: true });
  }

  onPlayerJoin(): void {}
  onPlayerLeave(): void {}
  onPlayerReconnect(): void {}

  onInput(): void {
    throw new Error('boom (intentional crash-test failure)');
  }
}

export function createPlugin(): GamePlugin {
  return new CrashTestPlugin();
}
