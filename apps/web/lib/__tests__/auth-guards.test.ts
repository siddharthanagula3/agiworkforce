import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import { AppError, ErrorCode } from '@agiworkforce/utils';

vi.mock('server-only', () => ({}));

vi.mock('../api-auth', () => ({
  getClerkAuthUser: vi.fn(),
}));

const mockGetUser = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: async () => ({
    users: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  }),
}));

import { requireAdmin, requireRole } from '../auth-guards';
import { getClerkAuthUser } from '../api-auth';

const mockedGetClerkAuthUser = vi.mocked(getClerkAuthUser);

interface AuthResult {
  userId: string;
  email?: string;
}

function makeAuthResult(userId = 'user_1'): AuthResult {
  return { userId, email: 'test@example.com' };
}

function makeClerkUser(role?: string) {
  return {
    id: 'user_1',
    publicMetadata: role ? { role } : {},
  };
}

function makeReq(): NextRequest {
  return {} as unknown as NextRequest;
}

beforeEach(() => {
  mockedGetClerkAuthUser.mockReset();
  mockGetUser.mockReset();
});

describe('requireAdmin', () => {
  it('propagates 401 when getClerkAuthUser throws', async () => {
    mockedGetClerkAuthUser.mockRejectedValueOnce(
      new AppError(ErrorCode.UNAUTHORIZED, 'unauth', 401),
    );
    const err = await requireAdmin(makeReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(401);
  });

  it('throws 403 when user has no role at all', async () => {
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());
    mockGetUser.mockResolvedValueOnce(makeClerkUser());
    const err = await requireAdmin(makeReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it('throws 403 when role is "user"', async () => {
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());
    mockGetUser.mockResolvedValueOnce(makeClerkUser('user'));
    const err = await requireAdmin(makeReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it('returns authResult when role is "admin"', async () => {
    const authResult = makeAuthResult();
    mockedGetClerkAuthUser.mockResolvedValueOnce(authResult);
    mockGetUser.mockResolvedValueOnce(makeClerkUser('admin'));
    await expect(requireAdmin(makeReq())).resolves.toEqual(authResult);
  });

  it('returns authResult when role is "owner" (admin-equivalent)', async () => {
    const authResult = makeAuthResult();
    mockedGetClerkAuthUser.mockResolvedValueOnce(authResult);
    mockGetUser.mockResolvedValueOnce(makeClerkUser('owner'));
    await expect(requireAdmin(makeReq())).resolves.toEqual(authResult);
  });

  it('treats non-string role as missing role (defense against tampering)', async () => {
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());
    mockGetUser.mockResolvedValueOnce({ id: 'user_1', publicMetadata: { role: 42 } });
    const err = await requireAdmin(makeReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });
});

describe('requireRole', () => {
  it('admin role accepted for "admin"', async () => {
    const authResult = makeAuthResult();
    mockedGetClerkAuthUser.mockResolvedValueOnce(authResult);
    mockGetUser.mockResolvedValueOnce(makeClerkUser('admin'));
    await expect(requireRole(makeReq(), 'admin')).resolves.toEqual(authResult);
  });

  it('owner role accepted in place of "admin"', async () => {
    const authResult = makeAuthResult();
    mockedGetClerkAuthUser.mockResolvedValueOnce(authResult);
    mockGetUser.mockResolvedValueOnce(makeClerkUser('owner'));
    await expect(requireRole(makeReq(), 'admin')).resolves.toEqual(authResult);
  });

  it('exact match required for non-admin roles', async () => {
    const authResult = makeAuthResult();
    mockedGetClerkAuthUser.mockResolvedValueOnce(authResult);
    mockGetUser.mockResolvedValueOnce(makeClerkUser('editor'));
    await expect(requireRole(makeReq(), 'editor')).resolves.toEqual(authResult);
  });

  it('rejects mismatched role with 403', async () => {
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());
    mockGetUser.mockResolvedValueOnce(makeClerkUser('viewer'));
    const err = await requireRole(makeReq(), 'editor').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it('owner is not accepted for non-admin role requests (strict match)', async () => {
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());
    mockGetUser.mockResolvedValueOnce(makeClerkUser('owner'));
    const err = await requireRole(makeReq(), 'editor').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it('propagates 401 from upstream auth helper', async () => {
    mockedGetClerkAuthUser.mockRejectedValueOnce(
      new AppError(ErrorCode.UNAUTHORIZED, 'no token', 401),
    );
    const err = await requireRole(makeReq(), 'admin').catch((e: unknown) => e);
    expect((err as AppError).statusCode).toBe(401);
  });
});
