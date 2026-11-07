import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { managedCloudPublishedArtifactVersionPath } from '@agiworkforce/cloud-contracts';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { republishArtifactVersion } from './sites-service';

vi.mock('@/lib/client/csrf', () => ({ addCsrfHeaders: vi.fn() }));

const fetchMock = vi.fn<typeof fetch>();
const artifact = { token: 'a'.repeat(24), artifactId: 'untrusted-client-artifact' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(addCsrfHeaders).mockResolvedValue({ 'X-CSRF-Token': 'restore-csrf' });
});
afterEach(() => vi.unstubAllGlobals());

describe('republishArtifactVersion canonical restore', () => {
  it('makes one bodyless credentialed CSRF POST without fetching a snapshot', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await republishArtifactVersion(artifact, 7);
    expect(addCsrfHeaders).toHaveBeenCalledExactlyOnceWith();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      managedCloudPublishedArtifactVersionPath(artifact.token, 7),
      { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': 'restore-csrf' } },
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty('body');
  });

  it.each([404, 405, 409, 403, 500])('does not fall back to Publish after %s', async (status) => {
    fetchMock.mockResolvedValue(Response.json({ error: { message: 'Restore refused' } }, { status }));
    await expect(republishArtifactVersion(artifact, 7)).rejects.toThrow('Restore refused');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      managedCloudPublishedArtifactVersionPath(artifact.token, 7),
    );
  });

  it('reports malformed error bodies without making another request', async () => {
    fetchMock.mockResolvedValue(new Response('not JSON', { status: 405 }));
    await expect(republishArtifactVersion(artifact, 7)).rejects.toThrow('Failed to put that version live');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send a request if CSRF preparation fails', async () => {
    vi.mocked(addCsrfHeaders).mockRejectedValue(new Error('CSRF unavailable'));
    await expect(republishArtifactVersion(artifact, 7)).rejects.toThrow('CSRF unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
