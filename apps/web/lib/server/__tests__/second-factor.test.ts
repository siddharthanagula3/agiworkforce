import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { IdentityRequestRejectedError, type IdentityUser } from '@agiworkforce/identity';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  registerSecondFactor: vi.fn(),
  rememberEnrollment: vi.fn(),
  openSecret: vi.fn(),
  query: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/identity', () => ({
  getIdentityAuthorizedParties: vi.fn(),
  getIdentityUser: vi.fn(),
  getRequestIdentity: vi.fn(),
  verifyIdentitySessionToken: vi.fn(),
  getIdentityProvider: () => ({
    getUser: mocks.getUser,
    registerSecondFactor: mocks.registerSecondFactor,
  }),
}));
vi.mock('@/lib/mfa-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule0>()),
  rememberMfaEnrollment: mocks.rememberEnrollment,
}));
vi.mock('@/lib/crypto/totp-envelope', () => ({
  openTotpSecret: mocks.openSecret,
  sealTotpSecret: vi.fn(),
}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<ImportedModule1>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { readSecondFactorStatus, stepUpLevelFor } from '../step-up/second-factor';

const ACCOUNT = 'product-account-7';
const SUBJECT = 'native-subject-9';
const DB: DatabaseAdapter = {
  query: mocks.query,
  execute: vi.fn(),
  transaction: vi.fn(),
  withUser: vi.fn(),
  withOrg: vi.fn(),
  dispose: vi.fn(),
};

function user(
  enrolled = false,
): Pick<IdentityUser, 'id' | 'totpEnabled' | 'backupCodesEnabled' | 'twoFactorEnabled'> {
  return {
    id: SUBJECT,
    totpEnabled: enrolled,
    backupCodesEnabled: enrolled,
    twoFactorEnabled: enrolled,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue(user());
  mocks.query.mockResolvedValue([]);
  mocks.openSecret.mockReturnValue('fixture-decrypted-totp-secret');
  mocks.registerSecondFactor.mockResolvedValue(undefined);
  mocks.rememberEnrollment.mockResolvedValue(undefined);
});

describe('second factor lookup identity', () => {
  it.each([true, false])('reads distinct native and product IDs, enrolled=%s', async (enrolled) => {
    mocks.getUser.mockResolvedValue(user(enrolled));

    await expect(readSecondFactorStatus(DB, ACCOUNT, SUBJECT)).resolves.toEqual({
      authenticator: enrolled,
      backupCodes: enrolled,
      anySecondFactor: enrolled,
      earlierEnrollmentPending: false,
    });

    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(SUBJECT);
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith(
      'select totp_secret_enc from user_two_factor where user_id = $1 and enabled = true limit 1',
      [ACCOUNT],
    );
    expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
    expect(mocks.rememberEnrollment).not.toHaveBeenCalled();
  });

  it('retains the two-argument API for existing same-ID callers', async () => {
    mocks.getUser.mockResolvedValue({ ...user(true), id: ACCOUNT });

    await expect(stepUpLevelFor(DB, ACCOUNT)).resolves.toBe('second_factor');

    expect(mocks.getUser).toHaveBeenCalledExactlyOnceWith(ACCOUNT);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('from user_two_factor'), [
      ACCOUNT,
    ]);
  });

  it.each([
    ['missing', null],
    ['foreign', { ...user(), id: 'foreign-subject' }],
    ['product account substituted for native subject', { ...user(), id: ACCOUNT }],
  ])(
    'refuses a %s provider user before selecting a lower assurance level',
    async (_label, providerUser) => {
      mocks.getUser.mockResolvedValue(providerUser);

      await expect(stepUpLevelFor(DB, ACCOUNT, SUBJECT)).rejects.toMatchObject({ statusCode: 401 });

      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
      expect(mocks.rememberEnrollment).not.toHaveBeenCalled();
    },
  );

  it('propagates provider failure rather than interpreting it as no enrolled factors', async () => {
    const failure = new Error('Identity provider unavailable');
    mocks.getUser.mockRejectedValue(failure);

    await expect(stepUpLevelFor(DB, ACCOUNT, SUBJECT)).rejects.toBe(failure);

    expect(mocks.query).not.toHaveBeenCalled();
  });
});

describe('earlier authenticator enrollment registration', () => {
  beforeEach(() => {
    mocks.query.mockResolvedValueOnce([{ totp_secret_enc: 'fixture-encrypted-totp-secret' }]);
  });

  it('registers the native subject while updating the product-account cache and legacy row', async () => {
    await expect(readSecondFactorStatus(DB, ACCOUNT, SUBJECT)).resolves.toEqual({
      authenticator: true,
      backupCodes: false,
      anySecondFactor: true,
      earlierEnrollmentPending: false,
    });

    expect(mocks.openSecret).toHaveBeenCalledExactlyOnceWith('fixture-encrypted-totp-secret');
    expect(mocks.registerSecondFactor).toHaveBeenCalledExactlyOnceWith(SUBJECT, {
      totpSecret: 'fixture-decrypted-totp-secret',
    });
    expect(mocks.rememberEnrollment).toHaveBeenCalledExactlyOnceWith(ACCOUNT, true);
    expect(mocks.query).toHaveBeenNthCalledWith(
      2,
      'delete from user_two_factor where user_id = $1 and enabled = true',
      [ACCOUNT],
    );
  });

  it('uses second-factor assurance after registering an earlier product-account enrollment', async () => {
    await expect(stepUpLevelFor(DB, ACCOUNT, SUBJECT)).resolves.toBe('second_factor');

    expect(mocks.registerSecondFactor).toHaveBeenCalledWith(SUBJECT, expect.anything());
  });

  it('cleans up a matching old row without re-registering an already enrolled native user', async () => {
    mocks.getUser.mockResolvedValue(user(true));

    await expect(stepUpLevelFor(DB, ACCOUNT, SUBJECT)).resolves.toBe('second_factor');

    expect(mocks.registerSecondFactor).not.toHaveBeenCalled();
    expect(mocks.openSecret).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenLastCalledWith(
      'delete from user_two_factor where user_id = $1 and enabled = true',
      [ACCOUNT],
    );
  });

  it('accepts a registration race only after re-reading the same native subject as enrolled', async () => {
    mocks.getUser.mockResolvedValueOnce(user()).mockResolvedValueOnce(user(true));
    mocks.registerSecondFactor.mockRejectedValue(
      new IdentityRequestRejectedError('Already enrolled', 'already_registered'),
    );

    await expect(stepUpLevelFor(DB, ACCOUNT, SUBJECT)).resolves.toBe('second_factor');

    expect(mocks.getUser.mock.calls).toEqual([[SUBJECT], [SUBJECT]]);
    expect(mocks.rememberEnrollment).toHaveBeenCalledWith(ACCOUNT, true);
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.stringContaining('delete from user_two_factor'),
      [ACCOUNT],
    );
  });

  it.each([null, user(), { ...user(true), id: 'foreign-subject' }, { ...user(true), id: ACCOUNT }])(
    'retains unconfirmed enrollment without downgrading: %j',
    async (afterFailure) => {
      mocks.getUser.mockResolvedValueOnce(user()).mockResolvedValueOnce(afterFailure);
      mocks.registerSecondFactor.mockRejectedValue(new Error('Registration unavailable'));

      await expect(stepUpLevelFor(DB, ACCOUNT, SUBJECT)).rejects.toMatchObject({ statusCode: 503 });

      expect(mocks.getUser.mock.calls).toEqual([[SUBJECT], [SUBJECT]]);
      expect(mocks.query).toHaveBeenCalledTimes(1);
      expect(mocks.rememberEnrollment).not.toHaveBeenCalled();
    },
  );

  it('keeps enrollment pending when the registration recheck itself fails', async () => {
    mocks.getUser
      .mockResolvedValueOnce(user())
      .mockRejectedValueOnce(new Error('Provider unavailable'));
    mocks.registerSecondFactor.mockRejectedValue(new Error('Registration unavailable'));

    await expect(readSecondFactorStatus(DB, ACCOUNT, SUBJECT)).resolves.toMatchObject({
      earlierEnrollmentPending: true,
      anySecondFactor: false,
    });

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.rememberEnrollment).not.toHaveBeenCalled();
  });
});

type ImportedModule0 = typeof import('@/lib/mfa-policy-gate');
type ImportedModule1 = typeof import('@/lib/logger');
