import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { Logger } from '../logger';
import type { GamePlugin } from '../sdk/types';
import type { PluginFactory } from './pluginRuntime';
import { InstalledPlugin } from '../db/models/installedPlugin';

/**
 * How game providers launch on the platform: each game is a directory under
 * GAMES_DIR containing a module whose `createPlugin` (or default) export is a
 * factory returning a GamePlugin. The contract is structural — providers need
 * NO runtime dependency on platform code; plain JS that matches the interface
 * is a valid game.
 *
 * Discovery: at boot the loader scans GAMES_DIR, probes each plugin's
 * metadata(), validates it, registers it into the runtime registry, and
 * upserts it into the installedPlugins collection (source: 'local').
 * Operators enable/disable games there without touching platform code.
 * An invalid plugin is skipped with an error log — one broken game never
 * stops the platform from booting.
 */

export interface GameInfoLite {
  gameId: string;
  name: string;
  version: string;
}

const MetadataSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'lowercase-kebab id'),
    name: z.string().min(1).max(80),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver x.y.z'),
    description: z.string().max(300).optional(),
    minPlayers: z.number().int().min(1),
    maxPlayers: z.number().int().min(1),
    tickRate: z.number().min(0).max(60),
    /** The game's own main-screen UI; the platform iframes it and relays state. */
    hostViewUrl: z.string().url().optional()
  })
  .refine((m) => m.maxPlayers >= m.minPlayers, { message: 'maxPlayers < minPlayers' });

const ENTRY_CANDIDATES = ['index.js', 'index.mjs', 'index.ts'];
const DIR_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class PluginLoader {
  /** Dirs already loaded — lets rescans skip known packages silently. */
  private loadedDirs = new Set<string>();
  /** gameId → package dir; what uninstall removes. */
  private idToDir = new Map<string, string>();

  constructor(
    private gamesDir: string,
    private registry: Map<string, PluginFactory>,
    private log: Logger
  ) {}

  /**
   * Scan GAMES_DIR, validate each plugin, fill the registry, seed
   * installedPlugins. Idempotent — safe to call again at runtime (admin
   * "rescan") to pick up packages dropped on disk since boot.
   */
  async discover(): Promise<GameInfoLite[]> {
    let entries: string[];
    try {
      entries = (await readdir(this.gamesDir)).sort();
    } catch {
      this.log.info({ gamesDir: this.gamesDir }, 'no games directory — platform boots with zero games');
      return [];
    }

    const added: GameInfoLite[] = [];
    for (const entry of entries) {
      const dir = path.resolve(this.gamesDir, entry);
      if (this.loadedDirs.has(dir)) continue;
      try {
        if (!(await stat(dir)).isDirectory()) continue;
        added.push(await this.loadDir(dir));
      } catch (err) {
        this.log.error({ err, dir }, 'skipping invalid game plugin');
      }
    }
    return added;
  }

  /**
   * Admin install: write a provider's module into GAMES_DIR and load it live —
   * no restart. Operator-trusted code only (it runs in-process, same trust as
   * dropping a folder on disk). Invalid packages are rolled back.
   */
  async install(dirName: string, code: string): Promise<GameInfoLite> {
    if (!DIR_NAME_RE.test(dirName)) {
      throw new Error('dirName must be lowercase-kebab (a-z, 0-9, dashes)');
    }
    const dir = path.resolve(this.gamesDir, dirName);
    if (!dir.startsWith(path.resolve(this.gamesDir) + path.sep)) throw new Error('invalid dirName');
    if (this.loadedDirs.has(dir)) throw new Error(`'${dirName}' is already installed — updates need a restart`);
    try {
      await stat(dir);
      throw new Error(`directory '${dirName}' already exists in the games folder`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }

    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.js'), code, 'utf8');
    try {
      return await this.loadDir(dir);
    } catch (err) {
      await rm(dir, { recursive: true, force: true }); // roll back the broken package
      throw err;
    }
  }

  /**
   * Remove a package: deregister from the runtime and delete its directory.
   * Games already in flight keep their in-memory instance and finish normally.
   */
  async uninstall(gameId: string): Promise<void> {
    const dir = this.idToDir.get(gameId);
    if (!dir) throw new Error(`'${gameId}' is not an installed package`);
    this.registry.delete(gameId);
    this.idToDir.delete(gameId);
    this.loadedDirs.delete(dir);
    await rm(dir, { recursive: true, force: true });
    this.log.info({ gameId, dir }, 'game plugin uninstalled');
  }

  private async loadDir(dir: string): Promise<GameInfoLite> {
    const factory = await this.loadFactory(dir);
    const probe: GamePlugin = factory();
    const meta = MetadataSchema.parse(probe.metadata());
    for (const hook of ['init', 'onPlayerJoin', 'onPlayerLeave', 'onPlayerReconnect', 'onInput'] as const) {
      if (typeof probe[hook] !== 'function') throw new Error(`plugin is missing required hook ${hook}()`);
    }
    if (this.registry.has(meta.id)) throw new Error(`duplicate game id '${meta.id}'`);

    this.registry.set(meta.id, factory);
    this.loadedDirs.add(dir);
    this.idToDir.set(meta.id, dir);
    await InstalledPlugin.updateOne(
      { _id: `${meta.id}@${meta.version}` },
      {
        $setOnInsert: {
          pluginId: meta.id,
          version: meta.version,
          source: 'local',
          enabled: true,
          installedAt: new Date()
        }
      },
      { upsert: true }
    );
    this.log.info({ gameId: meta.id, version: meta.version, dir }, 'game plugin loaded');
    return { gameId: meta.id, name: meta.name, version: meta.version };
  }

  private async loadFactory(dir: string): Promise<PluginFactory> {
    const tryImport = async (file: string): Promise<PluginFactory | null> => {
      try {
        await stat(file);
      } catch {
        return null;
      }
      const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
      const factory = mod.createPlugin ?? mod.default;
      if (typeof factory !== 'function') {
        throw new Error(`${path.basename(file)} must export createPlugin() or a default factory`);
      }
      return factory as PluginFactory;
    };

    for (const candidate of ENTRY_CANDIDATES) {
      const factory = await tryImport(path.join(dir, candidate));
      if (factory) return factory;
    }
    // package.json "main" fallback for npm-packaged games
    try {
      const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8')) as { main?: string };
      if (pkg.main) {
        const factory = await tryImport(path.resolve(dir, pkg.main));
        if (factory) return factory;
      }
    } catch {
      /* fall through */
    }
    throw new Error(`no entry point (${ENTRY_CANDIDATES.join(' / ')} or package.json "main")`);
  }
}
