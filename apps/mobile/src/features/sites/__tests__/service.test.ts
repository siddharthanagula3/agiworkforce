const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/services/api', () => ({
  ApiHttpError: jest.requireActual('@/services/apiErrors').ApiHttpError,
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}));

import { ApiHttpError } from '@/services/api';
import {
  managedCloudPublishedArtifactPath,
  managedCloudPublishedArtifactVersionPath,
} from '@agiworkforce/cloud-contracts';
import {
  clearSiteSharedData,
  deleteSiteAndData,
  listPublishedSitesPage,
  readPublishedSite,
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
    expect(mockPost.mock.calls).toEqual([
      [managedCloudPublishedArtifactVersionPath(site.token, 3)],
    ]);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPatch).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it.each([404, 405, 409, 403, 500])(
    'propagates %s without generic Publish fallback',
    async (status) => {
      const error = Object.assign(new Error('Restore refused'), { status });
      mockPost.mockRejectedValue(error);
      await expect(republishSiteVersion(site, 3)).rejects.toBe(error);
      expect(mockPost.mock.calls).toEqual([
        [managedCloudPublishedArtifactVersionPath(site.token, 3)],
      ]);
      expect(mockGet).not.toHaveBeenCalled();
      expect(mockPatch).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    },
  );
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
    const options = {
      accountEpoch: context.accountEpoch,
      signal: context.signal,
      auth401Recovery: 'caller-owned',
    };
    return { controller, context, options };
  }

  it('forwards captured epoch, cancellation and caller-owned 401 recovery for detail reads', async () => {
    const { context, options } = authority();
    mockGet.mockResolvedValue({ artifacts: [] });
    await listPublishedSitesPage(null, context.signal, context);
    expect(mockGet).toHaveBeenCalledWith('/api/artifacts/publish', options);
    expect(context.assertCurrent).toHaveBeenCalledTimes(2);
  });

  it('forwards authority without changing restore endpoint or supplying content', async () => {
    const { context, options } = authority();
    mockPost.mockResolvedValue({ token: site.token, version: 3 });
    await republishSiteVersion(site, 3, context);
    expect(mockPost.mock.calls).toEqual([
      [managedCloudPublishedArtifactVersionPath(site.token, 3), undefined, options],
    ]);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('keeps ambient delete calling conventions unchanged', async () => {
    mockDelete
      .mockResolvedValueOnce({ cleared: 1 })
      .mockResolvedValueOnce({ success: true, token: site.token });
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
    await expect(listPublishedSitesPage(null, context.signal, context)).rejects.toThrow(
      'retired view',
    );
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('rechecks ownership after a successful clear before deleting the site', async () => {
    const { context, controller, options } = authority();
    let finish!: (value: unknown) => void;
    mockDelete.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
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
    return withAuthority
      ? {
          accountEpoch: { ownerId: 'owner-1', epoch: 3 },
          signal: new AbortController().signal,
          assertCurrent: jest.fn(),
        }
      : undefined;
  }
  const updated = {
    token: site.token,
    shareUrl: `https://example.test/shared-artifact/${site.token}`,
    title: 'Policy title',
    visibility: 'invited',
    organizationId: null,
    updatedAt: '2026-11-07',
  };

  it.each([null, {}, { success: false, token: site.token }, { success: true, token: 'other' }])(
    'rejects unconfirmed delete %p without replay or reconciliation',
    async (raw) => {
      mockDelete.mockResolvedValue(raw);
      await expect(unpublishSite(site.token, context())).rejects.toBeInstanceOf(
        SiteMutationUncertainError,
      );
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockGet).not.toHaveBeenCalled();
    },
  );

  it('accepts a matching deletion receipt', async () => {
    mockDelete.mockResolvedValue({ success: true, token: site.token });
    await expect(unpublishSite(site.token, context())).resolves.toBeUndefined();
  });

  it.each([
    null,
    {},
    { token: 'other', version: 8 },
    { token: site.token, version: 0 },
    { token: site.token, version: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects unconfirmed restore %p', async (raw) => {
    mockPost.mockResolvedValue(raw);
    await expect(republishSiteVersion(site, 3, context())).rejects.toBeInstanceOf(
      SiteMutationUncertainError,
    );
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

  it.each([
    {},
    { visibility: 'public' },
    { token: 'b'.repeat(24) },
    { shareUrl: 'invalid' },
    { shareUrl: `https://example.test/shared-artifact/${'b'.repeat(24)}` },
  ])('rejects invalid or mismatched updates %p', async (change) => {
    mockPatch.mockResolvedValue(Object.keys(change).length ? { ...updated, ...change } : {});
    await expect(
      updatePublishedSite(site.token, { visibility: 'invited' }, context()),
    ).rejects.toBeInstanceOf(SiteMutationUncertainError);
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('binds an immutable requested audience while allowing policy-transformed title', async () => {
    const change = { visibility: 'invited' as const, title: 'Requested title' };
    mockPatch.mockImplementation(async (_path: string, sent: unknown) => {
      expect(sent).not.toBe(change);
      Object.assign(change, { visibility: 'public' });
      return updated;
    });
    await expect(updatePublishedSite(site.token, change, context())).resolves.toEqual(updated);
  });

  it.each(['delete', 'restore', 'update'] as const)(
    'preserves %s transport rejection',
    async (operation) => {
      const failure = new SyntaxError('JSON decode failed in transport');
      mockDelete.mockRejectedValue(failure);
      mockPost.mockRejectedValue(failure);
      mockPatch.mockRejectedValue(failure);
      const result =
        operation === 'delete'
          ? unpublishSite(site.token, context())
          : operation === 'restore'
            ? republishSiteVersion(site, 3, context())
            : updatePublishedSite(site.token, { visibility: 'invited' }, context());
      await expect(result).rejects.toBe(failure);
      expect(mockGet).not.toHaveBeenCalled();
    },
  );

  it.each(['delete', 'restore', 'update'] as const)(
    'preserves %s non-success errors without receipt wrapping',
    async (operation) => {
      const failure = Object.assign(new Error('Request refused'), { status: 403 });
      mockDelete.mockRejectedValue(failure);
      mockPost.mockRejectedValue(failure);
      mockPatch.mockRejectedValue(failure);
      const result =
        operation === 'delete'
          ? unpublishSite(site.token, context())
          : operation === 'restore'
            ? republishSiteVersion(site, 3, context())
            : updatePublishedSite(site.token, { visibility: 'invited' }, context());
      await expect(result).rejects.toBe(failure);
      expect(mockGet).not.toHaveBeenCalled();
    },
  );

  it.each(['delete', 'restore', 'update'] as const)(
    'rejects %s completion after authority retirement',
    async (operation) => {
      if (!withAuthority) return;
      let current = true;
      const authority = {
        ...context()!,
        assertCurrent: () => {
          if (!current) throw new Error('retired');
        },
      };
      mockDelete.mockImplementation(async () => {
        current = false;
        return { success: true, token: site.token };
      });
      mockPost.mockImplementation(async () => {
        current = false;
        return { token: site.token, version: 8 };
      });
      mockPatch.mockImplementation(async () => {
        current = false;
        return updated;
      });
      const result =
        operation === 'delete'
          ? unpublishSite(site.token, authority)
          : operation === 'restore'
            ? republishSiteVersion(site, 3, authority)
            : updatePublishedSite(site.token, { visibility: 'invited' }, authority);
      await expect(result).rejects.toThrow('retired');
    },
  );
});

// UNRUN: exact owner detail reads are independent of collection coverage.
describe('mobile exact publication detail', () => {
  const artifact = {
    ...site,
    conversationId: null,
    title: 'Older publication',
    kind: 'html',
    language: 'html',
    contentChars: 12,
    version: 1,
    visibility: 'public',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    shareUrl: `https://example.test/shared-artifact/${site.token}`,
    sandboxed: true,
  };
  const path = managedCloudPublishedArtifactPath(site.token);

  it.each([null, { memberCount: 0 }, { memberCount: 4 }])(
    'reads the exact token with workspace %p without consulting the collection',
    async (workspace) => {
      const signal = new AbortController().signal;
      mockGet.mockImplementation(async (requested: string) => {
        if (requested === path) return { artifact, workspace };
        throw new Error('Collection unavailable');
      });
      await expect(readPublishedSite(site.token, signal)).resolves.toEqual({
        site: artifact,
        workspace,
      });
      expect(mockGet.mock.calls).toEqual([[path, { signal }]]);
    },
  );

  it('uses the canonical encoded path without a local token grammar', async () => {
    const token = 'token/with?reserved#characters';
    mockGet.mockRejectedValue(new ApiHttpError('Missing', 404));
    await expect(readPublishedSite(token)).resolves.toBeNull();
    expect(mockGet.mock.calls).toEqual([
      [managedCloudPublishedArtifactPath(token), { signal: undefined }],
    ]);
    expect(mockGet.mock.calls[0]?.[0]).toBe(
      '/api/artifacts/publish/token%2Fwith%3Freserved%23characters',
    );
  });

  it.each([
    {},
    { artifacts: [artifact] },
    { artifact: null },
    { artifact: { ...artifact, token: 'b'.repeat(24) } },
    { artifact: { ...artifact, contentChars: -1 } },
    { artifact, workspace: { memberCount: -1 } },
  ])('rejects wrong or malformed detail %p', async (raw) => {
    mockGet.mockResolvedValue(raw);
    await expect(readPublishedSite(site.token)).rejects.toThrow();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('maps only an actual HTTP 404 to absence', async () => {
    mockGet.mockRejectedValue(new ApiHttpError('Missing', 404));
    await expect(readPublishedSite(site.token)).resolves.toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it.each([
    new ApiHttpError('Unauthorized', 401),
    new ApiHttpError('Forbidden', 403),
    new ApiHttpError('Rate limited', 429),
    new ApiHttpError('Failed', 500),
    new Error('Network unavailable'),
    new SyntaxError('Invalid JSON'),
    Object.assign(new Error('Not an HTTP error'), { status: 404 }),
  ])('preserves other failures without retry or fallback: %p', async (failure) => {
    mockGet.mockRejectedValue(failure);
    await expect(readPublishedSite(site.token)).rejects.toBe(failure);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  function authority() {
    const controller = new AbortController();
    const context: SiteRequestAuthority = {
      accountEpoch: { ownerId: 'owner-1', epoch: 3 },
      signal: controller.signal,
      assertCurrent: jest.fn(() => {
        if (controller.signal.aborted) throw new Error('retired exact read');
      }),
    };
    return { context, controller };
  }

  it('forwards captured authority and checks a successful response', async () => {
    const { context } = authority();
    mockGet.mockResolvedValue({ artifact, workspace: null });
    await expect(
      readPublishedSite(site.token, new AbortController().signal, context),
    ).resolves.toEqual({ site: artifact, workspace: null });
    expect(mockGet.mock.calls).toEqual([
      [
        path,
        {
          accountEpoch: context.accountEpoch,
          signal: context.signal,
          auth401Recovery: 'caller-owned',
        },
      ],
    ]);
    expect(context.assertCurrent).toHaveBeenCalledTimes(2);
  });

  it('refuses retired authority before dispatch', async () => {
    const { context, controller } = authority();
    controller.abort();
    await expect(readPublishedSite(site.token, undefined, context)).rejects.toThrow(
      'retired exact read',
    );
    expect(mockGet).not.toHaveBeenCalled();
  });

  it.each(['success', 'malformed', 'error', '404'] as const)(
    'rejects a deferred %s after authority retirement before interpreting it',
    async (outcome) => {
      const { context, controller } = authority();
      let resolve!: (value: unknown) => void;
      let reject!: (error: unknown) => void;
      mockGet.mockImplementation(
        () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          }),
      );
      const pending = readPublishedSite(site.token, undefined, context);
      controller.abort();
      if (outcome === 'success') resolve({ artifact, workspace: null });
      else if (outcome === 'malformed') resolve({});
      else
        reject(outcome === '404' ? new ApiHttpError('Missing', 404) : new Error('Network failed'));
      await expect(pending).rejects.toThrow('retired exact read');
      expect(mockGet).toHaveBeenCalledTimes(1);
    },
  );
});

// UNRUN: bounded single-page reads, legacy coverage and opaque cursors.
describe('mobile publication pages', () => {
  const artifact = {
    token: 'a'.repeat(24),
    artifactId: 'art-1',
    conversationId: null,
    title: 'Site',
    kind: 'html',
    language: 'html',
    contentChars: 12,
    version: 1,
    visibility: 'public',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-01',
    shareUrl: `https://example.test/shared-artifact/${'a'.repeat(24)}`,
    sandboxed: true,
  };

  it('preserves backend order, workspace metadata and an opaque encoded cursor', async () => {
    const cursor = 'older+/=?& #';
    const olderUpdated = { ...artifact, token: 'b'.repeat(24), updatedAt: '2026-09-01' };
    mockGet.mockResolvedValue({
      artifacts: [olderUpdated, artifact],
      workspace: { memberCount: 4 },
      pageInfo: { nextCursor: 'next+/=' },
    });
    await expect(listPublishedSitesPage(cursor)).resolves.toEqual({
      sites: [olderUpdated, artifact],
      workspaceMemberCount: 4,
      nextCursor: 'next+/=',
    });
    expect(mockGet.mock.calls).toEqual([
      ['/api/artifacts/publish?cursor=older%2B%2F%3D%3F%26+%23', { signal: undefined }],
    ]);
  });

  it('keeps missing first-page metadata unknown rather than terminal', async () => {
    mockGet.mockResolvedValue({ artifacts: [] });
    await expect(listPublishedSitesPage()).resolves.toEqual({
      sites: [],
      workspaceMemberCount: null,
      nextCursor: undefined,
    });
  });

  it.each([
    {},
    { pageInfo: {} },
    { pageInfo: { nextCursor: '' } },
    { pageInfo: { nextCursor: 'same' } },
  ])('rejects unconfirmed continuation metadata %p', async (metadata) => {
    mockGet.mockResolvedValue({ artifacts: [artifact], ...metadata });
    await expect(listPublishedSitesPage('same')).rejects.toThrow();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'x'.repeat(2049)])(
    'rejects out-of-bounds outgoing cursor before dispatch',
    async (cursor) => {
      await expect(listPublishedSitesPage(cursor)).rejects.toThrow();
      expect(mockGet).not.toHaveBeenCalled();
    },
  );

  it('accepts the canonical page and cursor boundary without traversing', async () => {
    const artifacts = Array.from({ length: 200 }, (_, i) => ({ ...artifact, token: String(i) }));
    mockGet.mockResolvedValue({ artifacts, pageInfo: { nextCursor: 'y'.repeat(2048) } });
    await expect(listPublishedSitesPage('x'.repeat(2048))).resolves.toEqual({
      sites: artifacts,
      workspaceMemberCount: null,
      nextCursor: 'y'.repeat(2048),
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it.each([
    { artifacts: Array.from({ length: 201 }, (_, i) => ({ ...artifact, token: String(i) })) },
    { artifacts: [artifact, artifact] },
    { artifacts: [], pageInfo: { nextCursor: 'x'.repeat(2049) } },
  ])('rejects oversized, duplicate-key or invalid metadata pages %p', async (raw) => {
    mockGet.mockResolvedValue(raw);
    await expect(listPublishedSitesPage()).rejects.toThrow();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale successful response before parsing it', async () => {
    let current = true;
    const authority: SiteRequestAuthority = {
      accountEpoch: { ownerId: 'owner-1', epoch: 3 },
      signal: new AbortController().signal,
      assertCurrent: () => {
        if (!current) throw new Error('retired');
      },
    };
    mockGet.mockImplementation(async () => {
      current = false;
      return {};
    });
    await expect(listPublishedSitesPage(null, undefined, authority)).rejects.toThrow('retired');
  });
});
