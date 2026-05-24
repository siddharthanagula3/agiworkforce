import { describe, expect, it, vi } from 'vitest';
import { ClerkAuthAdapter } from '../adapters/clerk';
import { NotImplementedError } from '../types';

describe('ClerkAuthAdapter', () => {
  it('normalizes verified Clerk session claims', async () => {
    const verifyToken = vi.fn().mockResolvedValue({
      sub: 'user_123',
      email: 'founder@example.com',
      sid: 'sess_123',
    });

    const auth = new ClerkAuthAdapter({
      jwtKey: 'test-jwt-key',
      authorizedParties: ['http://localhost:3000'],
      verifyToken,
    });

    await expect(auth.verifyJwt('session.jwt')).resolves.toEqual({
      userId: 'user_123',
      email: 'founder@example.com',
      raw: {
        sub: 'user_123',
        email: 'founder@example.com',
        sid: 'sess_123',
      },
    });
    expect(verifyToken).toHaveBeenCalledWith('session.jwt', {
      jwtKey: 'test-jwt-key',
      authorizedParties: ['http://localhost:3000'],
    });
  });

  it('returns null for invalid tokens and malformed claims', async () => {
    const invalid = new ClerkAuthAdapter({
      jwtKey: 'test-jwt-key',
      verifyToken: vi.fn().mockRejectedValue(new Error('bad token')),
    });
    await expect(invalid.verifyJwt('bad.jwt')).resolves.toBeNull();

    const malformed = new ClerkAuthAdapter({
      jwtKey: 'test-jwt-key',
      verifyToken: vi.fn().mockResolvedValue({ sid: 'sess_123' }),
    });
    await expect(malformed.verifyJwt('missing-sub.jwt')).resolves.toBeNull();
  });

  it('requires a Clerk verification key unless a test verifier is injected', () => {
    expect(() => new ClerkAuthAdapter({})).toThrow('Clerk auth adapter requires CLERK_JWT_KEY');
  });

  it('does not fake refresh-token support', async () => {
    const auth = new ClerkAuthAdapter({
      jwtKey: 'test-jwt-key',
      verifyToken: vi.fn(),
    });

    await expect(auth.refreshToken('refresh-token')).rejects.toBeInstanceOf(NotImplementedError);
  });
});
