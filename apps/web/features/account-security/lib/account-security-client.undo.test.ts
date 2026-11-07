import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { turnOffFromEmailLink } from './account-security-client';

vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: vi.fn(),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));
vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
const token = 'a'.repeat(43);
const receipt = { sessionsSignedOut: 2, passwordReset: false };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'Content-Type': 'application/json', 'x-csrf-token': 'fixture' });
});
afterEach(() => vi.unstubAllGlobals());

describe('anonymous protective link transport', () => {
  it('marks dispatch exactly once immediately before the unchanged POST and validates the response', async () => {
    const order: string[] = [];
    fetchMock.mockImplementation(async () => { order.push('fetch'); return json({ ...receipt, future: true }); });
    await expect(turnOffFromEmailLink(token, {
      isCurrent: () => { order.push('current'); return true; },
      onDispatch: () => { order.push('dispatch'); },
    })).resolves.toEqual(receipt);
    expect(order).toEqual(['current', 'current', 'dispatch', 'fetch']);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/account-security/enrollment/undo', {
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'fixture' },
      body: JSON.stringify({ token }),
    });
  });

  it('does not dispatch an intent retired while CSRF is pending', async () => {
    let resolve!: (headers: Record<string, string>) => void;
    vi.mocked(addCsrfHeaders).mockReturnValue(new Promise((done) => { resolve = done; }));
    let current = true;
    const onDispatch = vi.fn();
    const pending = turnOffFromEmailLink(token, { isCurrent: () => current, onDispatch });
    expect(fetchMock).not.toHaveBeenCalled();
    current = false;
    resolve({});
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(onDispatch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels before even requesting CSRF', async () => {
    const onDispatch = vi.fn();
    await expect(turnOffFromEmailLink(token, { isCurrent: () => false, onDispatch })).rejects.toMatchObject({ name: 'AbortError' });
    expect(addCsrfHeaders).not.toHaveBeenCalled();
    expect(onDispatch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves CSRF failures undispatched', async () => {
    vi.mocked(addCsrfHeaders).mockRejectedValue(new Error('csrf unavailable'));
    const onDispatch = vi.fn();
    await expect(turnOffFromEmailLink(token, { isCurrent: () => true, onDispatch })).rejects.toThrow('csrf unavailable');
    expect(onDispatch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([null, {}, { sessionsSignedOut: '2', passwordReset: false }, { sessionsSignedOut: 0, passwordReset: 'yes' }, { sessionsSignedOut: -1, passwordReset: false }])('rejects malformed receipts after dispatch: %j', async (body) => {
    fetchMock.mockResolvedValue(json(body));
    const onDispatch = vi.fn();
    await expect(turnOffFromEmailLink(token, { isCurrent: () => true, onDispatch })).rejects.toThrow();
    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['non-json', 'non-2xx', 'network'] as const)('surfaces %s without an automatic retry', async (mode) => {
    if (mode === 'network') fetchMock.mockRejectedValue(new Error('offline'));
    else fetchMock.mockResolvedValue(mode === 'non-json' ? new Response('invalid') : json({ error: { message: 'Already used' } }, 404));
    const onDispatch = vi.fn();
    await expect(turnOffFromEmailLink(token, { isCurrent: () => true, onDispatch })).rejects.toThrow();
    expect(onDispatch).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
