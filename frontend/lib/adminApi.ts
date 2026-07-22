import { API_URL, ApiError } from './api';
import type {
  AdminActivityItem,
  AdminConfigEntry,
  AdminGame,
  AdminLoginResponse,
  AdminSession,
  AdminStats
} from './protocol';

async function adminFetch<T>(method: string, path: string, token: string | null, body?: unknown): Promise<T> {
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

export const adminLogin = (email: string, password: string) =>
  adminFetch<AdminLoginResponse>('POST', '/admin/login', null, { email, password });
export const adminGames = (token: string) => adminFetch<AdminGame[]>('GET', '/admin/games', token);
export const adminPatchGame = (token: string, pluginId: string, flags: { enabled?: boolean; featured?: boolean }) =>
  adminFetch<AdminGame>('PATCH', `/admin/games/${pluginId}`, token, flags);
export const adminUninstallGame = (token: string, pluginId: string) =>
  adminFetch<void>('DELETE', `/admin/games/${pluginId}`, token);
export const adminSessions = (token: string) => adminFetch<AdminSession[]>('GET', '/admin/sessions', token);
export const adminEndSession = (token: string, sessionId: string) =>
  adminFetch<void>('DELETE', `/admin/sessions/${sessionId}`, token);
export const adminStats = (token: string) => adminFetch<AdminStats>('GET', '/admin/stats', token);
export const adminActivity = (token: string) => adminFetch<AdminActivityItem[]>('GET', '/admin/activity', token);
export const adminConfig = (token: string) => adminFetch<AdminConfigEntry[]>('GET', '/admin/config', token);
export const adminInstallGame = (token: string, dirName: string, code: string) =>
  adminFetch<AdminGame>('POST', '/admin/games/install', token, { dirName, code });
export const adminRescanGames = (token: string) =>
  adminFetch<{ added: Array<{ gameId: string; name: string; version: string }> }>(
    'POST',
    '/admin/games/rescan',
    token,
    {}
  );
