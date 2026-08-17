/**
 * @file Proves the property the circuit breakers exist for: one degraded
 * external dependency must not consume the gateway's request capacity or reach
 * routes that do not depend on it, and it must come back on its own.
 *
 * The dependency under test is Clerk, because it sits on the hot path of every
 * app-surface request. Two things are asserted against a hung Clerk: requests
 * that need it stop waiting (they short-circuit instead of holding a handler
 * for the provider's full latency), and requests that do not need it — the
 * gateway's own JWT sessions and the liveness probes — keep answering at
 * normal speed throughout.
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { circuitBreakerSnapshots } from '@agiworkforce/utils';
import { authenticateToken } from '../../src/middleware/auth';

const clerk = vi.hoisted(() => ({
  hang: false,
  hangMs: 30_000,
  concurrent: 0,
  peakConcurrent: 0,
  calls: 0,
}));

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(async (token: string) => {
    clerk.calls += 1;
    clerk.concurrent += 1;
    clerk.peakConcurrent = Math.max(clerk.peakConcurrent, clerk.concurrent);
    try {
      if (clerk.hang) {
        await new Promise((resolve) => setTimeout(resolve, clerk.hangMs));
      }
      const decoded = jwt.decode(token) as { sub?: string } | null;
      return { sub: decoded?.sub ?? 'clerk-user', email: 'clerk@example.com' };
    } finally {
      clerk.concurrent -= 1;
    }
  }),
}));

const db = vi.hoisted(() => ({
  hang: false,
  hangMs: 30_000,
  concurrent: 0,
  peakConcurrent: 0,
  queries: 0,
}));

vi.mock('../../src/lib/neonClients', () => {
  const runQuery = async <T>(value: T): Promise<{ data: T; error: null }> => {
    db.queries += 1;
    db.concurrent += 1;
    db.peakConcurrent = Math.max(db.peakConcurrent, db.concurrent);
    try {
      if (db.hang) await new Promise((resolve) => setTimeout(resolve, db.hangMs));
      return { data: value, error: null };
    } finally {
      db.concurrent -= 1;
    }
  };
  return {
    getUserScopedClient: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => runQuery({ account_status: 'active' }),
            maybeSingle: () => runQuery(null),
          }),
        }),
      }),
    }),
  };
});

const GATEWAY_SIGN_OPTIONS = {
  issuer: 'agiworkforce-api-gateway',
  audience: 'agiworkforce',
} as const;

const CLERK_OPEN_MS = 300;

function clerkToken(): string {
  return jwt.sign({ sub: 'clerk-user', email: 'clerk@example.com' }, 'unused-by-the-mock', {
    issuer: 'https://clerk.example.com',
    expiresIn: '1h',
  });
}

function gatewayToken(userId = 'developer-1'): string {
  return jwt.sign(
    { userId, email: 'dev@example.com', surface: 'developer' },
    process.env['JWT_SECRET']!,
    { expiresIn: '1h', ...GATEWAY_SIGN_OPTIONS },
  );
}

function buildApp(): express.Express {
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/protected', authenticateToken, (req, res) => {
    res.json({ userId: req.user?.userId, surface: req.user?.surface });
  });
  return app;
}

function snapshotOf(name: string) {
  return circuitBreakerSnapshots().find((snapshot) => snapshot.name === name);
}

describe('degraded dependency isolation', () => {
  beforeEach(() => {
    clerk.hang = false;
    clerk.hangMs = 30_000;
    clerk.concurrent = 0;
    clerk.peakConcurrent = 0;
    clerk.calls = 0;
    db.hang = false;
    db.hangMs = 30_000;
    db.concurrent = 0;
    db.peakConcurrent = 0;
    db.queries = 0;
    vi.stubEnv('CB_AUTH_DB_TIMEOUT_MS', '80');
    vi.stubEnv('CB_AUTH_DB_SLOW_MS', '40');
    vi.stubEnv('CB_AUTH_DB_MAX_CONCURRENT', '3');
    vi.stubEnv('CB_AUTH_DB_MAX_QUEUED', '2');
    vi.stubEnv('CB_AUTH_DB_QUEUE_TIMEOUT_MS', '40');
    vi.stubEnv('CB_AUTH_DB_VOLUME_THRESHOLD', '3');
    vi.stubEnv('CB_AUTH_DB_OPEN_MS', String(CLERK_OPEN_MS));
    vi.stubEnv('CB_CLERK_TIMEOUT_MS', '80');
    vi.stubEnv('CB_CLERK_SLOW_MS', '40');
    vi.stubEnv('CB_CLERK_MAX_CONCURRENT', '4');
    vi.stubEnv('CB_CLERK_MAX_QUEUED', '2');
    vi.stubEnv('CB_CLERK_QUEUE_TIMEOUT_MS', '40');
    vi.stubEnv('CB_CLERK_VOLUME_THRESHOLD', '3');
    vi.stubEnv('CB_CLERK_OPEN_MS', String(CLERK_OPEN_MS));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('serves gateway-session and liveness traffic at full speed while Clerk hangs', async () => {
    const app = buildApp();
    clerk.hang = true;

    const startedAt = Date.now();
    const clerkTraffic = Array.from({ length: 30 }, () =>
      request(app).get('/protected').set('authorization', `Bearer ${clerkToken()}`),
    );

    const unrelatedTraffic = await Promise.all([
      ...Array.from({ length: 20 }, () =>
        request(app).get('/protected').set('authorization', `Bearer ${gatewayToken()}`),
      ),
      ...Array.from({ length: 20 }, () => request(app).get('/health')),
    ]);
    const unrelatedElapsed = Date.now() - startedAt;

    expect(unrelatedTraffic.every((response) => response.status === 200)).toBe(true);
    expect(
      unrelatedTraffic.filter((response) => response.body.surface === 'developer'),
    ).toHaveLength(20);
    // The hung dependency answers in 30s. Unrelated traffic finishing in a
    // fraction of that is the whole point: it never queued behind Clerk.
    expect(unrelatedElapsed).toBeLessThan(2_000);

    const clerkResponses = await Promise.all(clerkTraffic);
    expect(clerkResponses.every((response) => response.status === 503)).toBe(true);
    expect(
      clerkResponses.every((response) => response.body.code === 'IDENTITY_PROVIDER_UNAVAILABLE'),
    ).toBe(true);
    expect(clerkResponses.every((response) => Number(response.headers['retry-after']) >= 1)).toBe(
      true,
    );

    // Bulkhead: at most `maxConcurrent` calls may be in flight against a
    // dependency at once, no matter how many requests arrive.
    expect(clerk.peakConcurrent).toBeLessThanOrEqual(4);
    // Circuit: once open, later requests never dial Clerk at all.
    expect(clerk.calls).toBeLessThan(30);
    expect(snapshotOf('clerk')?.state).toBe('open');
  });

  it('stops holding request handlers for the dependency latency', async () => {
    const app = buildApp();
    clerk.hang = true;

    const first = Date.now();
    await request(app).get('/protected').set('authorization', `Bearer ${clerkToken()}`);
    const firstElapsed = Date.now() - first;

    // The very first caller pays the timeout, not the dependency's 30s hang.
    expect(firstElapsed).toBeLessThan(1_000);
    expect(snapshotOf('clerk')?.totals.timeouts).toBeGreaterThanOrEqual(1);
  });

  it('recovers on its own once the dependency is healthy again', async () => {
    const app = buildApp();
    clerk.hang = true;

    await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).get('/protected').set('authorization', `Bearer ${clerkToken()}`),
      ),
    );
    expect(snapshotOf('clerk')?.state).toBe('open');

    clerk.hang = false;
    const callsWhileOpen = clerk.calls;

    const stillOpen = await request(app)
      .get('/protected')
      .set('authorization', `Bearer ${clerkToken()}`);
    expect(stillOpen.status).toBe(503);
    expect(clerk.calls).toBe(callsWhileOpen);

    await new Promise((resolve) => setTimeout(resolve, CLERK_OPEN_MS + 50));

    const probe = await request(app)
      .get('/protected')
      .set('authorization', `Bearer ${clerkToken()}`);
    expect(probe.status).toBe(200);
    expect(probe.body.userId).toBe('clerk-user');

    const second = await request(app)
      .get('/protected')
      .set('authorization', `Bearer ${clerkToken()}`);
    expect(second.status).toBe(200);

    expect(snapshotOf('clerk')?.state).toBe('closed');
    expect(snapshotOf('clerk')?.healthy).toBe(true);
  });

  it('caps how many auth requests may hold a database connection at once', async () => {
    const app = buildApp();
    db.hang = true;

    const startedAt = Date.now();
    // Distinct users, so the account-status cache cannot absorb the load and
    // every request genuinely reaches for a pooled connection.
    const authTraffic = await Promise.all(
      Array.from({ length: 40 }, (_, index) =>
        request(app)
          .get('/protected')
          .set('authorization', `Bearer ${gatewayToken(`u-${index}`)}`),
      ),
    );
    const elapsed = Date.now() - startedAt;

    expect(authTraffic.every((response) => response.status === 503)).toBe(true);
    expect(authTraffic.every((response) => response.body.code === 'AUTH_CHECK_UNAVAILABLE')).toBe(
      true,
    );
    // Without a bulkhead these 40 requests would each occupy a pool connection.
    expect(db.peakConcurrent).toBeLessThanOrEqual(3);
    expect(db.queries).toBeLessThan(40);
    expect(elapsed).toBeLessThan(5_000);
    expect(snapshotOf('neon:auth')?.state).toBe('open');

    // A route that does not touch the database is untouched by the outage.
    const liveness = await request(app).get('/health');
    expect(liveness.status).toBe(200);
  });

  it('recovers database-backed auth once the database answers again', async () => {
    const app = buildApp();
    db.hang = true;

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        request(app)
          .get('/protected')
          .set('authorization', `Bearer ${gatewayToken(`slow-${index}`)}`),
      ),
    );
    expect(snapshotOf('neon:auth')?.state).toBe('open');

    db.hang = false;
    await new Promise((resolve) => setTimeout(resolve, CLERK_OPEN_MS + 50));

    for (const userId of ['healed-1', 'healed-2']) {
      const response = await request(app)
        .get('/protected')
        .set('authorization', `Bearer ${gatewayToken(userId)}`);
      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(userId);
    }

    expect(snapshotOf('neon:auth')?.state).toBe('closed');
  });

  it('keeps a rejected token from tripping the identity circuit', async () => {
    const app = buildApp();
    const { verifyToken } = await import('@clerk/backend');
    vi.mocked(verifyToken).mockImplementation(async () => {
      throw Object.assign(new Error('token expired'), { reason: 'token-expired' });
    });

    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        request(app).get('/protected').set('authorization', `Bearer ${clerkToken()}`),
      ),
    );

    expect(responses.every((response) => response.status === 403)).toBe(true);
    expect(snapshotOf('clerk')?.state).toBe('closed');
  });
});
