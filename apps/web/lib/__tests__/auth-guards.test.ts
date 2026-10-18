import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import { AppError, ErrorCode } from '@agiworkforce/utils';

vi.mock('server-only', () => ({}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../api-auth', () => ({
  getClerkAuthUser: vi.fn(),
  assertAccountActive: vi.fn(),
}));

const mockGetUser = vi.fn();
vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal()),
  getIdentityUser: (...args: unknown[]) => mockGetUser(...args),
}));

import { requirePlatformAdmin } from '../auth-guards';
import { assertAccountActive, getClerkAuthUser } from '../api-auth';
import { logger } from '../logger';
import { PLATFORM_ADMIN_ENV_VAR } from '@/features/admin/lib/platform-admin-access';

const mockedGetClerkAuthUser = vi.mocked(getClerkAuthUser);
const mockedAssertAccountActive = vi.mocked(assertAccountActive);
const mockedLoggerError = vi.mocked(logger.error);

interface AuthResult {
  userId: string;
  email?: string;
  surfaceClass?: 'developer';
}

function makeAuthResult(userId = 'user_1'): AuthResult {
  return { userId, email: 'test@example.com' };
}

function makeIdentityUser(role?: string) {
  return {
    id: 'user_1',
    primaryEmail: null,
    primaryEmailVerification: 'unknown' as const,
    emails: [],
    firstName: null,
    lastName: null,
    fullName: null,
    username: null,
    imageUrl: null,
    publicMetadata: role ? { role } : {},
    privateMetadata: {},
    banned: false,
    locked: false,
    twoFactorEnabled: false,
    createdAt: null,
    lastSignInAt: null,
    enterpriseAccounts: [],
  };
}

function makeReq(): NextRequest {
  return {} as unknown as NextRequest;
}

beforeEach(() => {
  mockedGetClerkAuthUser.mockReset();
  mockedAssertAccountActive.mockReset();
  mockedAssertAccountActive.mockResolvedValue(undefined);
  mockGetUser.mockReset();
  mockedLoggerError.mockClear();
});

describe('requirePlatformAdmin', () => {
  const original = process.env[PLATFORM_ADMIN_ENV_VAR];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[PLATFORM_ADMIN_ENV_VAR];
    } else {
      process.env[PLATFORM_ADMIN_ENV_VAR] = original;
    }
  });

  it('propagates 401 when getClerkAuthUser throws', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'user_1';
    mockedGetClerkAuthUser.mockRejectedValueOnce(
      new AppError(ErrorCode.UNAUTHORIZED, 'unauth', 401),
    );
    const err = await requirePlatformAdmin(makeReq()).catch((e: unknown) => e);
    expect((err as AppError).statusCode).toBe(401);
  });

  it('returns authResult for an allowlisted user id', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'user_0, user_1 ,';
    const authResult = makeAuthResult();
    mockedGetClerkAuthUser.mockResolvedValueOnce(authResult);
    await expect(requirePlatformAdmin(makeReq())).resolves.toEqual(authResult);
    expect(mockedAssertAccountActive).toHaveBeenCalledWith('user_1');
  });

  it('throws 404 for an org admin/owner who is not on the allowlist', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'user_operator';
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());
    mockGetUser.mockResolvedValue(makeIdentityUser('owner'));
    const err = await requirePlatformAdmin(makeReq()).catch((e: unknown) => e);
    expect((err as AppError).statusCode).toBe(404);
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockedAssertAccountActive).not.toHaveBeenCalled();
  });

  it('throws 404 for everyone when the allowlist is unset', async () => {
    delete process.env[PLATFORM_ADMIN_ENV_VAR];
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());
    const err = await requirePlatformAdmin(makeReq()).catch((e: unknown) => e);
    expect((err as AppError).statusCode).toBe(404);
  });

  it('throws 404 for everyone when the allowlist is only separators', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = ' , , ';
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());
    const err = await requirePlatformAdmin(makeReq()).catch((e: unknown) => e);
    expect((err as AppError).statusCode).toBe(404);
  });

  it.each([[undefined], [' , , ']])(
    'logs that the deployment closed the surface when the allowlist is %s',
    async (raw) => {
      if (raw === undefined) {
        delete process.env[PLATFORM_ADMIN_ENV_VAR];
      } else {
        process.env[PLATFORM_ADMIN_ENV_VAR] = raw;
      }
      mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());

      await requirePlatformAdmin(makeReq()).catch(() => undefined);

      expect(mockedLoggerError).toHaveBeenCalledWith(
        { envVar: PLATFORM_ADMIN_ENV_VAR },
        expect.stringContaining('allowlist is unset'),
      );
    },
  );

  it('stays quiet when the allowlist is configured', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'user_1';
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());

    await requirePlatformAdmin(makeReq());

    expect(mockedLoggerError).not.toHaveBeenCalled();
  });

  it('throws 404 for a desktop device token even when its user id is allowlisted', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'user_1';
    mockedGetClerkAuthUser.mockResolvedValueOnce({
      ...makeAuthResult(),
      surfaceClass: 'developer',
    });

    const err = await requirePlatformAdmin(makeReq()).catch((e: unknown) => e);

    expect((err as AppError).statusCode).toBe(404);
    expect(mockedAssertAccountActive).not.toHaveBeenCalled();
  });

  it('propagates the suspended-account 403 for an allowlisted operator', async () => {
    process.env[PLATFORM_ADMIN_ENV_VAR] = 'user_1';
    mockedGetClerkAuthUser.mockResolvedValueOnce(makeAuthResult());
    mockedAssertAccountActive.mockRejectedValueOnce(
      new AppError(ErrorCode.FORBIDDEN, 'suspended', 403),
    );
    const err = await requirePlatformAdmin(makeReq()).catch((e: unknown) => e);
    expect((err as AppError).statusCode).toBe(403);
  });
});
