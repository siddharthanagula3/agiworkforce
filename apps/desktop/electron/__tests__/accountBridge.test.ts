import { beforeEach, describe, expect, it, vi } from 'vitest';

const secrets = new Map<string, string>();
const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

vi.mock('electron', () => ({ app: { getVersion: () => '1.2.3' } }));
vi.mock('../config', () => ({
  CLOUD_APP_ORIGIN: 'https://cloud.test',
  isAllowedApiBaseUrl: () => true,
  isAllowedClerkFrontendApi: () => true,
}));
vi.mock('../clerkProxy', () => ({ executeClerkNativeRequest: vi.fn() }));
vi.mock('../secretStore', () => ({
  isSecretKey: () => true,
  getSecret: async (key: string) => secrets.get(key) ?? null,
  setSecret: async (key: string, value: string) => {
    await Promise.resolve();
    secrets.set(key, value);
  },
  clearSecrets: async (keys: readonly string[]) => {
    await Promise.resolve();
    for (const key of keys) secrets.delete(key);
  },
}));

function accessTokenFor(subject: string, sessionId: string, issue = 1): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part({ sub: subject, sid: sessionId, issue })}.signature`;
}

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function refreshCalls() {
  return fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/auth/device/refresh'));
}

async function bridge() {
  return import('../accountBridge');
}

const ALICE = accessTokenFor('alice', 'family-1');
const ALICE_RENEWED = accessTokenFor('alice', 'family-1', 2);
const BOB = accessTokenFor('bob', 'family-2');

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  secrets.clear();
  vi.stubGlobal('fetch', fetchMock);
});

describe('the Electron account bridge keeps the refresh token in the main process', () => {
  it('renews the session itself and gives the caller only the access token', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-1');
    fetchMock.mockResolvedValueOnce(
      reply({ access_token: ALICE_RENEWED, refresh_token: 'refresh-2', expires_in: 900 }),
    );
    const { handleBridgeCommand } = await bridge();

    const renewed = await handleBridgeCommand('account_refresh_session');

    expect(renewed).toEqual({ status: 'renewed', accessToken: ALICE_RENEWED });
    expect(JSON.stringify(renewed)).not.toContain('refresh-2');
    const [url, init] = refreshCalls()[0] ?? [];
    expect(url).toBe('https://cloud.test/api/auth/device/refresh');
    expect(init?.method).toBe('POST');
    expect(init?.redirect).toBe('error');
    expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'refresh-1' });
    expect(secrets.get('refresh_token')).toBe('refresh-2');
    expect(secrets.get('access_token')).toBe(ALICE_RENEWED);
  });

  it('answers signed out and calls nothing when no refresh token is saved', async () => {
    const { handleBridgeCommand } = await bridge();

    await expect(handleBridgeCommand('account_refresh_session')).resolves.toEqual({
      status: 'signed_out',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('spends a refresh token once when two callers ask at the same time', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-1');
    fetchMock.mockImplementation(async () =>
      reply({ access_token: ALICE_RENEWED, refresh_token: 'refresh-2' }),
    );
    const { handleBridgeCommand } = await bridge();

    const [first, second] = await Promise.all([
      handleBridgeCommand('account_refresh_session'),
      handleBridgeCommand('account_refresh_session'),
    ]);

    expect(first).toEqual({ status: 'renewed', accessToken: ALICE_RENEWED });
    expect(second).toEqual(first);
    expect(refreshCalls()).toHaveLength(1);
  });

  it('treats a 400 as the server refusing the refresh token: rejected, and the saved session is cleared', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-1');
    fetchMock.mockResolvedValueOnce(reply({ error: 'invalid_grant' }, 400));
    const { handleBridgeCommand } = await bridge();

    await expect(handleBridgeCommand('account_refresh_session')).resolves.toEqual({
      status: 'rejected',
    });
    expect(secrets.has('access_token')).toBe(false);
    expect(secrets.has('refresh_token')).toBe(false);
  });

  it.each([401, 403])(
    "treats %i as a refusal with the server's sentence and keeps the saved session",
    async (status) => {
      secrets.set('access_token', ALICE);
      secrets.set('refresh_token', 'refresh-1');
      fetchMock.mockResolvedValueOnce(
        reply(
          { error: 'terms_acceptance_required', error_description: 'Accept the terms.' },
          status,
        ),
      );
      const { handleBridgeCommand } = await bridge();

      await expect(handleBridgeCommand('account_refresh_session')).resolves.toEqual({
        status: 'refused',
        reason: 'Accept the terms.',
        code: 'terms_acceptance_required',
      });
      expect(secrets.get('access_token')).toBe(ALICE);
      expect(secrets.get('refresh_token')).toBe('refresh-1');
    },
  );

  it('falls back to a generic sentence and code when a refusal body says nothing usable', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-1');
    fetchMock.mockResolvedValueOnce(reply({ error: '', error_description: 7 }, 403));
    const { handleBridgeCommand } = await bridge();

    await expect(handleBridgeCommand('account_refresh_session')).resolves.toEqual({
      status: 'refused',
      reason: 'AGI Cloud did not renew your session.',
      code: 'refresh_unavailable',
    });
    expect(secrets.get('refresh_token')).toBe('refresh-1');
  });

  it.each([429, 500, 502, 503])(
    'treats %i as unreachable and keeps the saved session',
    async (status) => {
      secrets.set('access_token', ALICE);
      secrets.set('refresh_token', 'refresh-1');
      fetchMock.mockResolvedValueOnce(reply({ error: 'try later', echo: 'refresh-1' }, status));
      const { handleBridgeCommand } = await bridge();

      const outcome = await handleBridgeCommand('account_refresh_session');

      expect(outcome).toEqual({
        status: 'unreachable',
        reason: `AGI Cloud did not renew the session (status ${status}).`,
      });
      expect(secrets.get('access_token')).toBe(ALICE);
      expect(secrets.get('refresh_token')).toBe('refresh-1');
      expect(refreshCalls()).toHaveLength(1);
    },
  );

  it('treats a network failure, a timeout or a refused redirect as unreachable, with one attempt', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-1');
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const { handleBridgeCommand } = await bridge();

    const outcome = (await handleBridgeCommand('account_refresh_session')) as {
      status: string;
      reason: string;
    };

    expect(outcome.status).toBe('unreachable');
    expect(outcome.reason).toContain('Could not reach the AGI account service');
    expect(outcome.reason).not.toContain('refresh-1');
    expect(secrets.get('refresh_token')).toBe('refresh-1');
    expect(refreshCalls()).toHaveLength(1);
  });

  it('keeps the saved session when the reply lacks either token', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-1');
    fetchMock.mockResolvedValueOnce(reply({ access_token: ALICE_RENEWED }));
    const { handleBridgeCommand } = await bridge();

    await expect(handleBridgeCommand('account_refresh_session')).resolves.toEqual({
      status: 'unreachable',
      reason: 'AGI Cloud returned an invalid reply when renewing the session.',
    });
    expect(secrets.get('access_token')).toBe(ALICE);
    expect(secrets.get('refresh_token')).toBe('refresh-1');
  });

  it('signs out instead of adopting a renewal that came back for another account', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-1');
    fetchMock.mockResolvedValueOnce(reply({ access_token: BOB, refresh_token: 'refresh-bob' }));
    const { handleBridgeCommand } = await bridge();

    await expect(handleBridgeCommand('account_refresh_session')).resolves.toEqual({
      status: 'rejected',
    });
    expect(secrets.has('access_token')).toBe(false);
    expect(secrets.has('refresh_token')).toBe(false);
  });

  it('does not bring a session back when the person signed out during the renewal', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-1');
    let answer: (response: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
    );
    const { handleBridgeCommand } = await bridge();

    const renewal = handleBridgeCommand('account_refresh_session');
    await vi.waitFor(() => expect(refreshCalls()).toHaveLength(1));
    await handleBridgeCommand('account_clear_tokens');
    answer(reply({ access_token: ALICE_RENEWED, refresh_token: 'refresh-2' }));

    await expect(renewal).resolves.toEqual({
      status: 'unreachable',
      reason: 'The session changed while it was being renewed.',
    });
    expect(secrets.has('access_token')).toBe(false);
    expect(secrets.has('refresh_token')).toBe(false);
  });

  it('takes the refresh token out of a sign-in reply and saves it when the page adopts the access token', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-alice');
    const { handleBridgeCommand, withholdRefreshToken } = await bridge();

    const forThePage = withholdRefreshToken({
      status: 200,
      body: JSON.stringify({ access_token: BOB, refresh_token: 'refresh-bob', expires_in: 900 }),
    });

    expect(forThePage.body).not.toContain('refresh-bob');
    expect(JSON.parse(forThePage.body)).toEqual({ access_token: BOB, expires_in: 900 });
    expect(secrets.get('refresh_token')).toBe('refresh-alice');

    await handleBridgeCommand('account_store_access_token', { accessToken: BOB });

    expect(secrets.get('access_token')).toBe(BOB);
    expect(secrets.get('refresh_token')).toBe('refresh-bob');
  });

  it('hands the page a sign-in reply without the refresh token, and no command returns or accepts one', async () => {
    fetchMock.mockResolvedValueOnce(
      reply({ access_token: ALICE, refresh_token: 'refresh-alice', expires_in: 900 }),
    );
    const { handleBridgeCommand } = await bridge();

    const polled = (await handleBridgeCommand('account_poll_device_authorization', {
      deviceCode: 'device-code-1',
    })) as { status: number; body: string };

    expect(polled.status).toBe(200);
    expect(polled.body).not.toContain('refresh-alice');
    expect(JSON.parse(polled.body)).toEqual({ access_token: ALICE, expires_in: 900 });
    expect(secrets.has('refresh_token')).toBe(false);

    await handleBridgeCommand('account_store_access_token', { accessToken: ALICE });
    expect(secrets.get('refresh_token')).toBe('refresh-alice');
    await expect(handleBridgeCommand('account_restore_access_token')).resolves.toBe(ALICE);

    await expect(handleBridgeCommand('account_restore_refresh_token')).rejects.toThrow(
      'Unknown bridge command',
    );
    await expect(
      handleBridgeCommand('account_store_refresh_token', { refreshToken: 'planted' }),
    ).rejects.toThrow('Unknown bridge command');
    expect(secrets.get('refresh_token')).toBe('refresh-alice');
  });

  it('leaves the saved account alone when a sign-in is abandoned', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-alice');
    const { handleBridgeCommand, withholdRefreshToken } = await bridge();
    withholdRefreshToken({
      status: 200,
      body: JSON.stringify({ access_token: BOB, refresh_token: 'refresh-bob' }),
    });

    await handleBridgeCommand('account_store_access_token', { accessToken: ALICE_RENEWED });

    expect(secrets.get('refresh_token')).toBe('refresh-alice');
  });

  it('forgets the saved refresh token when another sign-in is adopted without one', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-alice');
    const { handleBridgeCommand } = await bridge();

    await handleBridgeCommand('account_store_access_token', { accessToken: BOB });

    expect(secrets.get('access_token')).toBe(BOB);
    expect(secrets.has('refresh_token')).toBe(false);
  });

  it('passes a reply with no refresh token through unchanged, and refuses an access token with no subject', async () => {
    const { handleBridgeCommand, withholdRefreshToken } = await bridge();

    for (const body of ['{"error":"authorization_pending"}', '<html>bad gateway</html>', '']) {
      expect(withholdRefreshToken({ status: 400, body })).toEqual({ status: 400, body });
    }
    await expect(
      handleBridgeCommand('account_store_access_token', { accessToken: 'not-a-session-token' }),
    ).rejects.toThrow('Invalid access token.');
  });

  it('clears both tokens and anything held from a sign-in on sign-out', async () => {
    secrets.set('access_token', ALICE);
    secrets.set('refresh_token', 'refresh-alice');
    const { handleBridgeCommand, withholdRefreshToken } = await bridge();
    withholdRefreshToken({
      status: 200,
      body: JSON.stringify({ access_token: BOB, refresh_token: 'refresh-bob' }),
    });

    await handleBridgeCommand('account_clear_tokens');
    await handleBridgeCommand('account_store_access_token', { accessToken: BOB });

    expect(secrets.get('access_token')).toBe(BOB);
    expect(secrets.has('refresh_token')).toBe(false);
  });
});
