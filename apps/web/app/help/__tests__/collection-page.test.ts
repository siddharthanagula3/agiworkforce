import { describe, expect, it } from 'vitest';

import { supportCollectionIndex } from '../collections';
import { generateStaticParams } from '../collections/[id]/page';

describe('the /help/collections/[id] route', () => {
  it('has one static page per collection in the index', () => {
    const { collections } = supportCollectionIndex();
    expect(collections.length).toBeGreaterThan(0);
    expect(generateStaticParams()).toEqual(
      collections.map((collection) => ({ id: collection.id })),
    );
  });
});
