import { describe, expect, it } from 'vitest';

import { FOOTER_COLUMNS } from './nav';

describe('nav, footer discoverability', () => {
  it('links the FAQ from the footer so it is reachable site-wide', () => {
    const hasFaqLink = FOOTER_COLUMNS.some((column) =>
      column.links.some((link) => link.href === '/faq'),
    );
    expect(hasFaqLink).toBe(true);
  });
});
