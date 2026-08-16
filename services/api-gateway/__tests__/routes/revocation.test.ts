import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const { state } = vi.hoisted(() => ({
  state: {
    deviceRecord: {
      device_id: '22222222-2222-4222-8222-222222222222',
      expires_at: new Date(Date.now() + 600_000).toISOString(),
      status: 'approved',
      user_id: 'user-revoke-1',
      user_email: 'revoke@example.com',
    } as Record<string, unknown>,
    revokedJtis: new Set<string>(),
    lastRevokeInsert: null as Record<string, unknown> | null,
  },
}));

vi.mock('../../src/lib/neonClients', () => {
  function from(table: string) {
    if (table === 'device_authorization_codes') {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: state.deviceRecord, error: null }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    if (table === 'profiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { id: 'user-revoke-1', email: 'revoke@example.com' },
                error: null,
              }),
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
    getSystemClient: vi.fn(() => client),
    getUserClient: vi.fn(() => client),
    getUserScopedClient: vi.fn(() => client),
  };
});

const { deviceAuthRouter } = await import('../../src/routes/deviceAuth');
const { authRouter } = await import('../../src/routes/auth');
const { authenticateToken } = await import('../../src/middleware/auth');
const { createRateLimiter } = await import('../../src/middleware/rateLimit');
const { errorHandler } = await import('../../src/middleware/errorHandler');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth/device', deviceAuthRouter);
  app.use('/api/auth', authRouter);
  app.get('/protected', createRateLimiter('default'), authenticateToken, (_req, res) => {
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

    const before = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(before.status).toBe(200);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.body.revoked).toBe(true);

    const after = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
    expect(after.body).toMatchObject({ error: 'Token revoked', code: 'TOKEN_REVOKED' });
  });
});
