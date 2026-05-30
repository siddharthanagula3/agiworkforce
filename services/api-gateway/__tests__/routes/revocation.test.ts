/**
 * P1-GW-REVOKE regression tests.
 *
 * Before the fix, gateway-minted tokens carried no `jti`, so the per-token
 * revocation check in middleware/auth.ts was always skipped and /auth/logout
 * bailed to `{ revoked: false }` — revocation was dead code.
 *
 * These tests encode the fix end-to-end:
 *  1. A token minted by the device-code flow carries a `jti` claim.
 *  2. POST /auth/logout records the revocation (insert into revoked_jwts) and
 *     returns `{ revoked: true }`.
 *  3. A subsequent request with the revoked token is rejected with 401.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Shared mutable state driving the Neon mock across the device-code, logout,
// and revocation-check paths.
const { state } = vi.hoisted(() => ({
  state: {
    // device_authorization_codes row returned by the /token poll.
    deviceRecord: {
      device_id: '22222222-2222-4222-8222-222222222222',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      status: 'approved',
      user_id: 'user-revoke-1',
      user_email: 'revoke@example.com',
    } as Record<string, unknown>,
    // Set of jtis that revoked_jwts currently contains.
    revokedJtis: new Set<string>(),
    // Captures the last insert payload into revoked_jwts.
    lastRevokeInsert: null as Record<string, unknown> | null,
  },
}));

vi.mock('../../src/lib/neonClients', () => {
  // A single shared client object models every table the three routes touch.
  function from(table: string) {
    if (table === 'device_authorization_codes') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: state.deviceRecord, error: null }),
          }),
        }),
        // /token marks the record consumed after minting.
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            // device flow profile email enrichment
            maybeSingle: () =>
              Promise.resolve({
                data: { id: 'user-revoke-1', email: 'revoke@example.com' },
                error: null,
              }),
            // kill-switch account_status lookup
            single: () => Promise.resolve({ data: { account_status: 'active' }, error: null }),
          }),
        }),
      };
    }
    if (table === 'revoked_jwts') {
      return {
        select: () => ({
          eq: (_col: string, jti: string) => ({
            maybeSingle: () =>
              Promise.resolve({
                data: state.revokedJtis.has(jti) ? { jti } : null,
                error: null,
              }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          state.lastRevokeInsert = payload;
          if (typeof payload.jti === 'string') {
            state.revokedJtis.add(payload.jti);
          }
          return Promise.resolve({ error: null });
        },
      };
    }
    return {
      select: () => ({
        eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
      }),
    };
  }
  const client = { from: vi.fn(from) };
  return {
    getServiceClient: vi.fn(() => client),
    getUserClient: vi.fn(() => client),
    getUserScopedClient: vi.fn(() => client),
  };
});

// Imported AFTER the mock so the routers wire up the mocked client.
const { deviceAuthRouter } = await import('../../src/routes/deviceAuth');
const { authRouter } = await import('../../src/routes/auth');
const { authenticateToken } = await import('../../src/middleware/auth');
const { errorHandler } = await import('../../src/middleware/errorHandler');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth/device', deviceAuthRouter);
  app.use('/api/auth', authRouter);
  // A protected probe route so we can assert a revoked token is rejected.
  app.get('/protected', authenticateToken, (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

async function mintGatewayToken(app: express.Express): Promise<string> {
  const res = await request(app)
    .post('/auth/device/token')
    .send({ device_code: '22222222-2222-4222-8222-222222222222' });
  expect(res.status).toBe(200);
  return res.body.access_token as string;
}

describe('P1-GW-REVOKE: gateway tokens carry jti and can be revoked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.revokedJtis = new Set<string>();
    state.lastRevokeInsert = null;
    state.deviceRecord = {
      device_id: '22222222-2222-4222-8222-222222222222',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      status: 'approved',
      user_id: 'user-revoke-1',
      user_email: 'revoke@example.com',
    };
  });

  it('mints a token that carries a non-empty jti claim', async () => {
    const app = createApp();
    const token = await mintGatewayToken(app);

    const decoded = jwt.decode(token) as jwt.JwtPayload;
    expect(typeof decoded.jti).toBe('string');
    expect((decoded.jti as string).length).toBeGreaterThan(0);
  });

  it('logout records the revocation in revoked_jwts keyed by the token jti', async () => {
    const app = createApp();
    const token = await mintGatewayToken(app);
    const decoded = jwt.decode(token) as jwt.JwtPayload;

    const res = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, revoked: true });
    expect(state.lastRevokeInsert).toMatchObject({
      jti: decoded.jti,
      user_id: 'user-revoke-1',
      reason: 'sign_out',
    });
    expect(state.revokedJtis.has(decoded.jti as string)).toBe(true);
  });

  it('rejects a subsequent request made with the revoked token (401)', async () => {
    const app = createApp();
    const token = await mintGatewayToken(app);

    // A request before logout passes the protected route.
    const before = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);

    // Logout revokes the token (and evicts the positive cache entry).
    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.body.revoked).toBe(true);

    // The same token is now rejected — revocation is live, not dead code.
    const after = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
    expect(after.body).toMatchObject({ error: 'Token revoked', code: 'TOKEN_REVOKED' });
  });
});
