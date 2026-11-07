import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { managedCloudPublishedArtifactPath } from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { createRequestAuthority } from '@/lib/identity/request-authority';
import { unpublishArtifact } from './sites-service';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
const token = 'a'.repeat(24);
const uncertainty =
  'This unpublish could not be confirmed. It may have taken effect. Refresh to check before trying again.';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'unpublish-csrf' });
});
afterEach(() => vi.unstubAllGlobals());

describe.each(['ordinary', 'authority'] as const)(
  '%s unpublish receipt (UNRUN source fixtures)',
  (mode) => {
    function authority() {
      return mode === 'ordinary'
        ? undefined
        : createRequestAuthority({
            userId: 'account-a',
            sessionId: 'session-a',
            isCurrent: () => true,
            getToken: async () => 'captured-token',
          });
    }

    function expectSingleDelete() {
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [path, init] = fetchMock.mock.calls[0]!;
      expect(path).toBe(managedCloudPublishedArtifactPath(token));
      expect(init?.method).toBe('DELETE');
      expect(init).not.toHaveProperty('body');
      expect(init?.credentials).toBe(mode === 'ordinary' ? 'include' : 'omit');
      expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('unpublish-csrf');
      expect(new Headers(init?.headers).get('Authorization')).toBe(
        mode === 'ordinary' ? null : 'Bearer captured-token',
      );
    }

    it('accepts the exact success and token without a follow-up request', async () => {
      fetchMock.mockResolvedValue(Response.json({ success: true, token }));
      await expect(unpublishArtifact(token, authority())).resolves.toBeUndefined();
      expect(addCsrfHeaders).toHaveBeenCalledExactlyOnceWith();
      expectSingleDelete();
    });

    it.each(
      [
        null,
        [],
        'receipt',
        {},
        { token },
        { success: true },
        { success: false, token },
        { success: 'true', token },
        { success: 1, token },
        { success: true, token: 'b'.repeat(24) },
        { success: true, token: '' },
        { success: true, token: null },
        { success: true, token: 1 },
      ].map((body) => ({ body })),
    )('reports uncertainty for invalid successful receipt $body', async ({ body }) => {
      fetchMock.mockResolvedValue(Response.json(body));
      await expect(unpublishArtifact(token, authority())).rejects.toThrow(uncertainty);
      expectSingleDelete();
    });

    it.each(['empty', 'malformed', 'unreadable'] as const)(
      'reports uncertainty for a %s success body without replay',
      async (body) => {
        const response =
          body === 'empty' ? new Response(null, { status: 204 }) : new Response('not JSON');
        if (body === 'unreadable')
          vi.spyOn(response, 'json').mockRejectedValue(new Error('body unavailable'));
        fetchMock.mockResolvedValue(response);
        await expect(unpublishArtifact(token, authority())).rejects.toThrow(uncertainty);
        expectSingleDelete();
      },
    );

    it.each([403, 404, 405, 409, 500])(
      'preserves non-2xx error handling for %s without fallback',
      async (status) => {
        fetchMock.mockResolvedValue(
          Response.json({ error: { message: 'Unpublish refused' } }, { status }),
        );
        await expect(unpublishArtifact(token, authority())).rejects.toThrow('Unpublish refused');
        expectSingleDelete();
      },
    );

    it('preserves the non-JSON error fallback', async () => {
      fetchMock.mockResolvedValue(new Response('not JSON', { status: 500 }));
      await expect(unpublishArtifact(token, authority())).rejects.toThrow(
        'Failed to unpublish artifact',
      );
      expectSingleDelete();
    });

    it('does not dispatch when CSRF preparation fails', async () => {
      vi.mocked(addCsrfHeaders).mockRejectedValue(new Error('CSRF unavailable'));
      await expect(unpublishArtifact(token, authority())).rejects.toThrow('CSRF unavailable');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  },
);
