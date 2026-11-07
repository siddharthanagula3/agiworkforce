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
  updatePublishedSite,
  SiteMutationUncertainError,
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
    mockDelete.mockResolvedValueOnce({ cleared: 1 }).mockResolvedValueOnce({ success: true, token: site.token });
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

// UNRUN: decoded successful receipts, request binding, and transport error preservation.
describe.each([false, true])('mobile mutation receipts with authority=%s', (withAuthority) => {
  function context() {
    return withAuthority ? {
      accountEpoch: { ownerId: 'owner-1', epoch: 3 },
      signal: new AbortController().signal,
      assertCurrent: jest.fn(),
    } : undefined;
  }
  const updated = {
    token: site.token, shareUrl: `https://example.test/shared-artifact/${site.token}`,
    title: 'Policy title', visibility: 'invited', organizationId: null, updatedAt: '2026-11-07',
  };

  it.each([null, {}, { success: false, token: site.token }, { success: true, token: 'other' }])(
    'rejects unconfirmed delete %p without replay or reconciliation', async (raw) => {
      mockDelete.mockResolvedValue(raw);
      await expect(unpublishSite(site.token, context())).rejects.toBeInstanceOf(SiteMutationUncertainError);
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockGet).not.toHaveBeenCalled();
    },
  );

  it('accepts a matching deletion receipt', async () => {
    mockDelete.mockResolvedValue({ success: true, token: site.token });
    await expect(unpublishSite(site.token, context())).resolves.toBeUndefined();
  });

  it.each([null, {}, { token: 'other', version: 8 }, { token: site.token, version: 0 },
    { token: site.token, version: Number.MAX_SAFE_INTEGER + 1 }])('rejects unconfirmed restore %p', async (raw) => {
    mockPost.mockResolvedValue(raw);
    await expect(republishSiteVersion(site, 3, context())).rejects.toBeInstanceOf(SiteMutationUncertainError);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('captures restore identity and accepts a different persisted version', async () => {
    const mutableSite = { ...site };
    mockPost.mockImplementation(async () => {
      mutableSite.token = 'other';
      return { token: site.token, version: 8 };
    });
    await expect(republishSiteVersion(mutableSite, 3, context())).resolves.toBeUndefined();
  });

  it.each([{}, { visibility: 'public' }, { token: 'b'.repeat(24) },
    { shareUrl: 'invalid' }, { shareUrl: `https://example.test/shared-artifact/${'b'.repeat(24)}` }])(
    'rejects invalid or mismatched updates %p', async (change) => {
      mockPatch.mockResolvedValue(Object.keys(change).length ? { ...updated, ...change } : {});
      await expect(updatePublishedSite(site.token, { visibility: 'invited' }, context()))
        .rejects.toBeInstanceOf(SiteMutationUncertainError);
      expect(mockPatch).toHaveBeenCalledTimes(1);
      expect(mockGet).not.toHaveBeenCalled();
    },
  );

  it('binds an immutable requested audience while allowing policy-transformed title', async () => {
    const change = { visibility: 'invited' as const, title: 'Requested title' };
    mockPatch.mockImplementation(async (_path: string, sent: unknown) => {
      expect(sent).not.toBe(change);
      Object.assign(change, { visibility: 'public' });
      return updated;
    });
    await expect(updatePublishedSite(site.token, change, context())).resolves.toEqual(updated);
  });

  it.each(['delete', 'restore', 'update'] as const)('preserves %s transport rejection', async (operation) => {
    const failure = new SyntaxError('JSON decode failed in transport');
    mockDelete.mockRejectedValue(failure);
    mockPost.mockRejectedValue(failure);
    mockPatch.mockRejectedValue(failure);
    const result = operation === 'delete' ? unpublishSite(site.token, context())
      : operation === 'restore' ? republishSiteVersion(site, 3, context())
      : updatePublishedSite(site.token, { visibility: 'invited' }, context());
    await expect(result).rejects.toBe(failure);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it.each(['delete', 'restore', 'update'] as const)('preserves %s non-success errors without receipt wrapping', async (operation) => {
    const failure = Object.assign(new Error('Request refused'), { status: 403 });
    mockDelete.mockRejectedValue(failure);
    mockPost.mockRejectedValue(failure);
    mockPatch.mockRejectedValue(failure);
    const result = operation === 'delete' ? unpublishSite(site.token, context())
      : operation === 'restore' ? republishSiteVersion(site, 3, context())
      : updatePublishedSite(site.token, { visibility: 'invited' }, context());
    await expect(result).rejects.toBe(failure);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it.each(['delete', 'restore', 'update'] as const)('rejects %s completion after authority retirement', async (operation) => {
    if (!withAuthority) return;
    let current = true;
    const authority = { ...context()!, assertCurrent: () => { if (!current) throw new Error('retired'); } };
    mockDelete.mockImplementation(async () => { current = false; return { success: true, token: site.token }; });
    mockPost.mockImplementation(async () => { current = false; return { token: site.token, version: 8 }; });
    mockPatch.mockImplementation(async () => { current = false; return updated; });
    const result = operation === 'delete' ? unpublishSite(site.token, authority)
      : operation === 'restore' ? republishSiteVersion(site, 3, authority)
      : updatePublishedSite(site.token, { visibility: 'invited' }, authority);
    await expect(result).rejects.toThrow('retired');
  });
});
