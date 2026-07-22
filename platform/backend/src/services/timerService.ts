import type { Logger } from '../logger';
import type { LiveStore } from '../redis/liveStore';
import { TIMERS_KEY_RE } from '../redis/keys';

export type TimerHandler = (sessionId: string, arg: string) => Promise<void> | void;

/**
 * Durable timers. The authoritative entry is the Redis zset
 * session:{id}:timers (member `${kind}:${arg}`, score = fire-at ms); the
 * in-memory setTimeout is only a low-latency trigger. Three mechanisms
 * guarantee firing exactly once:
 *  1. normal path — the armed setTimeout pops via popDueTimer (ZREM iff due);
 *  2. boot recovery — recoverAll() re-arms everything found in Redis;
 *  3. sweep loop — catches drift and anything a dead process left behind.
 */
export class TimerService {
  private handlers = new Map<string, TimerHandler>();
  private local = new Map<string, NodeJS.Timeout>();
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private store: LiveStore,
    private log: Logger
  ) {}

  register(kind: string, handler: TimerHandler): void {
    this.handlers.set(kind, handler);
  }

  async schedule(sessionId: string, kind: string, arg: string, fireAtMs: number): Promise<void> {
    const member = `${kind}:${arg}`;
    await this.store.addTimer(sessionId, member, fireAtMs);
    this.armLocal(sessionId, member, fireAtMs);
  }

  /** Arm only the local trigger — used when the ZADD already happened atomically (disconnect.lua). */
  armLocal(sessionId: string, member: string, fireAtMs: number): void {
    const key = `${sessionId}|${member}`;
    const existing = this.local.get(key);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.local.delete(key);
      void this.fire(sessionId, member);
    }, Math.max(0, fireAtMs - Date.now()));
    t.unref?.();
    this.local.set(key, t);
  }

  async cancel(sessionId: string, kind: string, arg: string): Promise<void> {
    const member = `${kind}:${arg}`;
    await this.store.removeTimer(sessionId, member);
    this.clearLocal(sessionId, member);
  }

  clearLocal(sessionId: string, member: string): void {
    const key = `${sessionId}|${member}`;
    const t = this.local.get(key);
    if (t) {
      clearTimeout(t);
      this.local.delete(key);
    }
  }

  cancelAllLocal(sessionId: string): void {
    const prefix = `${sessionId}|`;
    for (const [key, t] of this.local) {
      if (key.startsWith(prefix)) {
        clearTimeout(t);
        this.local.delete(key);
      }
    }
  }

  private async fire(sessionId: string, member: string): Promise<void> {
    try {
      const due = await this.store.popDueTimer(sessionId, member, Date.now());
      if (!due) return; // not due yet, already fired elsewhere, or cancelled
      const idx = member.indexOf(':');
      const kind = idx === -1 ? member : member.slice(0, idx);
      const arg = idx === -1 ? '' : member.slice(idx + 1);
      const handler = this.handlers.get(kind);
      if (!handler) {
        this.log.warn({ sessionId, member }, 'timer fired with no registered handler');
        return;
      }
      await handler(sessionId, arg);
    } catch (err) {
      this.log.error({ err, sessionId, member }, 'timer handler failed');
    }
  }

  /** Boot recovery: re-arm every timer found in Redis; overdue ones fire immediately. */
  async recoverAll(): Promise<void> {
    const keys = await this.store.scanTimerKeys();
    for (const key of keys) {
      const m = TIMERS_KEY_RE.exec(key);
      if (!m || !m[1]) continue;
      const sessionId = m[1];
      for (const { member, fireAtMs } of await this.store.listTimers(sessionId)) {
        this.armLocal(sessionId, member, fireAtMs);
      }
    }
  }

  startSweep(intervalMs: number): void {
    this.sweeper = setInterval(() => {
      void (async () => {
        try {
          const keys = await this.store.scanTimerKeys();
          for (const key of keys) {
            const m = TIMERS_KEY_RE.exec(key);
            if (!m || !m[1]) continue;
            const sessionId = m[1];
            for (const member of await this.store.listDueTimers(sessionId, Date.now())) {
              await this.fire(sessionId, member);
            }
          }
        } catch (err) {
          this.log.error({ err }, 'timer sweep failed');
        }
      })();
    }, intervalMs);
    this.sweeper.unref?.();
  }

  stop(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.sweeper = null;
    for (const t of this.local.values()) clearTimeout(t);
    this.local.clear();
  }
}
