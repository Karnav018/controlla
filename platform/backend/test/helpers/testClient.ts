import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { WIRE_EVENT, PROTOCOL_VERSION, type Envelope } from '../../src/protocol';

export function connectClient(baseUrl: string, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('socket connect timeout'));
    }, 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Expects the connection to be refused; resolves with the connect_error message. */
export function expectConnectError(baseUrl: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = ioc(baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('expected connect_error, got timeout'));
    }, 5000);
    socket.on('connect', () => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error('expected connect_error, but connected'));
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      resolve(err.message);
    });
  });
}

/** Records every envelope on a socket; waitFor() checks history first, then waits. */
export class EnvelopeCollector {
  envelopes: Envelope[] = [];
  private waiters: Array<{
    pred: (env: Envelope) => boolean;
    resolve: (env: Envelope) => void;
  }> = [];

  constructor(socket: ClientSocket) {
    socket.on(WIRE_EVENT, (env: Envelope) => {
      this.envelopes.push(env);
      this.waiters = this.waiters.filter((w) => {
        if (w.pred(env)) {
          w.resolve(env);
          return false;
        }
        return true;
      });
    });
  }

  ofType(type: string): Envelope[] {
    return this.envelopes.filter((e) => e.type === type);
  }

  waitFor(type: string, opts: { timeoutMs?: number; pred?: (env: Envelope) => boolean; after?: number } = {}): Promise<Envelope> {
    const pred = (env: Envelope) => env.type === type && (opts.pred?.(env) ?? true);
    const startIdx = opts.after ?? 0;
    const past = this.envelopes.slice(startIdx).find(pred);
    if (past) return Promise.resolve(past);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timed out waiting for ${type}; saw [${this.envelopes.map((e) => e.type).join(', ')}]`)),
        opts.timeoutMs ?? 8000
      );
      this.waiters.push({
        pred,
        resolve: (env) => {
          clearTimeout(timer);
          resolve(env);
        }
      });
    });
  }

  get length(): number {
    return this.envelopes.length;
  }
}

/** Client-side sender with automatic per-connection seq numbering. */
export class Sender {
  private seq = 0;

  constructor(
    private socket: ClientSocket,
    private sessionId: string,
    private senderId: string
  ) {}

  send(type: string, payload: unknown, seqOverride?: number): number {
    const seq = seqOverride ?? ++this.seq;
    if (seqOverride !== undefined && seqOverride > this.seq) this.seq = seqOverride;
    const env: Envelope = {
      v: PROTOCOL_VERSION,
      type,
      sessionId: this.sessionId,
      senderId: this.senderId,
      seq,
      ts: Date.now(),
      payload
    };
    this.socket.emit(WIRE_EVENT, env);
    return seq;
  }

  async ping(): Promise<{ ts: number }> {
    const env: Envelope = {
      v: PROTOCOL_VERSION,
      type: 'PING',
      sessionId: this.sessionId,
      senderId: this.senderId,
      seq: ++this.seq,
      ts: Date.now(),
      payload: {}
    };
    return (await this.socket.timeout(3000).emitWithAck(WIRE_EVENT, env)) as { ts: number };
  }
}

export async function restJson(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract the join token from a joinUrl (`…/play/CODE?t=…`). */
export function joinTokenFrom(joinUrl: string): string {
  const url = new URL(joinUrl);
  const t = url.searchParams.get('t');
  if (!t) throw new Error(`joinUrl missing token: ${joinUrl}`);
  return t;
}
