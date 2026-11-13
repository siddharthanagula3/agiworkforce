import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequestAuthority, type SessionAuthority } from '@/lib/identity/request-authority';
import {
  readTwoFactorReceipt,
  readTwoFactorStatus,
  sendTwoFactorMutation,
  type TwoFactorAction,
} from './two-factor-client';
import { generateOTPAuthURL, TOTP_CONFIG } from './user-preferences';
import { getCsrfToken } from '@/lib/client/csrf';
type CsrfModule = typeof import('@/lib/client/csrf');

vi.mock('@/lib/client/csrf', async () => ({
  ...(await vi.importActual<CsrfModule>('@/lib/client/csrf')),
  getCsrfToken: vi.fn(async () => 'csrf-token'),
}));
const fetchMock = vi.fn<typeof fetch>();
const secret = TOTP_CONFIG.SECRET_ALPHABET[0]!.repeat(
  Math.ceil((TOTP_CONFIG.SECRET_LENGTH * 8) / 5),
);
const setup = { secret, otpauth_url: generateOTPAuthURL(secret, 'user@example.com') };
const codes = Array.from({ length: TOTP_CONFIG.BACKUP_CODE_COUNT }, () =>
  TOTP_CONFIG.BACKUP_CODE_ALPHABET[0]!.repeat(TOTP_CONFIG.BACKUP_CODE_LENGTH),
);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
let current: SessionAuthority | null;
function owner(userId = 'a', sessionId = 'session-a') {
  let retired = false;
  const session: SessionAuthority = {
    userId,
    sessionId,
    isCurrent: () => {
      if (current !== session) retired = true;
      return !retired;
    },
    getToken: vi.fn(async () => `token-${userId}`),
  };
  current = session;
  return createRequestAuthority(session);
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(getCsrfToken).mockReset().mockResolvedValue('csrf-token');
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('owned two-factor transport (source-authored, unrun fixtures)', () => {
  it.each(['setup', 'verify', 'disable', 'regenerate'] as const)(
    'sends captured bearer, CSRF and owned signal for %s',
    async (action) => {
      const request = owner();
      fetchMock.mockResolvedValue(json({}));
      await sendTwoFactorMutation(
        request,
        action,
        { 'x-step-up-token': 'grant.signature', Authorization: 'Bearer ambient' },
        '123456',
      );
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(
        `/api/settings/2fa${action === 'disable' ? '' : action === 'regenerate' ? '/backup-codes' : `/${action}`}`,
      );
      expect(init?.method).toBe(action === 'disable' ? 'DELETE' : 'POST');
      expect(init?.credentials).toBe('omit');
      expect(init?.signal).toBe(request.signal);
      const headers = new Headers(init?.headers);
      expect(headers.get('Authorization')).toBe('Bearer token-a');
      expect(headers.get('x-csrf-token')).toBe('csrf-token');
      expect(headers.get('x-step-up-token')).toBe('grant.signature');
      expect(headers.has('x-workspace-id')).toBe(false);
      expect(init?.body).toBe(action === 'verify' ? JSON.stringify({ code: '123456' }) : undefined);
    },
  );

  it('reads status without ambient cookies and validates every capability boolean', async () => {
    const request = owner();
    fetchMock.mockResolvedValue(
      json({ enabled: true, backup_codes_ready: false, enrollment_available: true }),
    );
    await expect(readTwoFactorStatus(request)).resolves.toEqual({
      enabled: true,
      backupCodesReady: false,
      enrollmentAvailable: true,
    });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
    for (const body of [
      { enabled: false },
      { enabled: 'true', backup_codes_ready: true, enrollment_available: true },
      null,
    ]) {
      fetchMock.mockResolvedValue(json(body));
      await expect(readTwoFactorStatus(request)).rejects.toBeDefined();
    }
  });

  it('does not dispatch without a captured token', async () => {
    const request = owner();
    vi.mocked(request.session.getToken).mockResolvedValue(null);
    await expect(sendTwoFactorMutation(request, 'verify', {}, '123456')).rejects.toThrow(
      /not authenticated/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['csrf', 'token'] as const)(
    'drops a pending %s after same-ID session replacement',
    async (boundary) => {
      const request = owner();
      const pending = deferred<string | null>();
      if (boundary === 'csrf')
        vi.mocked(getCsrfToken).mockReturnValue(pending.promise as Promise<string>);
      else vi.mocked(request.session.getToken).mockReturnValue(pending.promise);
      const operation = sendTwoFactorMutation(request, 'verify', {}, '123456');
      const assertion = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
      await Promise.resolve();
      owner();
      pending.resolve('old-token');
      await assertion;
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('drops a delayed fetch after A to B to A replacement', async () => {
    const request = owner();
    const pending = deferred<Response>();
    fetchMock.mockReturnValue(pending.promise);
    const operation = sendTwoFactorMutation(request, 'verify', {}, '123456');
    const assertion = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    owner('b', 'session-b');
    expect(request.isCurrent()).toBe(false);
    owner();
    pending.resolve(json({ success: true, backup_codes: codes }));
    await assertion;
    expect(request.signal.aborted).toBe(true);
  });

  it('drops a successful receipt body after retirement', async () => {
    const request = owner();
    const body = deferred<unknown>();
    const operation = readTwoFactorReceipt(
      request,
      { ok: true, json: () => body.promise } as Response,
      'verify',
    );
    const assertion = expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    request.retire();
    body.resolve({ success: true, backup_codes: codes });
    await assertion;
  });

  it('accepts exact route receipts and preserves duplicate codes issued by the server', async () => {
    const request = owner();
    for (const [action, body] of [
      ['setup', setup],
      ['verify', { success: true, backup_codes: codes }],
      ['disable', { success: true }],
      ['regenerate', { backup_codes: codes }],
    ] as const) {
      await expect(readTwoFactorReceipt(request, json(body), action)).resolves.toEqual(body);
    }
  });

  it.each([
    ['setup', { secret, otpauth_url: 'https://example.test/' }],
    ['setup', { secret, otpauth_url: 'otpauth://totp/example?secret=AAAAAAAA' }],
    ['setup', { secret: '', otpauth_url: 'otpauth://totp/example?secret=' }],
    ['setup', { secret, otpauth_url: `${setup.otpauth_url}&secret=${secret}` }],
    ['setup', { secret, otpauth_url: setup.otpauth_url.replace('digits=6', 'digits=8') }],
    ['verify', { backup_codes: codes }],
    ['verify', { success: false, backup_codes: codes }],
    ['verify', { success: true, backup_codes: [] }],
    ['regenerate', { backup_codes: codes.slice(1) }],
    ['regenerate', { backup_codes: [...codes, codes[0]] }],
    ['regenerate', { backup_codes: codes.map(() => '0'.repeat(TOTP_CONFIG.BACKUP_CODE_LENGTH)) }],
    ['regenerate', { backup_codes: [''] }],
    ['regenerate', { backup_codes: [12345678] }],
    ['disable', {}],
    ['disable', { success: 'true' }],
  ] as [TwoFactorAction, unknown][])('rejects a malformed %s receipt', async (action, body) => {
    await expect(readTwoFactorReceipt(owner(), json(body), action)).rejects.toBeDefined();
  });

  it.each([400, 401, 403, 429, 500, 503])(
    'does not interpret HTTP %s as a completed change or proven no-effect',
    async (status) => {
      const request = owner();
      fetchMock.mockResolvedValue(json({ error: { message: 'Request rejected' } }, status));
      const response = await sendTwoFactorMutation(request, 'verify', {}, '123456');
      expect(response.status).toBe(status);
      await expect(readTwoFactorReceipt(request, response, 'verify')).rejects.toThrow(
        /outcome could not be confirmed/i,
      );
    },
  );

  it('rejects unreadable receipts and propagates post-dispatch failure instead of inventing codes', async () => {
    await expect(
      readTwoFactorReceipt(owner(), new Response('not json'), 'verify'),
    ).rejects.toBeDefined();
    fetchMock.mockRejectedValue(new TypeError('Connection lost after dispatch'));
    await expect(sendTwoFactorMutation(owner(), 'verify', {}, '123456')).rejects.toThrow(
      'Connection lost after dispatch',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
