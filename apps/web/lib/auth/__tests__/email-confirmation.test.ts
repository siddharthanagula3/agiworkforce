import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IdentityModule = typeof import('@/lib/server/identity');
type LoggerModule = typeof import('@/lib/logger');

vi.mock('server-only', () => ({}));

const { mockGetIdentityUser } = vi.hoisted(() => ({ mockGetIdentityUser: vi.fn() }));

vi.mock('@/lib/server/identity', async (importOriginal) => ({
  ...(await importOriginal<IdentityModule>()),
  getIdentityUser: (...args: unknown[]) => mockGetIdentityUser(...args),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { isAppError } from '@/lib/errors';
import {
  MISSING_REPLY_EMAIL_MESSAGE,
  UNCONFIRMED_EMAIL_MESSAGE,
  readPrimaryEmailState,
  requireReplyEmail,
} from '../email-confirmation';

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('readPrimaryEmailState', () => {
  beforeEach(() => {
    mockGetIdentityUser.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a verified primary email as confirmed', async () => {
    mockGetIdentityUser.mockResolvedValue({
      primaryEmail: 'person@example.com',
      primaryEmailVerification: 'verified',
    });

    await expect(readPrimaryEmailState('user_1')).resolves.toEqual({
      confirmed: true,
      email: 'person@example.com',
    });
  });

  it('fails the lookup with a retryable answer when the identity provider never replies', async () => {
    vi.useFakeTimers();
    mockGetIdentityUser.mockReturnValue(new Promise(() => {}));

    const pending = rejection(readPrimaryEmailState('user_1'));
    await vi.advanceTimersByTimeAsync(1_500);
    const error = await pending;

    expect(isAppError(error)).toBe(true);
    expect(error).toMatchObject({ statusCode: 503 });
    expect((error as Error).message).toContain('could not be checked');
  });

  it('answers the same way when the identity provider fails', async () => {
    mockGetIdentityUser.mockRejectedValue(new Error('provider 500'));

    const error = await rejection(readPrimaryEmailState('user_1'));

    expect(error).toMatchObject({ statusCode: 503 });
  });
});

describe('requireReplyEmail', () => {
  beforeEach(() => {
    mockGetIdentityUser.mockReset();
  });

  it('uses the email the token carries without a lookup', async () => {
    await expect(requireReplyEmail('user_1', 'token@example.com')).resolves.toBe(
      'token@example.com',
    );
    expect(mockGetIdentityUser).not.toHaveBeenCalled();
  });

  it('falls back to the verified primary email when the token has none', async () => {
    mockGetIdentityUser.mockResolvedValue({
      primaryEmail: 'phone@example.com',
      primaryEmailVerification: 'verified',
    });

    await expect(requireReplyEmail('user_1', undefined)).resolves.toBe('phone@example.com');
  });

  it.each([
    [
      'has no email',
      { primaryEmail: null, primaryEmailVerification: null },
      MISSING_REPLY_EMAIL_MESSAGE,
    ],
    [
      'has not confirmed it',
      { primaryEmail: 'new@example.com', primaryEmailVerification: 'unverified' },
      UNCONFIRMED_EMAIL_MESSAGE,
    ],
  ])('refuses when the account %s', async (_label, user, message) => {
    mockGetIdentityUser.mockResolvedValue(user);

    const error = await rejection(requireReplyEmail('user_1', null));

    expect(error).toMatchObject({ statusCode: 400, message });
  });
});
