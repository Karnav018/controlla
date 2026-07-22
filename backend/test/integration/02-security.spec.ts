import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer, teardownMongo, type TestServer } from '../helpers/testServer';
import { expectConnectError, restJson } from '../helpers/testClient';

describe('security: tokens, auth boundaries, rate limits', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer({ RATE_LIMIT_JOIN_PER_MIN: '5' });
  });

  afterAll(async () => {
    await server.stop();
    await teardownMongo();
  });

  it('rejects joins with an invalid join token even when the session exists', async () => {
    const { sessionId } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const res = await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, {
      nickname: 'Mallory',
      joinToken: 'forged-token'
    });
    expect(res.status).toBe(401);
    expect(res.json.error).toBe('INVALID_JOIN_TOKEN');
  });

  it('a playerToken can never pass host auth (role confusion)', async () => {
    const { sessionId } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const { playerToken } = (
      await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname: 'P' })
    ).json;

    const start = await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/start`, undefined, playerToken);
    expect(start.status).toBe(403);
    const del = await restJson(server.baseUrl, 'DELETE', `/sessions/${sessionId}`, undefined, playerToken);
    expect(del.status).toBe(403);
  });

  it("a host token from session A cannot control session B", async () => {
    const a = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const b = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const res = await restJson(server.baseUrl, 'POST', `/sessions/${b.sessionId}/start`, undefined, a.hostToken);
    expect(res.status).toBe(403);
  });

  it('joinUrl is host-only on GET /sessions/:id', async () => {
    const { sessionId, hostToken } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const anon = await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}`);
    expect(anon.status).toBe(200);
    expect(anon.json.joinUrl).toBeUndefined();
    const host = await restJson(server.baseUrl, 'GET', `/sessions/${sessionId}`, undefined, hostToken);
    expect(host.json.joinUrl).toContain('/play/');
  });

  it('socket auth rejects garbage tokens and dead sessions with machine-readable codes', async () => {
    expect(await expectConnectError(server.baseUrl, 'garbage')).toBe('UNAUTHORIZED');

    const { sessionId, hostToken } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/end`, undefined, hostToken);
    expect(await expectConnectError(server.baseUrl, hostToken)).toBe('SESSION_NOT_FOUND');
  });

  it('rate limits join floods with 429', async () => {
    const { sessionId } = (await restJson(server.baseUrl, 'POST', '/sessions')).json;
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await restJson(server.baseUrl, 'POST', `/sessions/${sessionId}/join`, { nickname: `p${i}` });
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(5);
    expect(statuses).toContain(429);
  });

  it('unknown codes and sessions 404', async () => {
    expect((await restJson(server.baseUrl, 'GET', '/sessions/code/ZZZZZZ')).status).toBe(404);
    expect((await restJson(server.baseUrl, 'GET', '/sessions/nope')).status).toBe(404);
  });
});
