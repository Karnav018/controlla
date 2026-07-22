// TEST FIXTURE — not a product game. Demonstrates the provider contract:
// a module exporting createPlugin() whose return implements GamePlugin.
// Note: type-only imports — a real provider needs zero runtime deps on the platform.
import type { GameContext, GamePlayer, GamePlugin } from '../../../../src/sdk/types';

class EchoPlugin implements GamePlugin {
  private ctx!: GameContext;
  private inputs = 0;

  metadata() {
    return {
      id: 'echo',
      name: 'Echo Test',
      version: '1.0.0',
      description: 'Diagnostic fixture: inputs echo to the host',
      minPlayers: 1,
      maxPlayers: 32,
      tickRate: 0
    };
  }

  async init(ctx: GameContext): Promise<void> {
    this.ctx = ctx;
    await ctx.setAllControllerLayouts({
      layoutVersion: 1,
      components: [
        { kind: 'label', id: 'title', text: 'Echo test' },
        {
          kind: 'buttons',
          id: 'main',
          buttons: [
            { id: 'a', label: 'A' },
            { id: 'b', label: 'B' }
          ]
        },
        { kind: 'dpad', id: 'dpad' }
      ]
    });
    await ctx.setHostState({ game: 'echo', inputs: 0, lastInput: null });
  }

  async onPlayerJoin(player: GamePlayer): Promise<void> {
    await this.ctx.setControllerLayout(player.playerId, {
      layoutVersion: 1,
      components: [{ kind: 'buttons', id: 'main', buttons: [{ id: 'a', label: 'A' }] }]
    });
  }

  onPlayerLeave(): void {}
  onPlayerReconnect(): void {}

  async onInput(playerId: string, input: { controlId: string; action: string; value?: unknown }): Promise<void> {
    this.inputs += 1;
    await this.ctx.setHostState({
      game: 'echo',
      inputs: this.inputs,
      lastInput: { ...input, playerId, at: Date.now() }
    });
  }
}

export function createPlugin(): GamePlugin {
  return new EchoPlugin();
}
