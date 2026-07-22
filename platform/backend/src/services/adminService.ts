import type {
  AdminActivityItem,
  AdminConfigEntry,
  AdminGame,
  AdminLoginResponse,
  AdminSession,
  AdminStats
} from '../protocol';
import type { Config } from '../config';
import type { LiveStore } from '../redis/liveStore';
import type { PluginRuntimePort } from '../bus/types';
import type { PluginLoader, GameInfoLite } from '../runtime/loader';
import type { TokenService } from './tokenService';
import { GameSession } from '../db/models/gameSession';
import { GameInstance } from '../db/models/gameInstance';
import { InstalledPlugin } from '../db/models/installedPlugin';
import { AppError } from '../http/errors';
import { safeEqual } from '../http/middleware/adminAuth';

/**
 * Operator surface: the game registry with its kill switches, a live view of
 * sessions, and platform stats. Every Mongo query here rides an existing
 * index ({status,updatedAt} for sessions, {pluginId,finishedAt} for plays,
 * {pluginId,version} / {enabled,pluginId} for the registry).
 */
export class AdminService {
  constructor(
    private cfg: Config,
    private store: LiveStore,
    private runtime: PluginRuntimePort,
    private tokens: TokenService,
    private loader: PluginLoader
  ) {}

  /**
   * Live install of an uploaded provider module — validated, rolled back on
   * failure. Per the admin design: installs join the registry DISABLED until
   * the operator turns them on.
   */
  async installGame(dirName: string, code: string): Promise<AdminGame> {
    let lite: GameInfoLite;
    try {
      lite = await this.loader.install(dirName, code);
    } catch (err) {
      throw new AppError(400, 'PLUGIN_INVALID', err instanceof Error ? err.message : 'Invalid game package');
    }
    await InstalledPlugin.updateMany({ pluginId: lite.gameId }, { enabled: false });
    const game = (await this.listGames()).find((g) => g.gameId === lite.gameId);
    if (!game) throw new AppError(500, 'INSTALL_FAILED');
    return game;
  }

  /** True uninstall: deregister, delete the package dir, drop registry docs. */
  async uninstallGame(pluginId: string): Promise<void> {
    try {
      await this.loader.uninstall(pluginId);
    } catch (err) {
      throw new AppError(404, 'GAME_NOT_FOUND', err instanceof Error ? err.message : 'Unknown game');
    }
    await InstalledPlugin.deleteMany({ pluginId });
  }

  /** Real activity, from the stores: recent rounds and installs, newest first. */
  async activity(): Promise<AdminActivityItem[]> {
    const [instances, installs] = await Promise.all([
      GameInstance.find().sort({ startedAt: -1 }).limit(8).lean(),
      InstalledPlugin.find().sort({ installedAt: -1 }).limit(5).lean()
    ]);
    const items: AdminActivityItem[] = [];
    for (const i of instances) {
      if (!i.finishedAt) {
        items.push({ kind: 'game-started', text: `${i.pluginId} round started`, at: i.startedAt.toISOString() });
      } else {
        const aborted = (i.results as { aborted?: boolean } | undefined)?.aborted === true;
        const players = (i.results as { rankings?: unknown[] } | undefined)?.rankings?.length ?? 0;
        items.push({
          kind: aborted ? 'game-aborted' : 'game-finished',
          text: aborted ? `${i.pluginId} round aborted` : `${i.pluginId} finished · ${players} ranked`,
          at: i.finishedAt.toISOString()
        });
      }
    }
    for (const p of installs) {
      items.push({
        kind: 'game-installed',
        text: `${p.pluginId} v${p.version} installed`,
        at: p.installedAt.toISOString()
      });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  }

  /** Read-only runtime config for the Settings page — env-managed, shown honestly. */
  config(): AdminConfigEntry[] {
    const c = this.cfg;
    return [
      { key: 'GAMES_DIR', value: c.GAMES_DIR },
      { key: 'PUBLIC_WEB_URL', value: c.PUBLIC_WEB_URL },
      { key: 'CORS_ORIGINS', value: c.corsOrigins.join(', ') },
      { key: 'SESSION_TTL_MS', value: String(c.SESSION_TTL_MS) },
      { key: 'GRACE_PERIOD_MS', value: String(c.GRACE_PERIOD_MS) },
      { key: 'JOIN_TOKEN_TTL_MS', value: String(c.JOIN_TOKEN_TTL_MS) },
      { key: 'JOIN_TOKEN_ROTATE_MS', value: String(c.JOIN_TOKEN_ROTATE_MS) },
      { key: 'RATE_LIMIT_JOIN_PER_MIN', value: String(c.RATE_LIMIT_JOIN_PER_MIN) },
      { key: 'WS_INPUT_RATE_PER_SEC', value: String(c.WS_INPUT_RATE_PER_SEC) }
    ];
  }

  /** Pick up packages dropped into GAMES_DIR since boot — no restart. */
  async rescanGames(): Promise<{ added: GameInfoLite[] }> {
    return { added: await this.loader.discover() };
  }

  /** Both factors compared timing-safe; success issues a 12h admin JWT. */
  login(email: string, password: string): AdminLoginResponse {
    const okEmail = safeEqual(email.trim().toLowerCase(), this.cfg.ADMIN_EMAIL.toLowerCase());
    const okPassword = safeEqual(password, this.cfg.ADMIN_PASSWORD);
    if (!okEmail || !okPassword) throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
    return { adminToken: this.tokens.issueAdminToken(this.cfg.ADMIN_EMAIL), email: this.cfg.ADMIN_EMAIL };
  }

  async listGames(): Promise<AdminGame[]> {
    const games = this.runtime.listAllGames();
    return Promise.all(
      games.map(async (g) => {
        const [doc, playsFinished] = await Promise.all([
          InstalledPlugin.findOne({ pluginId: g.gameId, version: g.version }).lean(),
          GameInstance.countDocuments({ pluginId: g.gameId, finishedAt: { $exists: true } })
        ]);
        return {
          ...g,
          source: doc?.source ?? 'local',
          enabled: doc?.enabled ?? true,
          featured: doc?.featured ?? false,
          installedAt: doc?.installedAt ? doc.installedAt.toISOString() : null,
          playsFinished
        };
      })
    );
  }

  /** The live kill switch + featured pin — take effect immediately, no restart. */
  async setGameFlags(
    pluginId: string,
    flags: { enabled?: boolean; featured?: boolean }
  ): Promise<AdminGame> {
    const update: Record<string, boolean> = {};
    if (flags.enabled !== undefined) update.enabled = flags.enabled;
    if (flags.featured !== undefined) update.featured = flags.featured;
    const res = await InstalledPlugin.updateMany({ pluginId }, update);
    if (res.matchedCount === 0) throw new AppError(404, 'GAME_NOT_FOUND', `No installed plugin '${pluginId}'`);
    const game = (await this.listGames()).find((g) => g.gameId === pluginId);
    if (!game) throw new AppError(404, 'GAME_NOT_FOUND', `'${pluginId}' is not in the loaded registry`);
    return game;
  }

  async listSessions(): Promise<AdminSession[]> {
    const docs = await GameSession.find({ status: { $in: ['lobby', 'playing'] } })
      .sort({ updatedAt: -1 })
      .limit(100)
      .select('-hostTokenHash')
      .lean();

    return Promise.all(
      docs.map(async (doc) => {
        const state = await this.store.getState(doc._id);
        const players = state ? await this.store.getPlayers(doc._id) : {};
        const list = Object.values(players);
        return {
          sessionId: doc._id,
          code: doc.code,
          status: state?.status ?? doc.status,
          live: !!state,
          playerCount: list.length,
          connectedCount: list.filter((p) => p.presence === 'connected').length,
          currentGameId: state?.currentGameId || null,
          createdAt: doc.createdAt.toISOString(),
          updatedAt: doc.updatedAt.toISOString()
        };
      })
    );
  }

  async stats(): Promise<AdminStats> {
    const sessions = await this.listSessions();
    const [totalSessions, activeSessions, byGame] = await Promise.all([
      GameSession.estimatedDocumentCount(),
      GameSession.countDocuments({ status: { $in: ['lobby', 'playing'] } }),
      Promise.all(
        this.runtime.listAllGames().map(async (g) => ({
          gameId: g.gameId,
          plays: await GameInstance.countDocuments({ pluginId: g.gameId, finishedAt: { $exists: true } })
        }))
      )
    ]);
    return {
      activeSessions,
      totalSessions,
      gamesPlayed: byGame.reduce((sum, g) => sum + g.plays, 0),
      playersInRooms: sessions.reduce((sum, s) => sum + s.playerCount, 0),
      byGame: byGame.sort((a, b) => b.plays - a.plays)
    };
  }
}
