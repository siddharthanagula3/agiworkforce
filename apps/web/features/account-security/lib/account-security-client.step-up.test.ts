import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { accountSecurityCredentialPath } from '@agiworkforce/cloud-contracts/account-security';
import { fetchWithStepUp, requestStepUpGrant, STEP_UP_TOKEN_HEADER } from '@/features/auth/step-up-fetch';
import { removeCredential, type StepUpRunner } from './account-security-client';

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(() => false),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));
vi.mock('@shared/lib/get-auth-token', () => ({ getAuthToken: vi.fn(async () => 'fixture-session') }));
vi.mock('@/lib/client/csrf', () => ({
  getCsrfToken: vi.fn(async () => 'fixture-csrf'),
  addCsrfHeaders: vi.fn(async (headers: Record<string, string> = {}) => ({
    ...headers, 'x-csrf-token': 'fixture-csrf',
  })),
  clearCsrfToken: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const refusal = () => json({ error: { code: 'STEP_UP_REQUIRED', details: {
  action: 'account_security.change',
} } }, 403);
const runStepUp: StepUpRunner = (send, resourceId) => fetchWithStepUp(send, async (challenge) => {
  const grant = await requestStepUpGrant(challenge.action, challenge.resourceId);
  return grant.kind === 'granted' ? grant.token : null;
}, resourceId);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('account security credential removal proof target', () => {
  it.each(['credential-a', 'credential/with space'])('keeps the exact target %s through grant and replay', async (credentialId) => {
    fetchMock.mockImplementation(async (path, init) => {
      if (String(path) === '/api/auth/step-up') {
        expect(JSON.parse(String(init?.body))).toEqual({ action: 'account_security.change', resourceId: credentialId });
        return json({ token: 'fixture-targeted-proof' });
      }
      expect(String(path)).toBe(accountSecurityCredentialPath(credentialId));
      expect(init?.method).toBe('DELETE');
      return new Headers(init?.headers).get(STEP_UP_TOKEN_HEADER) === 'fixture-targeted-proof'
        ? new Response(null, { status: 204 }) : refusal();
    });

    await removeCredential(credentialId, runStepUp);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(2);
  });

  it('does not add a grant to an already accepted removal', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await removeCredential('credential-a', runStepUp);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(accountSecurityCredentialPath('credential-a'));
  });

  it('does not acquire another grant or replay a second refusal', async () => {
    fetchMock.mockImplementation(async (path) => String(path) === '/api/auth/step-up'
      ? json({ token: 'fixture-targeted-proof' }) : refusal());
    await expect(removeCredential('credential-a', runStepUp)).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('preserves the direct sender when no step-up runner is supplied', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await removeCredential('credential-a');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe('include');
  });
});
