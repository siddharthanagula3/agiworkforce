const mockFetch = jest.fn();
const mockGet = jest.fn();
const mockMint = jest.fn();
const mockOriginalSession = { id: 'session-a', user: { id: 'account-a' }, getToken: mockMint };
const mockSdk = { session: mockOriginalSession as typeof mockOriginalSession | null };
let mockEpoch = 1;
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => mockSdk }));
jest.mock('../services/api', () => ({ apiFetch: (...args: unknown[]) => mockFetch(...args), api: { get: (...args: unknown[]) => mockGet(...args) } }));
jest.mock('../services/apiErrors', () => ({ ApiHttpError: class extends Error {}, parseJsonBody: (body: string) => JSON.parse(body) }));
jest.mock('../src/integrations/clerk', () => ({ CLERK_PUBLISHABLE_KEY: 'fixture-publishable-key' }));
jest.mock('../src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: 'account-a', epoch: mockEpoch }),
  isCloudAccountEpochCurrent: (account: { epoch: number }) => account.epoch === mockEpoch,
}));
import { captureStepUpIdentity, currentSessionToken, readStepUpConsequence, requestStepUpGrant, StepUpCancelledError } from '../src/features/auth/services/stepUp';

beforeEach(() => {
  jest.clearAllMocks();
  mockSdk.session = mockOriginalSession;
  mockEpoch = 1;
  mockMint.mockResolvedValue('fixture-original-bearer');
});

test('identity permanently retires after observing a different same-user session', () => {
  const identity = captureStepUpIdentity();
  mockSdk.session = { ...mockOriginalSession, id: 'session-b' };
  expect(identity.isCurrent()).toBe(false);
  mockSdk.session = mockOriginalSession;
  expect(identity.isCurrent()).toBe(false);
});

test('token completion cannot survive a changed account epoch', async () => {
  let resolve!: (token: string) => void;
  mockMint.mockReturnValue(new Promise<string>((yes) => { resolve = yes; }));
  const identity = captureStepUpIdentity();
  const pending = currentSessionToken(identity);
  mockEpoch += 1;
  resolve('fixture-original-bearer');
  await expect(pending).rejects.toBeInstanceOf(StepUpCancelledError);
  expect(mockMint).toHaveBeenCalledTimes(1);
});

test('grant forwards immutable action, resource, original bearer, epoch and signal', async () => {
  mockFetch.mockResolvedValue({ ok: true, text: async () => JSON.stringify({ token: 'fixture-grant' }) });
  const options = { accountEpoch: { ownerId: 'account-a', epoch: 1 }, signal: new AbortController().signal };
  await expect(requestStepUpGrant('organization.transfer_ownership', 'workspace-a', 'fixture-original-bearer', options)).resolves.toEqual({ kind: 'granted', token: 'fixture-grant' });
  expect(mockFetch).toHaveBeenCalledWith('/api/auth/step-up', {
    method: 'POST', body: JSON.stringify({ action: 'organization.transfer_ownership', resourceId: 'workspace-a' }),
  }, { ...options, headers: { Authorization: 'Bearer fixture-original-bearer' }, auth401Recovery: 'caller-owned' });
});

test('a 401 cannot become a grant or verification challenge from its body', async () => {
  mockFetch.mockResolvedValue({
    ok: false, status: 401,
    text: async () => JSON.stringify({ token: 'unusable-grant', error: {
      code: 'STEP_UP_VERIFICATION_REQUIRED', details: { level: 'second_factor' },
    } }),
  });
  const options = { accountEpoch: { ownerId: 'account-a', epoch: 1 }, signal: new AbortController().signal };
  await expect(requestStepUpGrant('password.change', null, 'fixture-original-bearer', options))
    .resolves.toEqual({ kind: 'failed', message: 'Your session could not be confirmed. Sign in again to continue.' });
});

test('consequence lookup retains original epoch and cancellation signal', async () => {
  mockGet.mockResolvedValue({ actions: { 'password.change': { consequence: 'Fixture consequence' } } });
  const options = { accountEpoch: { ownerId: 'account-a', epoch: 1 }, signal: new AbortController().signal };
  await expect(readStepUpConsequence('password.change', options)).resolves.toBe('Fixture consequence');
  expect(mockGet).toHaveBeenCalledWith('/api/auth/step-up', options);
});
