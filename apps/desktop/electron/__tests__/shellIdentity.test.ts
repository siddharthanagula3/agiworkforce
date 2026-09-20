import { platformRequestHeaders } from '../../src/lib/platformHeaders';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();
const getSecret = vi.fn<(key: string) => Promise<string | null>>(async () => null);

vi.mock('electron', () => ({
  session: {
    defaultSession: { fetch: (...args: never[]) => fetchMock(...(args as never)) },
    fromPartition: () => ({ fetch: (...args: never[]) => fetchMock(...(args as never)) }),
  },
}));
vi.mock('../config', () => ({
  CLOUD_APP_ORIGIN: 'http://localhost:3100',
  REMOTE_SESSION_PARTITION: 'persist:agi-cloud',
  RENDERER_MODE: 'remote',
}));
vi.mock('../accountBridge', () => ({
  resolveApiBase: async () => 'http://localhost:3100',
  shellRequestHeaders: () => platformRequestHeaders('1.2.3'),
}));
vi.mock('../secretStore', () => ({ getSecret }));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function callTo(path: string) {
  return fetchMock.mock.calls.find(([url]) => url.endsWith(path));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('readShellIdentity', () => {
  it('reads the account the shell session is signed in as', async () => {
    fetchMock.mockResolvedValueOnce(json({ email: 'qa@agiworkforce.com' }));
    const { readShellIdentity } = await import('../shellIdentity');

    await expect(readShellIdentity()).resolves.toEqual({
      signedIn: true,
      email: 'qa@agiworkforce.com',
    });
    expect(callTo('/api/me')?.[0]).toBe('http://localhost:3100/api/me');
  });

  it('reports signed out when the session is refused', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Unauthorized' }, 401));
    const { readShellIdentity } = await import('../shellIdentity');

    await expect(readShellIdentity()).resolves.toEqual({ signedIn: false, email: null });
  });

  it('answers unknown rather than signed out when the read fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { readShellIdentity } = await import('../shellIdentity');

    await expect(readShellIdentity()).resolves.toBeNull();
  });

  it('answers unknown when a redirect answers with a page instead of the account', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    );
    const { readShellIdentity } = await import('../shellIdentity');

    await expect(readShellIdentity()).resolves.toBeNull();
  });
});

describe('reportShellIdentity', () => {
  it('answers from what the renderer reported, without reading the account again', async () => {
    const { readShellIdentity, reportShellIdentity } = await import('../shellIdentity');

    reportShellIdentity({ signedIn: true, email: 'qa@agiworkforce.com' });

    await expect(readShellIdentity()).resolves.toEqual({
      signedIn: true,
      email: 'qa@agiworkforce.com',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // The sign-out this replaces failed live: Chromium commits the navigation
  // before the cookie jar is written, so /api/me still answered 200.
  it('reports a sign-out the moment the renderer says so', async () => {
    const { readShellIdentity, reportShellIdentity } = await import('../shellIdentity');
    reportShellIdentity({ signedIn: true, email: 'qa@agiworkforce.com' });
    fetchMock.mockResolvedValue(json({ email: 'qa@agiworkforce.com' }));

    reportShellIdentity({ signedIn: false, email: null });

    await expect(readShellIdentity()).resolves.toEqual({ signedIn: false, email: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('approveDeviceCode', () => {
  it('approves the code with a token minted for the shell session', async () => {
    fetchMock.mockResolvedValueOnce(json({ token: 'csrf-1' }));
    fetchMock.mockResolvedValueOnce(json({ success: true, approved: true }));
    const { approveDeviceCode } = await import('../shellIdentity');

    await approveDeviceCode('QRST-9876');

    const approve = callTo('/api/auth/device/approve');
    expect((approve?.[1].headers as Record<string, string>)['x-csrf-token']).toBe('csrf-1');
    expect(JSON.parse(String(approve?.[1].body))).toMatchObject({ user_code: 'QRST-9876' });
  });

  it('reports why the account refused instead of claiming a sign-in', async () => {
    fetchMock.mockResolvedValueOnce(json({ token: 'csrf-1' }));
    fetchMock.mockResolvedValueOnce(
      json({ error: { code: 'DEVICE_SIGNIN_DISABLED', message: 'Device sign-in is off.' } }, 403),
    );
    const { approveDeviceCode } = await import('../shellIdentity');

    await expect(approveDeviceCode('QRST-9876')).rejects.toThrow('Device sign-in is off.');
  });

  it('does not approve when no token can be minted', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'nope' }, 500));
    const { approveDeviceCode } = await import('../shellIdentity');

    await expect(approveDeviceCode('QRST-9876')).rejects.toThrow(/could not prepare an approval/i);
    expect(callTo('/api/auth/device/approve')).toBeUndefined();
  });
});
