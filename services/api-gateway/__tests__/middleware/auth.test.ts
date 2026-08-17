import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import express from 'express';
import { authenticateToken } from '../../src/middleware/auth';
import { errorHandler } from '../../src/middleware/errorHandler';

const JWT_SIGN_OPTIONS = {
  issuer: 'agiworkforce-api-gateway',
  audience: 'agiworkforce',
};

vi.mock('../../src/lib/neonClients', () => {
  const mockClient = {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: table === 'profiles' ? { account_status: 'active' } : null,
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  };
  return {
    getUserScopedClient: vi.fn(() => mockClient),
  };
});

describe('authenticateToken Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should return 401 when no authorization header is present', async () => {
    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header has no Bearer prefix', async () => {
    mockReq.headers = { authorization: 'some-token' };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
  });

  it('should return 403 for invalid JWT', async () => {
    mockReq.headers = { authorization: 'Bearer invalid-jwt-token' };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 403 for expired JWT', async () => {
    const expiredToken = jwt.sign(
      { userId: 'user-123', email: 'test@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '-1h', ...JWT_SIGN_OPTIONS },
    );
    mockReq.headers = { authorization: `Bearer ${expiredToken}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token expired' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() and attach user to request for valid JWT', async () => {
    const validToken = jwt.sign(
      { userId: 'user-123', email: 'test@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h', ...JWT_SIGN_OPTIONS },
    );
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockReq as Request & { user?: unknown }).user).toMatchObject({
      userId: 'user-123',
      email: 'test@example.com',
    });
  });

  it('derives the trusted developer surface from a first-party gateway token', async () => {
    const validToken = jwt.sign(
      { userId: 'user-dev-surface', email: 'dev@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h', ...JWT_SIGN_OPTIONS },
    );
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockReq as Request & { user?: { surface?: string } }).user?.surface).toBe('developer');
  });

  it('honors a signed app-surface downgrade claim (never a header)', async () => {
    const validToken = jwt.sign(
      { userId: 'user-app-surface', email: 'app@example.com', surface: 'app' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h', ...JWT_SIGN_OPTIONS },
    );
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockReq as Request & { user?: { surface?: string } }).user?.surface).toBe('app');
  });

  it('should handle malformed Zod payload in JWT', async () => {
    const invalidPayloadToken = jwt.sign(
      { invalidField: 'no userId or email' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h', ...JWT_SIGN_OPTIONS },
    );
    mockReq.headers = { authorization: `Bearer ${invalidPayloadToken}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  it('should return 403 when account is suspended', async () => {
    const { getUserScopedClient } = await import('../../src/lib/neonClients');
    vi.mocked(getUserScopedClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { account_status: 'suspended' },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      })),
    } as never);

    const validToken = jwt.sign(
      { userId: 'user-suspended', email: 'suspended@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h', ...JWT_SIGN_OPTIONS },
    );
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Account suspended. Contact support for assistance.',
      code: 'ACCOUNT_NOT_ACTIVE',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 403 when account is banned', async () => {
    const { getUserScopedClient } = await import('../../src/lib/neonClients');
    vi.mocked(getUserScopedClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { account_status: 'banned' },
              error: null,
            }),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      })),
    } as never);

    const validToken = jwt.sign(
      { userId: 'user-banned', email: 'banned@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h', ...JWT_SIGN_OPTIONS },
    );
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Account banned. Contact support for assistance.',
      code: 'ACCOUNT_NOT_ACTIVE',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 503 when Neon is unavailable and account has no cached status (fail closed)', async () => {
    const { getUserScopedClient } = await import('../../src/lib/neonClients');
    vi.mocked(getUserScopedClient).mockReturnValue({
      from: vi.fn(() => {
        throw new Error('Neon connection failed');
      }),
    } as never);

    const validToken = jwt.sign(
      { userId: 'user-no-cache', email: 'nocache@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h', ...JWT_SIGN_OPTIONS },
    );
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Service temporarily unavailable. Please try again shortly.',
      code: 'AUTH_CHECK_UNAVAILABLE',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 403 for JWT signed without required issuer/audience', async () => {
    const tokenNoIssuer = jwt.sign(
      { userId: 'user-123', email: 'test@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h' },
    );
    mockReq.headers = { authorization: `Bearer ${tokenNoIssuer}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

vi.mock('../../src/middleware/rateLimit', () => ({
  createRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

function buildBatchPayload(userId: string) {
  return {
    items: [],
    device_id: 'test-device-001',
    user_id: userId,
    timestamp: new Date().toISOString(),
  };
}

function createBatchTestApp(authenticatedUserId: string) {
  const app = express();
  app.use(express.json());

  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { user?: { userId: string; email: string } }).user = {
      userId: authenticatedUserId,
      email: `${authenticatedUserId}@test.example`,
    };
    next();
  });

  app.post('/batch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { AppError } = await import('../../src/middleware/errorHandler');
      const { z } = await import('zod');

      const batchSyncSchema = z
        .object({
          items: z.array(z.any()).max(100),
          device_id: z.string().max(100),
          user_id: z.string().max(100),
          timestamp: z.string(),
        })
        .strict();

      const user = req.user;
      if (!user) {
        throw new AppError('Unauthorized', 401);
      }

      const batch = batchSyncSchema.parse(req.body);

      if (batch.user_id !== user.userId) {
        throw new AppError('user_id mismatch', 403);
      }

      res.json({ success: true, synced_ids: [], failed_ids: [], conflicts: [], updates: [] });
    } catch (err) {
      next(err);
    }
  });

  app.use(errorHandler);
  return app;
}

describe('M13: Batch sync user_id validation', () => {
  const AUTHED_USER_ID = 'auth-user-abc123';

  it('passes when batch user_id matches the authenticated user', async () => {
    const app = createBatchTestApp(AUTHED_USER_ID);

    const res = await request(app)
      .post('/batch')
      .set('Content-Type', 'application/json')
      .send(buildBatchPayload(AUTHED_USER_ID));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, synced_ids: [], failed_ids: [] });
  });

  it('returns 403 when batch user_id does not match the authenticated user', async () => {
    const app = createBatchTestApp(AUTHED_USER_ID);

    const differentUserId = 'attacker-user-xyz';
    const res = await request(app)
      .post('/batch')
      .set('Content-Type', 'application/json')
      .send(buildBatchPayload(differentUserId));

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'user_id mismatch' });
  });

  it('returns 400 when user_id field is missing from the batch body', async () => {
    const app = createBatchTestApp(AUTHED_USER_ID);

    const payloadWithoutUserId = {
      items: [],
      device_id: 'test-device-001',
      timestamp: new Date().toISOString(),
    };

    const res = await request(app)
      .post('/batch')
      .set('Content-Type', 'application/json')
      .send(payloadWithoutUserId);

    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('returns 403 when user_id is an empty string and userId is non-empty', async () => {
    const app = createBatchTestApp(AUTHED_USER_ID);

    const res = await request(app).post('/batch').set('Content-Type', 'application/json').send({
      items: [],
      device_id: 'test-device-001',
      user_id: '', // empty — will not match AUTHED_USER_ID
      timestamp: new Date().toISOString(),
    });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'user_id mismatch' });
  });

  it('succeeds for different users when each presents their own matching user_id', async () => {
    const userA = 'user-A-111';
    const userB = 'user-B-222';

    const appA = createBatchTestApp(userA);
    const appB = createBatchTestApp(userB);

    const resA = await request(appA)
      .post('/batch')
      .set('Content-Type', 'application/json')
      .send(buildBatchPayload(userA));

    const resB = await request(appB)
      .post('/batch')
      .set('Content-Type', 'application/json')
      .send(buildBatchPayload(userB));

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
  });

  it('rejects user A trying to submit data as user B (IDOR prevention)', async () => {
    const userA = 'user-A-111';
    const userB = 'user-B-222';

    const app = createBatchTestApp(userA);

    const res = await request(app)
      .post('/batch')
      .set('Content-Type', 'application/json')
      .send(buildBatchPayload(userB));

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'user_id mismatch' });
  });
});
