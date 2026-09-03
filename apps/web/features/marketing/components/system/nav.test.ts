import { describe, expect, it } from 'vitest';

import { FOOTER_COLUMNS } from './nav';

describe('nav — footer discoverability', () => {
  it('links the FAQ from the footer so it is reachable site-wide', () => {
    const allLinks = FOOTER_COLUMNS.flatMap((column) => column.links);
    expect(allLinks.some((link) => link.href === '/faq')).toBe(true);
  });
});
