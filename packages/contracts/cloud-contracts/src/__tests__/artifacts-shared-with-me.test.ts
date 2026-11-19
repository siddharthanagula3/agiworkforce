import { describe, expect, it } from 'vitest';
import {
  ARTIFACTS_SHARED_WITH_ME_PATH,
  ArtifactsSharedWithMeResponseSchema,
  artifactsSharedWithMePath,
} from '../artifacts-shared-with-me';
import {
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_CURSOR_MAX_CHARS,
  MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS,
} from '../artifact-index';

const ITEM = {
  token: 'tok_shared_1',
  title: 'Wedding page',
  kind: 'html',
  updatedAt: '2026-10-20T10:00:00.000Z',
};

describe('artifacts shared with me contract', () => {
  it('builds the first page path and a cursor path', () => {
    expect(artifactsSharedWithMePath()).toBe('/api/artifacts/shared-with-me');
    expect(artifactsSharedWithMePath(null)).toBe(ARTIFACTS_SHARED_WITH_ME_PATH);
    expect(artifactsSharedWithMePath('a+b/c=')).toBe(
      '/api/artifacts/shared-with-me?cursor=a%2Bb%2Fc%3D',
    );
  });

  it('reads a page and keeps only the four item fields', () => {
    const page = ArtifactsSharedWithMeResponseSchema.parse({
      items: [{ ...ITEM, ownerEmail: 'owner@example.com' }],
      hasMore: true,
      nextCursor: 'next',
      emailVerified: true,
    });
    expect(page).toEqual({ items: [ITEM], hasMore: true, nextCursor: 'next', emailVerified: true });
  });

  it('refuses a page that leaves out what the screens rely on', () => {
    const page = { items: [ITEM], hasMore: false, nextCursor: null, emailVerified: true };
    for (const key of Object.keys(page)) {
      const partial: Record<string, unknown> = { ...page };
      delete partial[key];
      expect(ArtifactsSharedWithMeResponseSchema.safeParse(partial).success).toBe(false);
    }
    expect(
      ArtifactsSharedWithMeResponseSchema.safeParse({ ...page, items: [{ ...ITEM, token: '' }] })
        .success,
    ).toBe(false);
  });

  it('bounds the page size and the cursor', () => {
    const page = { items: [ITEM], hasMore: false, nextCursor: null, emailVerified: true };
    expect(
      ArtifactsSharedWithMeResponseSchema.safeParse({
        ...page,
        items: Array.from(
          { length: MANAGED_CLOUD_PUBLISHED_ARTIFACT_PAGE_MAX_ITEMS + 1 },
          () => ITEM,
        ),
      }).success,
    ).toBe(false);
    expect(
      ArtifactsSharedWithMeResponseSchema.safeParse({
        ...page,
        nextCursor: 'x'.repeat(MANAGED_CLOUD_PUBLISHED_ARTIFACT_CURSOR_MAX_CHARS + 1),
      }).success,
    ).toBe(false);
    expect(ArtifactsSharedWithMeResponseSchema.safeParse({ ...page, nextCursor: '' }).success).toBe(
      false,
    );
  });
});
