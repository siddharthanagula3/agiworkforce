import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { deviceAuthRouter } from '../../src/routes/deviceAuth';
import { errorHandler } from '../../src/middleware/errorHandler';

const neonMock = vi.hoisted(() => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  // POST /token (below) reads this to simulate an approved/pending/expired
  // device_authorization_codes row without a real DB.
  const state = {
    deviceRecord: null as Record<string, unknown> | null,
  };
  const from = vi.fn((table: string) => {
    if (table === 'device_authorization_codes') {
      return {
        insert,
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                state.deviceRecord
                  ? { data: state.deviceRecord, error: null }
                  : { data: null, error: { message: 'not found' } },
              ),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      };
    }
    if (table === 'profiles') {
      // /token's best-effort profile-email enrichment lookup.
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      };
    }
    return { insert };
  });
  return { from, insert, state };
});

// routes/deviceAuth.ts uses the explicit system client because the device-code
// bootstrap flow starts before the CLI has a cloud account token.
vi.mock('../../src/lib/neonClients', () => {
  const mockClient = {
    from: neonMock.from,
  };
  return {
    getSystemClient: vi.fn(() => mockClient),
    getUserClient: vi.fn(() => mockClient),
    getUserScopedClient: vi.fn(() => mockClient),
  };
});

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth/device', deviceAuthRouter);
  app.use('/api/auth/device', deviceAuthRouter);
  app.use(errorHandler);
  return app;
}

describe('Device auth route mounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    neonMock.insert.mockResolvedValue({ error: null });
    neonMock.state.deviceRecord = null;
  });

  it('serves device code flow on the CLI-compatible /auth/device path', async () => {
    const response = await request(createTestApp()).post('/auth/device/code').send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      verification_uri: 'https://agiworkforce.com/auth/device',
      interval: 5,
      expires_in: 900,
    });
    expect(response.body.user_code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(neonMock.from).toHaveBeenCalledWith('device_authorization_codes');
    expect(neonMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        device_id: response.body.device_code,
        device_type: 'cli',
        status: 'pending',
        user_code: response.body.user_code,
      }),
    );
  });

  it('also serves device code flow on the /api/auth/device compatibility path', async () => {
    const response = await request(createTestApp()).post('/api/auth/device/code').send({});

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('device_code');
  });
});

describe('POST /auth/device/token — issued access_token carries `sub`', () => {
  // P1-GW-RLS: NeonDatabaseAdapter.withUser() (packages/platform/data-layer) decodes
  // `sub` from the token to bind Postgres RLS — a gateway-issued token
  // without it would throw there. This is the regression guard for that fix.
  const DEVICE_CODE = '11111111-1111-4111-8111-111111111111';
  const USER_ID = 'user-xyz-789';

  beforeEach(() => {
    vi.clearAllMocks();
    neonMock.insert.mockResolvedValue({ error: null });
    neonMock.state.deviceRecord = {
      device_id: DEVICE_CODE,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      status: 'approved',
      user_id: USER_ID,
      user_email: 'device-user@example.com',
    };
  });

  it("mints an access_token whose `sub` claim equals the approved device record's user_id", async () => {
    const response = await request(createTestApp())
      .post('/auth/device/token')
      .send({ device_code: DEVICE_CODE });

    expect(response.status).toBe(200);
    expect(response.body.token_type).toBe('Bearer');

    const payload = jwt.decode(response.body.access_token) as Record<string, unknown> | null;
    expect(payload).not.toBeNull();
    expect(payload?.['userId']).toBe(USER_ID);
    // The regression this guards: getUserScopedClient's withUser(token) path
    // (lib/neonClients.ts) decodes `sub` from the raw token, independent of
    // whatever authenticateToken separately parsed — so `sub` must be present
    // AND equal the same user id, or RLS binding fails for every device-paired
    // session (it safely falls back to the service client, but the RLS
    // improvement is then inert for this token — see the fallback tests in
    // __tests__/lib/rlsTenantIsolation.test.ts).
    expect(payload?.['sub']).toBe(USER_ID);
  });
});
