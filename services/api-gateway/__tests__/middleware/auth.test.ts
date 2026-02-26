/**
 * Auth Middleware Tests
 *
 * Tests for JWT authentication middleware
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../../src/middleware/auth';

// JWT options matching the middleware's verification requirements
const JWT_SIGN_OPTIONS = {
  issuer: 'agiworkforce-api-gateway',
  audience: 'agiworkforce',
};

// Mock Supabase client for kill switch checks
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: { account_status: 'active' },
            error: null,
          }),
        })),
      })),
    })),
  },
}));

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

    // With proper Bearer parsing, a missing/malformed prefix means no token is extracted
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

  it('should handle malformed Zod payload in JWT', async () => {
    // Create a token with invalid payload structure
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
    const { supabase } = await import('../../src/lib/supabase');
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { account_status: 'suspended' },
            error: null,
          }),
        }),
      }),
    } as never);

    // Use a unique userId so the in-memory cache from other tests doesn't interfere
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
    const { supabase } = await import('../../src/lib/supabase');
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { account_status: 'banned' },
            error: null,
          }),
        }),
      }),
    } as never);

    // Use a unique userId so the in-memory cache from other tests doesn't interfere
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

  it('should return 503 when Supabase is unavailable and account has no cached status (fail closed)', async () => {
    const { supabase } = await import('../../src/lib/supabase');
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('Supabase connection failed');
    });

    // Use a unique userId so the in-memory cache from other tests doesn't interfere
    const validToken = jwt.sign(
      { userId: 'user-no-cache', email: 'nocache@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h', ...JWT_SIGN_OPTIONS },
    );
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    await authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    // Must fail closed — never allow unauthenticated/unknown accounts through
    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'Service temporarily unavailable. Please try again shortly.',
      code: 'AUTH_CHECK_UNAVAILABLE',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 403 for JWT signed without required issuer/audience', async () => {
    // Token signed without issuer/audience should fail verification
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
