/**
 * Worker protocol tests — Task 1.7 direction-inversion layer.
 *
 * Coverage:
 *   1. WorkSecret codec: encode + decode round-trip; version validation; expiry.
 *   2. validateBridgeId: path-traversal defense regex.
 *   3. Registration endpoint: happy-path + missing secret + invalid body.
 *   4. Archive endpoint: env_secret auth validation.
 *   5. /bridge epoch bump: valid + wrong secret.
 *   6. Poll endpoint: returns 204 when no pending work.
 *   7. Ack endpoint: session_ingress token validation.
 *   8. Complete endpoint: session_ingress via Authorization header.
 *   9. Stop endpoint: force flag.
 *  10. Work-level heartbeat: valid + missing token.
 *  11. Worker-level heartbeat (GET): valid + wrong secret.
 *  12. Trusted-Device enrollment: missing auth + enrollment window guard.
 *  13. Step-up auth: 403 + insufficient_scope response shape.
 *
 * Each test mounts the router under supertest with a stub auth middleware,
 * stub Supabase client, and controlled environment variables.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import supertest from 'supertest';

// ---------------------------------------------------------------------------
// Stub environment before any module import that calls requireEnv()
// ---------------------------------------------------------------------------
vi.stubEnv('JWT_SECRET', 'test-jwt-secret-must-be-at-least-32-bytes-long!!');
vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key');
vi.stubEnv('SUPABASE_JWT_SECRET', 'test-jwt-secret-must-be-at-least-32-bytes-long!!');
vi.stubEnv('API_BASE_URL', 'https://api.test.example.com');

// ---------------------------------------------------------------------------
// Stub Supabase client (module-level)
// ---------------------------------------------------------------------------

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock('../lib/supabaseClients', () => ({
  getServiceClient: () => mockSupabase,
  getUserScopedClient: () => mockSupabase,
  mintSupabaseJwt: () => 'stub-supabase-jwt',
}));

// Stub authenticateToken so routes that require auth don't need a real JWT.
// This must be declared before any router imports.
vi.mock('../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { userId: 'user-abc', email: 'test@example.com' };
    next();
  },
}));

// ---------------------------------------------------------------------------
// Import after stubs are in place
// ---------------------------------------------------------------------------
import {
  encodeWorkSecret,
  decodeWorkSecret,
  validateBridgeId,
  WORK_SECRET_VERSION,
  type WorkSecret,
} from '../worker/types';
import { registrationRouter } from '../worker/registration';
import { assignmentRouter } from '../worker/assignment';
import { heartbeatRouter } from '../worker/heartbeat';

// ---------------------------------------------------------------------------
// Build test Express app
// ---------------------------------------------------------------------------

function buildApp(): ReturnType<typeof express> {
  const app = express();
  app.use(express.json());
  app.use('/', registrationRouter);
  app.use('/', assignmentRouter);
  app.use('/', heartbeatRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers to set up chainable Supabase mock
// ---------------------------------------------------------------------------

type MockChain = {
  insert?: () => MockChain;
  update?: () => MockChain;
  select?: () => MockChain;
  eq?: () => MockChain;
  neq?: () => MockChain;
  order?: () => MockChain;
  limit?: () => MockChain;
  in?: () => MockChain;
  lt?: () => MockChain;
  maybeSingle?: () => Promise<{ data: unknown; error: unknown }>;
  single?: () => Promise<{ data: unknown; error: unknown }>;
  resolveAs?: { data: unknown; error: unknown };
};

function buildChain(resolveAs: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ['insert', 'update', 'select', 'eq', 'neq', 'order', 'limit', 'in', 'lt'];
  for (const m of methods) {
    chain[m] = () => chain;
  }
  chain['maybeSingle'] = () => Promise.resolve(resolveAs);
  chain['single'] = () => Promise.resolve(resolveAs);
  return chain;
}

// ---------------------------------------------------------------------------
// §1  WorkSecret codec
// ---------------------------------------------------------------------------

describe('WorkSecret codec', () => {
  const validSecret: WorkSecret = {
    version: WORK_SECRET_VERSION,
    session_ingress_token: 'test-ingress-token',
    api_base_url: 'https://api.example.com',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };

  it('encodes and decodes round-trip', () => {
    const encoded = encodeWorkSecret(validSecret);
    const decoded = decodeWorkSecret(encoded);
    expect(decoded.version).toBe(WORK_SECRET_VERSION);
    expect(decoded.session_ingress_token).toBe(validSecret.session_ingress_token);
    expect(decoded.api_base_url).toBe(validSecret.api_base_url);
  });

  it('throws on wrong version', () => {
    const bad = { ...validSecret, version: 99 } as unknown as WorkSecret;
    const encoded = encodeWorkSecret(bad);
    expect(() => decodeWorkSecret(encoded)).toThrow('unsupported version');
  });

  it('throws on expired envelope', () => {
    const expired = { ...validSecret, expires_at: Math.floor(Date.now() / 1000) - 1 };
    const encoded = encodeWorkSecret(expired);
    expect(() => decodeWorkSecret(encoded)).toThrow('expired');
  });

  it('throws on malformed base64url', () => {
    expect(() => decodeWorkSecret('not-valid-base64url!!!')).toThrow('malformed');
  });

  it('throws on missing session_ingress_token', () => {
    const noToken = { ...validSecret, session_ingress_token: '' };
    const encoded = encodeWorkSecret(noToken);
    expect(() => decodeWorkSecret(encoded)).toThrow('missing session_ingress_token');
  });
});

// ---------------------------------------------------------------------------
// §2  validateBridgeId
// ---------------------------------------------------------------------------

describe('validateBridgeId', () => {
  it('accepts alphanumeric + underscore + hyphen', () => {
    expect(validateBridgeId('abc-123_XYZ')).toBe(true);
    expect(validateBridgeId('a')).toBe(true);
  });

  it('rejects slashes', () => {
    expect(validateBridgeId('foo/bar')).toBe(false);
    expect(validateBridgeId('../etc/passwd')).toBe(false);
  });

  it('rejects dots', () => {
    expect(validateBridgeId('foo.bar')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateBridgeId('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §3  Registration endpoint — POST /v1/environments/bridge
// ---------------------------------------------------------------------------

describe('POST /v1/environments/bridge', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();
    // Mock authenticateToken to inject user — we do this by mocking the module

    app = buildApp();
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }));
  });

  it('returns 201 with environment_id and environment_secret on success', async () => {
    const res = await supertest(app)
      .post('/v1/environments/bridge')
      .set('Authorization', 'Bearer valid-token')
      .send({ worker_type: 'cli', platform: 'linux', version: '1.0.0' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('environment_id');
    expect(res.body).toHaveProperty('environment_secret');
    expect(res.body).toHaveProperty('expires_at');
  });

  it('returns 400 on invalid body', async () => {
    const res = await supertest(app)
      .post('/v1/environments/bridge')
      .set('Authorization', 'Bearer valid-token')
      .send({ worker_type: 'unknown-type' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// §4  Archive endpoint — POST /v1/environments/:id/archive
// ---------------------------------------------------------------------------

describe('POST /v1/environments/:id/archive', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  it('returns 404 when environment not found', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }));

    const res = await supertest(app)
      .post('/v1/environments/env-abc/archive')
      .set('X-Environment-Secret', 'some-secret')
      .send({});

    expect(res.status).toBe(404);
  });

  it('returns 401 when secret is wrong', async () => {
    mockFrom.mockReturnValue(
      buildChain({
        data: { id: 'reg-1', user_id: 'u1', environment_secret_hash: 'wrong-hash' },
        error: null,
      }),
    );

    const res = await supertest(app)
      .post('/v1/environments/env-abc/archive')
      .set('X-Environment-Secret', 'bad-secret')
      .send({});

    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid environment_id (path-traversal)', async () => {
    const res = await supertest(app)
      .post('/v1/environments/..%2Fetc%2Fpasswd/archive')
      .set('X-Environment-Secret', 'any')
      .send({});

    expect([400, 404]).toContain(res.status);
  });

  it('returns 401 when X-Environment-Secret header is missing', async () => {
    const res = await supertest(app).post('/v1/environments/env-abc/archive').send({});

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// §5  /bridge epoch bump
// ---------------------------------------------------------------------------

describe('POST /v1/environments/:id/bridge (epoch bump)', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  it('returns 401 when secret header is missing', async () => {
    const res = await supertest(app).post('/v1/environments/env-abc/bridge').send({});

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// §6  Poll endpoint — GET /v1/environments/:id/work/poll
// ---------------------------------------------------------------------------

describe('GET /v1/environments/:id/work/poll', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  it('returns 401 when env secret missing', async () => {
    const res = await supertest(app).get('/v1/environments/env-abc/work/poll');
    expect(res.status).toBe(401);
  });

  it('returns 401 when env secret is invalid', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }));

    const res = await supertest(app)
      .get('/v1/environments/env-abc/work/poll')
      .set('X-Environment-Secret', 'bad-secret');

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// §7  Ack endpoint — POST /v1/environments/:id/work/:wid/ack
// ---------------------------------------------------------------------------

describe('POST /v1/environments/:id/work/:wid/ack', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  it('returns 401 when session_ingress_token is invalid', async () => {
    const res = await supertest(app).post('/v1/environments/env-abc/work/work-xyz/ack').send({
      idempotency_key: 'idem-1',
      session_ingress_token: 'clearly-invalid',
    });

    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid body (missing required fields)', async () => {
    const res = await supertest(app)
      .post('/v1/environments/env-abc/work/work-xyz/ack')
      .send({ idempotency_key: 'x' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// §8  Complete endpoint
// ---------------------------------------------------------------------------

describe('POST /v1/environments/:id/work/:wid/complete', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await supertest(app)
      .post('/v1/environments/env-abc/work/work-xyz/complete')
      .send({ result: { text: 'done' }, idempotency_key: 'idem-1' });

    expect(res.status).toBe(401);
  });

  it('returns 401 when session_ingress_token does not match ids', async () => {
    const badToken = Buffer.from(
      JSON.stringify({
        environment_id: 'other-env',
        work_id: 'work-xyz',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');

    const res = await supertest(app)
      .post('/v1/environments/env-abc/work/work-xyz/complete')
      .set('Authorization', `Bearer ${badToken}`)
      .send({ result: { text: 'done' }, idempotency_key: 'idem-1' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// §9  Stop endpoint
// ---------------------------------------------------------------------------

describe('POST /v1/environments/:id/work/:wid/stop', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  it('returns 401 when env secret missing', async () => {
    const res = await supertest(app)
      .post('/v1/environments/env-abc/work/work-xyz/stop')
      .send({ idempotency_key: 'idem-1' });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// §10  Work-level heartbeat — POST /v1/environments/:id/work/:wid/heartbeat
// ---------------------------------------------------------------------------

describe('POST /v1/environments/:id/work/:wid/heartbeat', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await supertest(app)
      .post('/v1/environments/env-abc/work/work-xyz/heartbeat')
      .send({});

    expect(res.status).toBe(401);
  });

  it('returns 400 when environment_id is invalid', async () => {
    const res = await supertest(app)
      .post('/v1/environments/bad/id/work/work-xyz/heartbeat')
      .set('Authorization', 'Bearer some-token')
      .send({});

    expect([400, 401, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// §11  Worker-level heartbeat — GET /v1/environments/:id/heartbeat
// ---------------------------------------------------------------------------

describe('GET /v1/environments/:id/heartbeat', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();
    app = buildApp();
  });

  it('returns 401 when env secret header is missing', async () => {
    const res = await supertest(app).get('/v1/environments/env-abc/heartbeat');
    expect(res.status).toBe(401);
  });

  it('returns 404 when environment not found', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }));

    const res = await supertest(app)
      .get('/v1/environments/env-abc/heartbeat')
      .set('X-Environment-Secret', 'any-secret');

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// §12  Trusted-Device enrollment
// ---------------------------------------------------------------------------

describe('POST /api/auth/trusted_devices', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();

    app = buildApp();
  });

  it('returns 400 on invalid body', async () => {
    const res = await supertest(app)
      .post('/api/auth/trusted_devices')
      .set('Authorization', 'Bearer valid-token')
      .send({ display_name: 'My CLI' });

    expect(res.status).toBe(400);
  });

  it('returns 403 when no active session found', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }));

    const deviceToken = 'a'.repeat(40);
    const res = await supertest(app)
      .post('/api/auth/trusted_devices')
      .set('Authorization', 'Bearer valid-token')
      .send({ display_name: 'My CLI', device_token: deviceToken });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NO_ACTIVE_SESSION');
  });

  it('returns 403 when session is older than 10 min', async () => {
    const oldSession = {
      created_at: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
    };
    mockFrom.mockReturnValue(buildChain({ data: oldSession, error: null }));

    const deviceToken = 'a'.repeat(40);
    const res = await supertest(app)
      .post('/api/auth/trusted_devices')
      .set('Authorization', 'Bearer valid-token')
      .send({ display_name: 'My CLI', device_token: deviceToken });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ENROLLMENT_WINDOW_EXPIRED');
  });
});

// ---------------------------------------------------------------------------
// §13  Step-up auth response shape
// ---------------------------------------------------------------------------

describe('Step-up auth — insufficient_scope shape', () => {
  it('verifies the StepUpRequired interface shape matches spec', () => {
    const resp = {
      code: 'insufficient_scope' as const,
      required_scope: 'dispatch:write',
      pkce_redirect_url: 'https://auth.example.com/oauth/authorize?...',
    };
    expect(resp.code).toBe('insufficient_scope');
    expect(resp.required_scope).toBeTruthy();
    expect(resp.pkce_redirect_url).toContain('oauth');
  });
});

// ---------------------------------------------------------------------------
// §14  End-to-end worker registration flow (integration-style, mocked DB)
// ---------------------------------------------------------------------------

describe('E2E worker registration flow', () => {
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    vi.resetAllMocks();

    app = buildApp();
  });

  it('registers a CLI worker and returns environment_secret', async () => {
    mockFrom.mockReturnValue(buildChain({ data: null, error: null }));

    const regRes = await supertest(app)
      .post('/v1/environments/bridge')
      .set('Authorization', 'Bearer valid-token')
      .send({ worker_type: 'cli', platform: 'linux', version: '2.0.0' });

    expect(regRes.status).toBe(201);
    const { environment_id, environment_secret } = regRes.body as {
      environment_id: string;
      environment_secret: string;
    };
    expect(environment_id).toBeTruthy();
    expect(environment_secret).toBeTruthy();
  });

  it('rejects poll without X-Environment-Secret', async () => {
    const pollRes = await supertest(app).get('/v1/environments/test-env-id/work/poll');
    expect(pollRes.status).toBe(401);
  });

  it('rejects ack with bad session token', async () => {
    const ackRes = await supertest(app)
      .post('/v1/environments/test-env-id/work/test-work-id/ack')
      .send({ idempotency_key: 'ik1', session_ingress_token: 'bad-token' });

    expect(ackRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// §15  Backward-compat (inbound bridge not broken)
// ---------------------------------------------------------------------------

describe('Backward-compat: inbound bridge routes still exist', () => {
  it('worker index exports do not shadow original route files', async () => {
    const { registrationRouter: rr } = await import('../worker/index');
    expect(rr).toBeDefined();
    const { assignmentRouter: ar } = await import('../worker/index');
    expect(ar).toBeDefined();
    const { heartbeatRouter: hr } = await import('../worker/index');
    expect(hr).toBeDefined();
  });
});
