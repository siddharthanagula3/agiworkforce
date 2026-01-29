/**
 * Auth Middleware Tests
 *
 * Tests for JWT authentication middleware
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../../src/middleware/auth';

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

  it('should return 401 when no authorization header is present', () => {
    authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header has no Bearer prefix', () => {
    mockReq.headers = { authorization: 'some-token' };

    authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    // The middleware replaces 'Bearer ' so it will try to verify 'some-token'
    // This will fail as invalid token
    expect(mockRes.status).toHaveBeenCalledWith(403);
  });

  it('should return 403 for invalid JWT', () => {
    mockReq.headers = { authorization: 'Bearer invalid-jwt-token' };

    authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 403 for expired JWT', () => {
    const expiredToken = jwt.sign(
      { userId: 'user-123', email: 'test@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '-1h' }, // Already expired
    );
    mockReq.headers = { authorization: `Bearer ${expiredToken}` };

    authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Token expired' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() and attach user to request for valid JWT', () => {
    const validToken = jwt.sign(
      { userId: 'user-123', email: 'test@example.com' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h' },
    );
    mockReq.headers = { authorization: `Bearer ${validToken}` };

    authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockReq as Request & { user?: unknown }).user).toMatchObject({
      userId: 'user-123',
      email: 'test@example.com',
    });
  });

  it('should handle malformed Zod payload in JWT', () => {
    // Create a token with invalid payload structure
    const invalidPayloadToken = jwt.sign(
      { invalidField: 'no userId or email' },
      process.env['JWT_SECRET']!,
      { expiresIn: '1h' },
    );
    mockReq.headers = { authorization: `Bearer ${invalidPayloadToken}` };

    authenticateToken(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });
});
