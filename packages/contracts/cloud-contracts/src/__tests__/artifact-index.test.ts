import { describe, expect, it } from 'vitest';
import {
  MANAGED_CLOUD_ARTIFACT_INDEX_PATH,
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  ManagedCloudArtifactIndexResponseSchema,
  ManagedCloudPublishedArtifactDataResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  ManagedCloudPublishedArtifactUpdateRequestSchema,
  managedCloudArtifactIndexQueryString,
  managedCloudPublishedArtifactDataPath,
  managedCloudPublishedArtifactPath,
  managedCloudPublishedArtifactVersionsPath,
} from '../artifact-index';

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
