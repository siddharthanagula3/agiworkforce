import { SURFACE_TOKEN_HEADER } from '@agiworkforce/types';

const mockState = {
  session: null as null | { id: string; user: { id: string }; getToken: jest.Mock },
  owner: 'account-a',
  epoch: 1,
  signedIn: true,
};
const mockSdk = { get session() { return mockState.session; } };
const mockGuardedFetch = jest.fn();
jest.mock('@clerk/expo', () => ({ getClerkInstance: () => mockSdk }));
jest.mock('@/lib/constants', () => ({ API_URL: 'https://voice.example.test', TIMEOUTS: { DEFAULT: 1000 } }));
jest.mock('@/lib/egressGuard', () => ({ guardedFetch: (...args: unknown[]) => mockGuardedFetch(...args) }));
jest.mock('@/src/platform/platformHeaders', () => ({ platformRequestHeaders: () => ({}) }));
jest.mock('@/src/integrations/clerk', () => ({
  CLERK_PUBLISHABLE_KEY: 'test-key',
  getSessionToken: (mint: (options?: { template: string }) => Promise<string>) => mint(),
  getSurfaceToken: (mint: (options?: { template: string }) => Promise<string>) => mint({ template: 'surface' }),
}));
jest.mock('@/src/features/auth/services/cloudAccountSession', () => ({
  captureCloudAccountEpoch: () => ({ ownerId: mockState.owner, epoch: mockState.epoch }),
  isCloudAccountEpochCurrent: (account: { ownerId: string; epoch: number }) =>
    account.ownerId === mockState.owner && account.epoch === mockState.epoch,
}));
jest.mock('@/src/features/auth/store', () => ({
  useAuthStore: { getState: () => ({ isClerkSignedIn: mockState.signedIn }) },
}));

import { captureLiveVoiceAuthority } from '@/src/features/voice/services/liveVoiceAuthority';

beforeEach(() => {
  mockState.owner = 'account-a';
  mockState.epoch = 1;
  mockState.signedIn = true;
  mockState.session = {
    id: 'login-a', user: { id: 'account-a' },
    getToken: jest.fn(async (options?: { template: string }) => options?.template ? 'proof-a' : 'bearer-a'),
  };
  mockGuardedFetch.mockReset().mockImplementation(async () => new Response('{}', { status: 200 }));
});

it('uses only captured original bearer and surface proof for known-session cleanup after login replacement', async () => {
  const authority = captureLiveVoiceAuthority(() => true)!;
  await authority.fetch('/api/voice/live/sessions', { method: 'POST' });
  const replacement = { id: 'login-b', user: { id: 'account-a' }, getToken: jest.fn() };
  mockState.session = replacement;
  authority.retire();
  await authority.closeCreated('session-a', { reason: 'close_requested', seconds: 1 });
  const [url, init] = mockGuardedFetch.mock.calls[1] as [string, RequestInit];
  expect(url).toBe('https://voice.example.test/api/voice/live/sessions/session-a/close');
  expect(init.credentials).toBe('omit');
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer bearer-a');
  expect(new Headers(init.headers).get(SURFACE_TOKEN_HEADER)).toBe('proof-a');
  expect(replacement.getToken).not.toHaveBeenCalled();
});

it('refuses a continuation whose token resolves after its exact login changes', async () => {
  let resolveToken!: (token: string) => void;
  mockState.session!.getToken.mockReturnValueOnce(new Promise((resolve) => { resolveToken = resolve; }));
  const authority = captureLiveVoiceAuthority(() => true)!;
  const pending = authority.fetch('/api/voice/live/sessions', { method: 'POST' });
  mockState.session = { id: 'login-b', user: { id: 'account-a' }, getToken: jest.fn() };
  resolveToken('bearer-a');
  await expect(pending).rejects.toThrow('owner changed');
  expect(mockGuardedFetch).not.toHaveBeenCalled();
});

it('does not fall back to current credentials when cleanup was never authorized by a creation request', async () => {
  const authority = captureLiveVoiceAuthority(() => true)!;
  authority.retire();
  await expect(authority.closeCreated('session-a', {})).rejects.toThrow('cleanup credentials');
  expect(mockGuardedFetch).not.toHaveBeenCalled();
});

it('does not bypass a Local-mode egress refusal to complete cleanup', async () => {
  const authority = captureLiveVoiceAuthority(() => true)!;
  await authority.fetch('/api/voice/live/sessions', { method: 'POST' });
  mockGuardedFetch.mockRejectedValueOnce(new Error('Local mode blocks egress'));
  await expect(authority.closeCreated('session-a', {})).rejects.toThrow('Local mode');
  expect(mockGuardedFetch).toHaveBeenCalledTimes(2);
});
