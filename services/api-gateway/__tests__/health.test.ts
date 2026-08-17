import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('Gateway health and readiness contracts', () => {
  it('returns cheap liveness with a request identifier and release', async () => {
    vi.stubEnv('RELEASE_SHA', 'deadbeef');
    const app = createApp({ readinessCheck: async () => undefined });

    const response = await request(app).get('/health').set('x-request-id', 'probe-123');

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toBe('probe-123');
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'api-gateway',
      release: 'deadbeef',
    });
    expect(Number.isFinite(response.body.uptime)).toBe(true);
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
    vi.unstubAllEnvs();
  });

  it('does not rate-limit orchestrator liveness probes', async () => {
    const app = createApp({ readinessCheck: async () => undefined });
    const responses = await Promise.all(
      Array.from({ length: 110 }, () => request(app).get('/health')),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
  });

  it('replaces unsafe request identifiers instead of reflecting them', async () => {
    const app = createApp({ readinessCheck: async () => undefined });
    const response = await request(app).get('/health').set('x-request-id', 'x'.repeat(129));

    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('reports ready only while traffic is accepted and dependencies pass', async () => {
    let acceptingTraffic = true;
    const readinessCheck = vi.fn(async () => undefined);
    const app = createApp({
      isAcceptingTraffic: () => acceptingTraffic,
      readinessCheck,
    });

    const ready = await request(app).get('/ready');
    expect(ready.status).toBe(200);
    expect(ready.body).toMatchObject({
      status: 'ready',
      service: 'api-gateway',
      requestId: ready.headers['x-request-id'],
    });
    expect(readinessCheck).toHaveBeenCalledOnce();

    acceptingTraffic = false;
    const draining = await request(app).get('/ready');
    expect(draining.status).toBe(503);
    expect(draining.body.status).toBe('not_ready');
    expect(readinessCheck).toHaveBeenCalledOnce();
  });

  it('fails readiness closed when the database check fails', async () => {
    const app = createApp({
      readinessCheck: async () => {
        throw new Error('database unavailable');
      },
    });

    const response = await request(app).get('/ready');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.body).not.toHaveProperty('error');
  });

  it('reports dependency circuit state without calling any dependency', async () => {
    const readinessCheck = vi.fn(async () => {
      throw new Error('database unavailable');
    });
    const app = createApp({ readinessCheck });

    const response = await request(app).get('/health/dependencies');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      service: 'api-gateway',
      degraded: [],
    });
    expect(Array.isArray(response.body.dependencies)).toBe(true);
    expect(readinessCheck).not.toHaveBeenCalled();
  });
});
