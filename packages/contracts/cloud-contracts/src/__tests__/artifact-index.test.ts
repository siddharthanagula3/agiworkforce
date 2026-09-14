import { describe, expect, it } from 'vitest';
import {
  MANAGED_CLOUD_ARTIFACT_INDEX_PATH,
  MANAGED_CLOUD_PUBLISHED_ARTIFACTS_PATH,
  ManagedCloudArtifactIndexResponseSchema,
  ManagedCloudPublishedArtifactListResponseSchema,
  managedCloudArtifactIndexQueryString,
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
