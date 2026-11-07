const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import { managedCloudPublishedArtifactVersionPath } from '@agiworkforce/cloud-contracts';
import { republishSiteVersion } from '../service';

const site = { token: 'a'.repeat(24), artifactId: 'untrusted-client-artifact' };

beforeEach(() => jest.resetAllMocks());

describe('mobile version restore', () => {
  it('posts once to the canonical version path without a body or snapshot GET', async () => {
    mockPost.mockResolvedValue({ token: site.token, version: 8 });
    await expect(republishSiteVersion(site, 3)).resolves.toBeUndefined();
    expect(mockPost.mock.calls).toEqual([[managedCloudPublishedArtifactVersionPath(site.token, 3)]]);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it.each([404, 405, 409, 403, 500])('propagates %s without generic Publish fallback', async (status) => {
    const error = Object.assign(new Error('Restore refused'), { status });
    mockPost.mockRejectedValue(error);
    await expect(republishSiteVersion(site, 3)).rejects.toBe(error);
    expect(mockPost.mock.calls).toEqual([[managedCloudPublishedArtifactVersionPath(site.token, 3)]]);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
