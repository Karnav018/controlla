import type { CreateSessionResponse, GameInfo, SessionResultsResponse } from './protocol';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ??
  (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:4000` : 'http://localhost:4000');

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

async function api<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, json?.error ?? 'ERROR', json?.message);
  return json as T;
}

export const fetchGames = () => api<GameInfo[]>('GET', '/games');

/** Game view URLs may be platform-relative (served game assets) or absolute. */
export const resolveGameUrl = (url: string) => (url.startsWith('/') ? `${API_URL}${url}` : url);
export const createSession = () => api<CreateSessionResponse>('POST', '/sessions');
export const fetchSession = (sessionId: string, hostToken: string) =>
  api<{ sessionId: string; status: string }>('GET', `/sessions/${sessionId}`, undefined, hostToken);
export const fetchResults = (sessionId: string) =>
  api<SessionResultsResponse>('GET', `/sessions/${sessionId}/results`);
