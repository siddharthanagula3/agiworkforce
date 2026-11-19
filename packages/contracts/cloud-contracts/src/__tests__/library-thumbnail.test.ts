import { describe, expect, it } from 'vitest';
import { LibraryThumbnailPathParamsSchema, libraryThumbnailPath } from '../library-thumbnail';

const ASSET_ID = '22222222-2222-4222-8222-222222222222';

describe('library thumbnail contract', () => {
  it('builds the thumbnail path of a file', () => {
    expect(libraryThumbnailPath(ASSET_ID)).toBe(`/api/files/${ASSET_ID}/thumbnail`);
  });

  it('accepts a file id in any letter case', () => {
    expect(LibraryThumbnailPathParamsSchema.parse({ id: ASSET_ID.toUpperCase() })).toEqual({
      id: ASSET_ID.toUpperCase(),
    });
  });

  it.each(['not-a-uuid', '', `${ASSET_ID}/thumbnail`, `${ASSET_ID} `, '../secret'])(
    'refuses the id %j',
    (id) => {
      expect(LibraryThumbnailPathParamsSchema.safeParse({ id }).success).toBe(false);
    },
  );
});
