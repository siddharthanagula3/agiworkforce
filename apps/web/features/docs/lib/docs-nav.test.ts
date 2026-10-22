import { describe, expect, it } from 'vitest';
import { docsRelated, type DocsNavGroup } from './docs-nav';

const groups: readonly DocsNavGroup[] = [
  { id: 'overview', label: 'Documentation', links: [{ href: '/docs', title: 'Overview' }] },
  {
    id: 'account',
    label: 'Account',
    links: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ href: `/help/${id}`, title: id })),
  },
  { id: 'solo', label: 'Solo', links: [{ href: '/help/solo', title: 'solo' }] },
];

describe('docsRelated', () => {
  it('takes the articles that follow in the same group', () => {
    expect(docsRelated(groups, '/help/b').map((link) => link.href)).toEqual([
      '/help/c',
      '/help/d',
      '/help/e',
    ]);
  });

  it('wraps around the group and never returns the article itself', () => {
    expect(docsRelated(groups, '/help/d').map((link) => link.href)).toEqual([
      '/help/e',
      '/help/a',
      '/help/b',
    ]);
  });

  it('returns nothing for a group of one, the overview, or an unknown page', () => {
    expect(docsRelated(groups, '/help/solo')).toEqual([]);
    expect(docsRelated(groups, '/docs')).toEqual([]);
    expect(docsRelated(groups, '/help/missing')).toEqual([]);
  });
});
