import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountSecurityCredentialPath } from '@agiworkforce/cloud-contracts/account-security';
import {
  fetchWithStepUp,
  requestStepUpGrant,
  STEP_UP_TOKEN_HEADER,
} from '@/features/auth/step-up-fetch';
import { startAuthentication } from '@simplewebauthn/browser';
import {
  confirmReplacementRecoveryKeys,
  enrollAccountSecurity,
  generateRecoveryKeys,
  removeCredential,
  type StepUpRunner,
} from './account-security-client';

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(() => false),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));
vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(async () => 'fixture-session'),
}));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'fixture-csrf'),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string> = {}) => ({
    ...headers,
    'x-csrf-token': 'fixture-csrf',
  })),
  clearCsrfToken: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const refusal = () =>
  json(
    {
      error: {
        code: 'STEP_UP_REQUIRED',
        details: {
          action: 'account_security.change',
        },
      },
    },
    403,
  );
const runStepUp: StepUpRunner = (send, resourceId) =>
  fetchWithStepUp(
    send,
    async (challenge) => {
      const grant = await requestStepUpGrant(challenge.action, challenge.resourceId);
      return grant.kind === 'granted' ? grant.token : null;
    },
    resourceId,
  );

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('account security credential removal proof target', () => {
  it.each(['credential-a', 'credential/with space'])(
    'keeps the exact target %s through grant and replay',
    async (credentialId) => {
      fetchMock.mockImplementation(async (path, init) => {
        if (String(path) === '/api/auth/step-up') {
          expect(JSON.parse(String(init?.body))).toEqual({
            action: 'account_security.change',
            resourceId: credentialId,
          });
          return json({ token: 'fixture-targeted-proof' });
        }
        expect(String(path)).toBe(accountSecurityCredentialPath(credentialId));
        expect(init?.method).toBe('DELETE');
        return new Headers(init?.headers).get(STEP_UP_TOKEN_HEADER) === 'fixture-targeted-proof'
          ? new Response(null, { status: 204 })
          : refusal();
      });

      await removeCredential(credentialId, runStepUp);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(2);
    },
  );

  it('does not add a grant to an already accepted removal', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await removeCredential('credential-a', runStepUp);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(accountSecurityCredentialPath('credential-a'));
  });

  it('does not acquire another grant or replay a second refusal', async () => {
    fetchMock.mockImplementation(async (path) =>
      String(path) === '/api/auth/step-up' ? json({ token: 'fixture-targeted-proof' }) : refusal(),
    );
    await expect(removeCredential('credential-a', runStepUp)).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('preserves the direct sender when no step-up runner is supplied', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await removeCredential('credential-a');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include');
  });
});

describe('recovery batch receipt transport', () => {
  const recoveryBatchId = 'a'.repeat(43);

  it('returns the canonical prepared keys, expiry and receipt together', async () => {
    const prepared = {
      recoveryKeys: ['AAAA-BBBB'],
      expiresAt: '2026-11-07T12:30:00.000Z',
      recoveryBatchId,
    };
    fetchMock.mockResolvedValueOnce(json(prepared));
    await expect(generateRecoveryKeys()).resolves.toEqual(prepared);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/account-security/recovery-keys');
  });

  it.each([undefined, null, '', 'legacy'])(
    'refuses a preparation response without a valid receipt %s',
    async (batchId) => {
      fetchMock.mockResolvedValueOnce(
        json({
          recoveryKeys: ['AAAA-BBBB'],
          expiresAt: '2026-11-07T12:30:00.000Z',
          recoveryBatchId: batchId,
        }),
      );
      await expect(generateRecoveryKeys()).rejects.toMatchObject({ status: 409 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['replace', 'enroll'] as const)(
    'preserves the exact %s receipt through step-up replay',
    async (mode) => {
      const path =
        mode === 'replace'
          ? '/api/account-security/recovery-keys'
          : '/api/account-security/enrollment';
      const assertion = { id: 'passkey', response: { authenticatorData: 'fixture' } };
      vi.mocked(startAuthentication).mockResolvedValue(assertion as never);
      const bodies: unknown[] = [];
      fetchMock.mockImplementation(async (url, init) => {
        if (String(url) === '/api/account-security/verification/options')
          return json({ challenge: 'fixture-challenge' });
        if (String(url) === '/api/auth/step-up') {
          expect(JSON.parse(String(init?.body))).toEqual({
            action: mode === 'replace' ? 'account_security.change' : 'account_security.enroll',
          });
          return json({ token: 'fixture-batch-proof' });
        }
        expect(String(url)).toBe(path);
        expect(init?.credentials).toBe('include');
        expect(new Headers(init?.headers).get('x-csrf-token')).toBe('fixture-csrf');
        bodies.push(JSON.parse(String(init?.body)));
        if (!new Headers(init?.headers).has(STEP_UP_TOKEN_HEADER)) {
          return json(
            {
              error: {
                code: 'STEP_UP_REQUIRED',
                details: {
                  action:
                    mode === 'replace' ? 'account_security.change' : 'account_security.enroll',
                },
              },
            },
            403,
          );
        }
        return mode === 'replace'
          ? new Response(null, { status: 204 })
          : json(
              {
                enrolledAt: 'now',
                verifiedUntil: 'later',
                sessionsSignedOut: 0,
                devicesSignedOut: 0,
              },
              201,
            );
      });
      if (mode === 'replace') await confirmReplacementRecoveryKeys(runStepUp, recoveryBatchId);
      else await enrollAccountSecurity(runStepUp, '123456', recoveryBatchId);
      const expected =
        mode === 'replace'
          ? { recoveryKeysSaved: true, recoveryBatchId }
          : { recoveryKeysSaved: true, recoveryBatchId, emailCode: '123456', response: assertion };
      expect(bodies).toEqual([expected, expected]);
      expect(vi.mocked(startAuthentication)).toHaveBeenCalledTimes(mode === 'enroll' ? 1 : 0);
    },
  );

  it('surfaces stale replacement conflict without generating or confirming another batch', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: { message: 'Generate new recovery keys.' } }, 409),
    );
    await expect(confirmReplacementRecoveryKeys(runStepUp, recoveryBatchId)).rejects.toMatchObject({
      status: 409,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      recoveryKeysSaved: true,
      recoveryBatchId,
    });
  });
});
