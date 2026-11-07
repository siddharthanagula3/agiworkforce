import { api } from '@/services/api';
import {
  changeAccountPassword,
  regenerateBackupCodes,
  revokeAllAccountSessions,
  startAuthenticatorSetup,
  turnOffTwoFactor,
  verifyAuthenticatorCode,
} from '@/src/features/settings/account-security/service';
import {
  fetchWorkspaceMembers,
  fetchWorkspaceOverview,
  transferWorkspaceOwnership,
} from '@/src/features/team/service';

jest.mock('@/services/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

const apiMock = api as jest.Mocked<typeof api>;
const account = { ownerId: 'fixture-account-a', epoch: 7 };
const headers = { 'x-step-up-token': 'fixture-grant' };

describe('security mutation original-account transport ownership', () => {
  beforeEach(() => jest.clearAllMocks());

  it('forwards the same original epoch for initial and step-up mutation sends', async () => {
    for (const proof of [{}, headers]) {
      apiMock.post.mockResolvedValue({ secret: 'fixture-secret', otpauth_url: 'fixture-url' });
      await startAuthenticatorSetup(proof, account);
      expect(apiMock.post).toHaveBeenLastCalledWith(
        '/api/settings/2fa/setup',
        {},
        {
          headers: proof,
          accountEpoch: account,
        },
      );
      apiMock.post.mockResolvedValue({ backup_codes: ['fixture-code'] });
      await expect(regenerateBackupCodes(proof, account)).resolves.toEqual(['fixture-code']);
      expect(apiMock.post).toHaveBeenLastCalledWith(
        '/api/settings/2fa/backup-codes',
        {},
        {
          headers: proof,
          accountEpoch: account,
        },
      );
      await turnOffTwoFactor(proof, account);
      expect(apiMock.delete).toHaveBeenLastCalledWith('/api/settings/2fa', {
        headers: proof,
        accountEpoch: account,
      });
      await revokeAllAccountSessions(proof, account);
      expect(apiMock.delete).toHaveBeenLastCalledWith('/api/settings/sessions', {
        headers: proof,
        accountEpoch: account,
      });
      await changeAccountPassword(
        { currentPassword: null, newPassword: 'fixture-password' },
        proof,
        account,
      );
      expect(apiMock.post).toHaveBeenLastCalledWith(
        '/api/settings/password',
        {
          newPassword: 'fixture-password',
        },
        { headers: proof, accountEpoch: account },
      );
      await transferWorkspaceOwnership('fixture-workspace', 'fixture-successor', proof, account);
      expect(apiMock.post).toHaveBeenLastCalledWith(
        '/api/settings/organization/transfer-ownership',
        {
          organizationId: 'fixture-workspace',
          toUserId: 'fixture-successor',
          outgoingOwnerRole: 'admin',
        },
        { headers: proof, accountEpoch: account },
      );
    }
  });

  it('binds enrollment verification to its setup owner and preserves returned codes', async () => {
    apiMock.post.mockResolvedValueOnce({ backup_codes: ['fixture-code'] });
    await expect(verifyAuthenticatorCode('123456', account)).resolves.toEqual(['fixture-code']);
    expect(apiMock.post).toHaveBeenCalledWith(
      '/api/settings/2fa/verify',
      { code: '123456' },
      {
        accountEpoch: account,
      },
    );
  });

  it('passes the original epoch to both workspace reads', async () => {
    const controller = new AbortController();
    apiMock.get
      .mockResolvedValueOnce({ organization: null })
      .mockResolvedValueOnce({ members: [] });
    await fetchWorkspaceOverview(controller.signal, account);
    await fetchWorkspaceMembers('fixture-workspace', controller.signal, account);
    expect(apiMock.get).toHaveBeenNthCalledWith(1, '/api/settings/organization', {
      signal: controller.signal,
      accountEpoch: account,
    });
    expect(apiMock.get).toHaveBeenNthCalledWith(
      2,
      '/api/settings/team?organizationId=fixture-workspace',
      {
        signal: controller.signal,
        accountEpoch: account,
      },
    );
  });

  it('propagates transport refusal without retrying or fabricating success', async () => {
    const refusal = new Error('fixture stale operation');
    apiMock.post.mockRejectedValueOnce(refusal);
    await expect(
      transferWorkspaceOwnership('fixture-workspace', 'fixture-successor', headers, account),
    ).rejects.toBe(refusal);
    expect(apiMock.post).toHaveBeenCalledTimes(1);
  });
});
