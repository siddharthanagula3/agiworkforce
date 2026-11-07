import { describe, expect, it } from 'vitest';
import {
  MANAGED_CLOUD_ARTIFACT_INDEX_PATH,
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  ManagedCloudArtifactIndexResponseSchema,
  ManagedCloudPublishedArtifactDataResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  ManagedCloudPublishedArtifactDetailResponseSchema,
  ManagedCloudPublishedArtifactLookupQuerySchema,
  ManagedCloudPublishedArtifactLookupResponseSchema,
  ManagedCloudPublishedArtifactPublishResponseSchema,
  managedCloudPublishedArtifactLookupPath,
  ManagedCloudPublishedArtifactUpdateRequestSchema,
  ManagedCloudPublishedArtifactUpdateReceiptSchema,
  ManagedCloudPublishedArtifactUpdateResponseSchema,
  managedCloudArtifactIndexQueryString,
  managedCloudPublishedArtifactDataPath,
  managedCloudPublishedArtifactPath,
  managedCloudPublishedArtifactVersionsPath,
} from '../artifact-index';

// UNRUN: source-authored publication receipt fixtures.
describe('publication acknowledgement contract', () => {
  const receipt = {
    artifactId: 'artifact-1', token: 'a'.repeat(24),
    shareUrl: `https://example.test/shared-artifact/${'a'.repeat(24)}`,
    visibility: 'invited', version: 1, publishedAt: '2026-11-07T00:00:00Z',
    title: 'Page', kind: 'html', sandboxed: true, workspace: null,
  };

  it.each(['public', 'organization', 'invited'])('preserves acknowledged audience %s', (visibility) => {
    expect(ManagedCloudPublishedArtifactPublishResponseSchema.parse({ ...receipt, visibility }))
      .toEqual({ ...receipt, visibility });
  });

  it.each([
    { artifactId: undefined }, { token: 'invalid' }, { visibility: undefined },
    { visibility: 'future' }, { version: 0 }, { version: Number.MAX_SAFE_INTEGER + 1 },
    { version: -1 }, { version: 1.5 },
    { workspace: undefined },
    { shareUrl: 'not a URL' }, { shareUrl: 'javascript:alert(1)' },
    { shareUrl: `https://example.test/shared-artifact/${'b'.repeat(24)}` },
    { shareUrl: `${receipt.shareUrl}?redirect=other` },
    { shareUrl: `${receipt.shareUrl}#fragment` },
  ])('rejects incomplete or mismatched receipt %p', (change) => {
    expect(ManagedCloudPublishedArtifactPublishResponseSchema.safeParse({ ...receipt, ...change }).success)
      .toBe(false);
  });
});

// UNRUN: WEB-PUBLICATION-QUOTA-ADMISSION-01 strict update acknowledgement boundary.
describe('publication update receipt contract', () => {
  const receipt = {
    token: 'a'.repeat(24), shareUrl: `https://example.test/shared-artifact/${'a'.repeat(24)}`,
    visibility: 'invited', title: 'Page', organizationId: null, updatedAt: '2026-11-07T00:00:00Z',
  };

  it.each(['public', 'organization', 'invited'])('accepts complete %s acknowledgements', (visibility) => {
    const body = { ...receipt, visibility, organizationId: visibility === 'organization' ? 'org-1' : null };
    expect(ManagedCloudPublishedArtifactUpdateReceiptSchema.parse(body)).toEqual(body);
  });

  it.each([
    ...Object.keys(receipt).map((field) => ({ [field]: undefined })),
    { token: 'invalid' }, { visibility: 'future' }, { organizationId: 1 },
    { shareUrl: 'javascript:alert(1)' }, { shareUrl: '/shared-artifact/' + receipt.token },
    { shareUrl: `https://example.test/shared-artifact/${'b'.repeat(24)}` },
    { shareUrl: `${receipt.shareUrl}?query=1` }, { shareUrl: `${receipt.shareUrl}#fragment` },
    { shareUrl: `${receipt.shareUrl}/` },
    { shareUrl: receipt.shareUrl.replace('https://', 'https://user:password@') },
  ])('rejects invalid update receipt %j', (change) => {
    expect(ManagedCloudPublishedArtifactUpdateReceiptSchema.safeParse({ ...receipt, ...change }).success)
      .toBe(false);
  });

  it('preserves the existing general update response contract for other clients', () => {
    const legacy = { ...receipt, token: 'tok_1', shareUrl: 'https://example.test/shared-artifact/tok_1' };
    expect(ManagedCloudPublishedArtifactUpdateResponseSchema.parse(legacy)).toEqual(legacy);
    expect(ManagedCloudPublishedArtifactUpdateReceiptSchema.safeParse(legacy).success).toBe(false);
  });
});

// UNRUN: source-authored exact publication lookup contract fixtures.
describe('exact publication lookup contract', () => {
  it('normalizes trim-only text identity and encodes reserved characters as query data', () => {
    const artifactId = 'Artifact/Upper?x=1+#片';
    const path = managedCloudPublishedArtifactLookupPath(` ${artifactId} `);
    const url = new URL(path, 'https://example.test');
    expect(url.pathname).toBe('/api/artifacts/publish/lookup');
    expect([...url.searchParams]).toEqual([['artifactId', artifactId]]);
    expect(ManagedCloudPublishedArtifactLookupQuerySchema.parse({ artifactId: 'a'.repeat(200) }))
      .toEqual({ artifactId: 'a'.repeat(200) });
  });

  it.each(['', '  ', 'a'.repeat(201)])('rejects invalid request identity %s', (artifactId) => {
    expect(() => managedCloudPublishedArtifactLookupPath(artifactId)).toThrow();
  });

  it('requires an explicit null and workspace for confirmed absence', () => {
    expect(ManagedCloudPublishedArtifactLookupResponseSchema.parse({ artifact: null, workspace: null }))
      .toEqual({ artifact: null, workspace: null });
    for (const response of [{}, { artifacts: [] }, { workspace: null }, { artifact: null }]) {
      expect(ManagedCloudPublishedArtifactLookupResponseSchema.safeParse(response).success).toBe(false);
    }
  });
});

describe('artifact index contract (apps/web/app/api/artifacts/index/route.ts)', () => {
  it('accepts the row the route emits, nulls included', () => {
    const response = {
      artifacts: [
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          conversationId: '11111111-1111-4111-8111-111111111111',
          messageId: '22222222-2222-4222-8222-222222222222',
          title: null,
          type: 'html',
          language: null,
          projectId: null,
          createdAt: '2026-09-13T11:00:00.000Z',
        },
      ],
    };
    expect(ManagedCloudArtifactIndexResponseSchema.safeParse(response).success).toBe(true);
  });

  it('rejects a row carrying content, because the index deliberately stores none', () => {
    const parsed = ManagedCloudArtifactIndexResponseSchema.safeParse({
      artifacts: [
        {
          id: 'a1',
          conversationId: 'c1',
          messageId: 'm1',
          title: 'Invoice',
          type: 'html',
          language: 'html',
          projectId: null,
          createdAt: '2026-09-13T11:00:00.000Z',
          content: '<h1>Invoice</h1>',
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(Object.keys(parsed.data.artifacts[0]!)).not.toContain('content');
    }
  });

  it('builds only the query parameters the route reads', () => {
    expect(managedCloudArtifactIndexQueryString()).toBe('');
    expect(managedCloudArtifactIndexQueryString({ limit: 50 })).toBe('?limit=50');
    expect(managedCloudArtifactIndexQueryString({ projectId: 'p 1' })).toBe('?projectId=p+1');
  });

  it('names the routes it speaks to', () => {
    expect(MANAGED_CLOUD_ARTIFACT_INDEX_PATH).toBe('/api/artifacts/index');
    expect(MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH).toBe('/api/artifacts/publish');
  });
});

describe('published artifact contract (apps/web/app/api/artifacts/publish/route.ts)', () => {
  it('accepts the listing row with its share url and sandbox flag', () => {
    const response = {
      artifacts: [
        {
          token: 'tok_1',
          artifactId: 'a1',
          title: 'Invoice page',
          kind: 'html',
          language: 'html',
          contentChars: 42,
          visibility: 'public',
          createdAt: '2026-09-13T11:00:00.000Z',
          updatedAt: '2026-09-13T11:00:00.000Z',
          shareUrl: 'https://agiworkforce.com/a/tok_1',
          sandboxed: true,
        },
      ],
    };
    expect(ManagedCloudPublishedArtifactListResponseSchema.safeParse(response).success).toBe(true);
  });

  it('rejects a row without a share url, the only thing a reader can open', () => {
    expect(
      ManagedCloudPublishedArtifactListResponseSchema.safeParse({
        artifacts: [
          {
            token: 'tok_1',
            artifactId: 'a1',
            title: 'Invoice page',
            kind: 'html',
            language: null,
            contentChars: 42,
            visibility: 'public',
            createdAt: '2026-09-13T11:00:00.000Z',
            updatedAt: '2026-09-13T11:00:00.000Z',
            sandboxed: false,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('published site contract (apps/web/app/api/artifacts/publish/[token]/route.ts)', () => {
  it('reads a listing from a server that predates the Sites fields', () => {
    const parsed = ManagedCloudPublishedArtifactListResponseSchema.parse({
      artifacts: [
        {
          token: 'tok_1',
          artifactId: 'a1',
          title: 'Invoice page',
          kind: 'html',
          language: null,
          contentChars: 42,
          visibility: 'public',
          createdAt: '2026-09-13T11:00:00.000Z',
          updatedAt: '2026-09-13T11:00:00.000Z',
          shareUrl: 'https://agiworkforce.com/shared-artifact/tok_1',
          sandboxed: true,
        },
      ],
    });
    expect(parsed.workspace).toBeNull();
    expect(parsed.artifacts[0]).toMatchObject({ conversationId: null, version: 0 });
  });

  it('accepts a rename, an audience change, or both, and nothing else', () => {
    const accepts = (body: unknown) =>
      ManagedCloudPublishedArtifactUpdateRequestSchema.safeParse(body).success;
    expect(accepts({ title: 'Scoreboard' })).toBe(true);
    expect(accepts({ visibility: 'organization' })).toBe(true);
    expect(accepts({ title: 'Scoreboard', visibility: 'public' })).toBe(true);
    expect(accepts({})).toBe(false);
    expect(accepts({ title: '   ' })).toBe(false);
    expect(accepts({ title: 'x'.repeat(301) })).toBe(false);
    expect(accepts({ visibility: 'private' })).toBe(false);
  });

  it('builds every path under the one published-artifact root', () => {
    expect(managedCloudPublishedArtifactPath('a/b')).toBe(
      `${MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH}/a%2Fb`,
    );
    expect(managedCloudPublishedArtifactVersionsPath('tok')).toBe(
      `${MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH}/tok/versions`,
    );
    expect(managedCloudPublishedArtifactDataPath('tok')).toBe(
      `${MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH}/tok/data`,
    );
  });

  it('describes owner data with shared entries and a count of personal ones', () => {
    expect(
      ManagedCloudPublishedArtifactDataResponseSchema.safeParse({
        supported: true,
        shared: {
          entries: [{ key: 'scores', bytes: 9, preview: '[1]', truncated: false, updatedAt: 'x' }],
          entryCount: 1,
          totalBytes: 9,
          limitBytes: 20971520,
        },
        ownPersonalEntryCount: 0,
      }).success,
    ).toBe(true);
  });
});

// UNRUN: additive owner inventory metadata contract fixtures.
describe('published artifact pagination compatibility', () => {
  it('keeps missing legacy metadata unknown rather than inventing exhaustion', () => {
    expect(ManagedCloudPublishedArtifactListResponseSchema.parse({ artifacts: [] }).pageInfo)
      .toBeUndefined();
  });

  it('distinguishes an exhausted page from one with a continuation', () => {
    expect(ManagedCloudPublishedArtifactListResponseSchema.parse({
      artifacts: [], pageInfo: { nextCursor: null },
    }).pageInfo).toEqual({ nextCursor: null });
    expect(ManagedCloudPublishedArtifactListResponseSchema.parse({
      artifacts: [], pageInfo: { nextCursor: 'opaque-cursor' },
    }).pageInfo).toEqual({ nextCursor: 'opaque-cursor' });
  });

  it.each([null, {}, { nextCursor: '' }, { nextCursor: 1 }, { nextCursor: 'a'.repeat(2049) }])(
    'rejects malformed page metadata rather than treating it as exhausted', (pageInfo) => {
      expect(ManagedCloudPublishedArtifactListResponseSchema.safeParse({ artifacts: [], pageInfo }).success)
        .toBe(false);
    },
  );

  it('requires a direct detail artifact instead of accepting a list response', () => {
    expect(ManagedCloudPublishedArtifactDetailResponseSchema.safeParse({ artifacts: [], workspace: null }).success)
      .toBe(false);
  });
});
