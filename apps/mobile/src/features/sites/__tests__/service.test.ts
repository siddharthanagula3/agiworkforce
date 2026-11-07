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
import {
  clearSiteSharedData,
  deleteSiteAndData,
  listPublishedSites,
  republishSiteVersion,
  unpublishSite,
  type SiteRequestAuthority,
} from '../service';

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

describe('detail request authority', () => {
  function authority() {
    const controller = new AbortController();
    const context: SiteRequestAuthority = {
      accountEpoch: { ownerId: 'owner-1', epoch: 3 },
      signal: controller.signal,
      assertCurrent: jest.fn(() => {
        if (controller.signal.aborted) throw new Error('retired view');
      }),
    };
    const options = { accountEpoch: context.accountEpoch, signal: context.signal,
      auth401Recovery: 'caller-owned' };
    return { controller, context, options };
  }

  it('forwards captured epoch, cancellation and caller-owned 401 recovery for detail reads', async () => {
    const { context, options } = authority();
    mockGet.mockResolvedValue({ artifacts: [] });
    await listPublishedSites(context.signal, context);
    expect(mockGet).toHaveBeenCalledWith('/api/artifacts/publish', options);
    expect(context.assertCurrent).toHaveBeenCalledTimes(1);
  });

  it('forwards authority without changing restore endpoint or supplying content', async () => {
    const { context, options } = authority();
    mockPost.mockResolvedValue({ token: site.token, version: 3 });
    await republishSiteVersion(site, 3, context);
    expect(mockPost.mock.calls).toEqual([[managedCloudPublishedArtifactVersionPath(site.token, 3), undefined, options]]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('keeps ambient delete calling conventions unchanged', async () => {
    mockDelete.mockResolvedValue({ cleared: 1 });
    await deleteSiteAndData(site.token, true);
    expect(mockDelete.mock.calls).toEqual([
      [`/api/artifacts/publish/${site.token}/data`],
      [`/api/artifacts/publish/${site.token}`],
    ]);
  });

  it('refuses retired authority before dispatch', async () => {
    const { context, controller } = authority();
    controller.abort();
    await expect(unpublishSite(site.token, context)).rejects.toThrow('retired view');
    await expect(clearSiteSharedData(site.token, context)).rejects.toThrow('retired view');
    await expect(listPublishedSites(context.signal, context)).rejects.toThrow('retired view');
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('rechecks ownership after a successful clear before deleting the site', async () => {
    const { context, controller, options } = authority();
    let finish!: (value: unknown) => void;
    mockDelete.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const deletion = deleteSiteAndData(site.token, true, context);
    expect(mockDelete).toHaveBeenCalledWith(`/api/artifacts/publish/${site.token}/data`, options);
    controller.abort();
    finish({ cleared: 1 });
    await expect(deletion).rejects.toThrow('retired view');
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
