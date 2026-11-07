import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { managedCloudPublishedArtifactPath } from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { updatePublishedSite } from './sites-service';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));

const token = 'a'.repeat(24);
const otherToken = 'b'.repeat(24);
const fetchMock = vi.fn<typeof fetch>();
const receipt = {
  token,
  shareUrl: `https://example.test/shared-artifact/${token}`,
  title: 'Scoreboard',
  visibility: 'invited',
  organizationId: null,
  updatedAt: '2026-11-07T00:00:00.000Z',
};
const uncertain =
  'This site update could not be confirmed. It may have taken effect. Refresh to check before trying again.';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'update-csrf' });
});
afterEach(() => vi.unstubAllGlobals());

describe('Sites update receipt boundary', () => {
  it.each(['public', 'organization', 'invited'] as const)(
    'accepts matching %s audience receipts',
    async (visibility) => {
      const body = {
        ...receipt,
        visibility,
        organizationId: visibility === 'organization' ? 'org-1' : null,
      };
      fetchMock.mockResolvedValue(Response.json(body));
      await expect(updatePublishedSite(token, { visibility })).resolves.toEqual(body);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(managedCloudPublishedArtifactPath(token), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'X-CSRF-Token': 'update-csrf' },
        body: JSON.stringify({ visibility }),
      });
      expect(addCsrfHeaders).toHaveBeenCalledExactlyOnceWith({
        'Content-Type': 'application/json',
      });
    },
  );

  it.each([
    ['legacy short token', { token: 'legacy' }],
    [
      'wrong target',
      { token: otherToken, shareUrl: `https://example.test/shared-artifact/${otherToken}` },
    ],
    ['wrong audience', { visibility: 'public' }],
    ['wrong link token', { shareUrl: `https://example.test/shared-artifact/${otherToken}` }],
    ['relative URL', { shareUrl: `/shared-artifact/${token}` }],
    ['non HTTP URL', { shareUrl: `ftp://example.test/shared-artifact/${token}` }],
    ['credentials', { shareUrl: `https://user:password@example.test/shared-artifact/${token}` }],
    ['query', { shareUrl: `${receipt.shareUrl}?view=public` }],
    ['fragment', { shareUrl: `${receipt.shareUrl}#preview` }],
    ['wrong path', { shareUrl: `https://example.test/other/${token}` }],
    ['missing metadata', { updatedAt: undefined }],
  ])('rejects %s without retry or fallback', async (_name, change) => {
    fetchMock.mockResolvedValue(Response.json({ ...receipt, ...change }));
    await expect(updatePublishedSite(token, { visibility: 'invited' })).rejects.toThrow(uncertain);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['not JSON', 'null', '{}'])('reports an uncertain invalid 2xx body: %s', async (body) => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(updatePublishedSite(token, { title: 'Name' })).rejects.toThrow(uncertain);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports empty 204 as uncertain', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(updatePublishedSite(token, { visibility: 'invited' })).rejects.toThrow(uncertain);
  });

  it.each([
    [{ title: '  Scoreboard  ' }, 'Scoreboard'],
    [{ title: 'Sensitive name', visibility: 'invited' as const }, '[REDACTED]'],
  ])('retains the server-normalized or policy-redacted title for %j', async (change, title) => {
    fetchMock.mockResolvedValue(Response.json({ ...receipt, title }));
    await expect(updatePublishedSite(token, change)).resolves.toEqual({ ...receipt, title });
  });

  it('still binds visibility for a combined rename and sharing request', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ ...receipt, title: '[REDACTED]', visibility: 'public' }),
    );
    await expect(
      updatePublishedSite(token, { title: 'Sensitive name', visibility: 'invited' }),
    ).rejects.toThrow(uncertain);
  });

  it('snapshots payload and receipt expectations before CSRF awaits', async () => {
    let resolve!: (headers: Record<string, string>) => void;
    vi.mocked(addCsrfHeaders).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    fetchMock.mockResolvedValue(Response.json(receipt));
    const change = { title: 'Scoreboard', visibility: 'invited' as 'invited' | 'public' };
    const pending = updatePublishedSite(token, change);
    change.title = 'Changed after invocation';
    change.visibility = 'public';
    resolve({ 'X-CSRF-Token': 'update-csrf' });
    await expect(pending).resolves.toEqual(receipt);
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ title: 'Scoreboard', visibility: 'invited' }),
    );
  });

  it.each([403, 404, 409, 500])('preserves HTTP %s errors without retry', async (status) => {
    fetchMock.mockResolvedValue(
      Response.json({ error: { message: 'Update refused' } }, { status }),
    );
    await expect(updatePublishedSite(token, { visibility: 'invited' })).rejects.toThrow(
      'Update refused',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ title: 'Name' }, 'Failed to rename this site'],
    [{ visibility: 'invited' as const }, 'Failed to change who can open this'],
  ])('preserves malformed HTTP error fallback for %j', async (change, message) => {
    fetchMock.mockResolvedValue(new Response('not JSON', { status: 500 }));
    await expect(updatePublishedSite(token, change)).rejects.toThrow(message);
  });

  it('does not send after CSRF failure', async () => {
    vi.mocked(addCsrfHeaders).mockRejectedValue(new Error('CSRF unavailable'));
    await expect(updatePublishedSite(token, { visibility: 'invited' })).rejects.toThrow(
      'CSRF unavailable',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves transport rejection without retry', async () => {
    fetchMock.mockRejectedValue(new Error('Network unavailable'));
    await expect(updatePublishedSite(token, { visibility: 'invited' })).rejects.toThrow(
      'Network unavailable',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
