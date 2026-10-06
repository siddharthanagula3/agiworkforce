import { describe, expect, it } from 'vitest';

import { FOOTER_COLUMNS } from './nav';

const FOOTER_HREFS_BEFORE_REGROUP = [
  '/about',
  '/blog',
  '/byok',
  '/careers',
  '/changelog',
  '/chrome-extension',
  '/cli',
  '/contact',
  '/desktop',
  '/docs',
  '/download',
  '/enterprise',
  '/faq',
  '/features/agents',
  '/features/artifacts',
  '/features/deep-research',
  '/features/memory',
  '/features/projects',
  '/help',
  '/local',
  '/mobile',
  '/pricing',
  '/providers',
  '/skills',
  '/status',
  '/support',
  '/teams',
  '/vscode-extension',
  '/web',
];
const MAX_LINKS_PER_COLUMN = 7;

const footerHrefs = () =>
  FOOTER_COLUMNS.flatMap((column) => column.links.map((link) => link.href as string));

describe('nav, footer discoverability', () => {
  it('links the FAQ from the footer so it is reachable site-wide', () => {
    const hasFaqLink = FOOTER_COLUMNS.some((column) =>
      column.links.some((link) => link.href === '/faq'),
    );
    expect(hasFaqLink).toBe(true);
  });

  it('keeps every destination the footer linked before the columns were regrouped', () => {
    expect([...new Set(footerHrefs())].sort()).toEqual(FOOTER_HREFS_BEFORE_REGROUP);
  });

  it('caps every column so the five read as one balanced block', () => {
    for (const column of FOOTER_COLUMNS) {
      expect(column.links.length, column.title).toBeLessThanOrEqual(MAX_LINKS_PER_COLUMN);
    }
  });

  it('never links the same destination twice within one column', () => {
    for (const column of FOOTER_COLUMNS) {
      const hrefs = column.links.map((link) => link.href);
      expect(new Set(hrefs).size, column.title).toBe(hrefs.length);
    }
  });
});
