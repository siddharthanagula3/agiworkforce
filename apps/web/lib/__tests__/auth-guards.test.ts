import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

import { AppError, ErrorCode } from '@agiworkforce/utils';

vi.mock('../api-auth', () => ({
  getAuthenticatedUser: vi.fn(),
}));

import { requireAdmin, requireRole } from '../auth-guards';
import { getAuthenticatedUser } from '../api-auth';

const mockedGetUser = vi.mocked(getAuthenticatedUser);

function makeUser(role?: string): User {
  return {
    id: 'u_1',
    aud: 'authenticated',
    email: 'test@example.com',
    app_metadata: role ? { role } : {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  } as unknown as User;
}

function makeReq(): NextRequest {
  return {} as unknown as NextRequest;
}

beforeEach(() => {
  mockedGetUser.mockReset();
});

describe('requireAdmin', () => {
  it('propagates 401 when getAuthenticatedUser throws', async () => {
    mockedGetUser.mockRejectedValueOnce(new AppError(ErrorCode.UNAUTHORIZED, 'unauth', 401));
    const err = await requireAdmin(makeReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(401);
  });

  it('throws 403 when user has no role at all', async () => {
    mockedGetUser.mockResolvedValueOnce(makeUser());
    const err = await requireAdmin(makeReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it('throws 403 when role is "user"', async () => {
    mockedGetUser.mockResolvedValueOnce(makeUser('user'));
    const err = await requireAdmin(makeReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it('returns user when role is "admin"', async () => {
    const u = makeUser('admin');
    mockedGetUser.mockResolvedValueOnce(u);
    await expect(requireAdmin(makeReq())).resolves.toBe(u);
  });

  it('returns user when role is "owner" (admin-equivalent)', async () => {
    const u = makeUser('owner');
    mockedGetUser.mockResolvedValueOnce(u);
    await expect(requireAdmin(makeReq())).resolves.toBe(u);
  });

  it('treats non-string role as missing role (defense against tampering)', async () => {
    const u = {
      ...makeUser(),
      app_metadata: { role: 42 },
    } as unknown as User;
    mockedGetUser.mockResolvedValueOnce(u);
    const err = await requireAdmin(makeReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });
});

describe('requireRole', () => {
  it('admin role accepted for "admin"', async () => {
    const u = makeUser('admin');
    mockedGetUser.mockResolvedValueOnce(u);
    await expect(requireRole(makeReq(), 'admin')).resolves.toBe(u);
  });

  it('owner role accepted in place of "admin"', async () => {
    const u = makeUser('owner');
    mockedGetUser.mockResolvedValueOnce(u);
    await expect(requireRole(makeReq(), 'admin')).resolves.toBe(u);
  });

  it('exact match required for non-admin roles', async () => {
    const u = makeUser('editor');
    mockedGetUser.mockResolvedValueOnce(u);
    await expect(requireRole(makeReq(), 'editor')).resolves.toBe(u);
  });

  it('rejects mismatched role with 403', async () => {
    const u = makeUser('viewer');
    mockedGetUser.mockResolvedValueOnce(u);
    const err = await requireRole(makeReq(), 'editor').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it('owner is not accepted for non-admin role requests (strict match)', async () => {
    const u = makeUser('owner');
    mockedGetUser.mockResolvedValueOnce(u);
    const err = await requireRole(makeReq(), 'editor').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
  });

  it('propagates 401 from upstream auth helper', async () => {
    mockedGetUser.mockRejectedValueOnce(new AppError(ErrorCode.UNAUTHORIZED, 'no token', 401));
    const err = await requireRole(makeReq(), 'admin').catch((e: unknown) => e);
    expect((err as AppError).statusCode).toBe(401);
  });
});
