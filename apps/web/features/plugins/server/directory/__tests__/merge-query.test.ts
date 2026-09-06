import { describe, expect, it } from 'vitest';

import { builtInDirectoryEntry, mergeDirectoryEntries } from '../merge';
import { computeDirectoryStats, queryPluginDirectory, selectDirectoryEntries } from '../query';
import { directoryEntry } from './fixtures';

const BUILT_IN = builtInDirectoryEntry(
  {
    id: 'engineering-pack',
    name: 'Engineering Pack',
    version: '1.0.0',
    description: 'Code review and debugging.',
    category: 'Developer',
    publisher: { id: 'agi', name: 'AGI Workforce', kind: 'first-party', url: null },
    source: 'builtin',
    status: 'published',
    webInstallable: true,
    declaredSkills: ['code-review'],
    requiredConnectors: [],
    capabilities: [],
    permissions: [],
    examplePrompts: [],
    versions: [],
    distribution: null,
    integrity: { sha256: null, signature: null, signatureAlgorithm: null },
    homepageUrl: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  7,
);

const ENTRIES = [
  BUILT_IN,
  directoryEntry(),
  directoryEntry({
    id: 'sales',
    slug: 'sales',
    name: 'Sales',
    description: 'Pipeline reviews for Cowork.',
    publisher: { id: 'partner', name: 'Partner', kind: 'partner', url: null },
    sourceFacet: 'partner',
    verified: true,
    installs: null,
    installCount: undefined,
    worksWith: ['cowork'],
    webInstallable: false,
    declaredSkills: [],
    sourceLocation: null,
    repositoryUrl: null,
    runtime: {
      webInstallable: false,
      inspected: false,
      components: directoryEntry().runtime.components,
      note: 'cowork',
    },
  }),
  directoryEntry({
    id: 'code-review',
    slug: 'code-review',
    name: 'Code Review',
    description: 'Review pull requests.',
    publisher: { id: 'anthropic', name: 'Anthropic', kind: 'third-party', url: null },
    installs: 5000,
    installCount: 5000,
    verified: true,
    sourceLocation: {
      repositoryUrl: 'https://github.com/anthropics/claude-plugins-official',
      ref: 'main',
      sha: null,
      path: 'plugins/code-review',
    },
  }),
];

describe('builtInDirectoryEntry', () => {
  it('marks first-party packs verified, web-only and inspected', () => {
    expect(BUILT_IN).toMatchObject({
      sourceFacet: 'builtin',
      verified: true,
      installs: 7,
      installCount: 7,
      worksWith: ['web'],
      runtime: { webInstallable: true, inspected: true, note: null },
      installCommand: null,
    });
  });
});

describe('mergeDirectoryEntries', () => {
  it('keeps the first layer on an id clash and on a source repository clash', () => {
    const duplicateId = directoryEntry({ id: 'engineering-pack', slug: 'engineering-pack' });
    const duplicateSource = directoryEntry({ id: 'adobe-copy', slug: 'adobe-copy' });
    const merged = mergeDirectoryEntries(
      [BUILT_IN],
      [directoryEntry(), duplicateId, duplicateSource],
    );
    expect(merged.entries.map((entry) => entry.id)).toEqual([
      'engineering-pack',
      'adobe-for-creativity',
    ]);
    expect(merged.duplicatesDropped).toBe(2);
  });
});

describe('computeDirectoryStats', () => {
  it('counts verified, facets and works-with over the whole directory', () => {
    expect(computeDirectoryStats(ENTRIES)).toEqual({
      totalPlugins: 4,
      verified: 4,
      bySource: { builtin: 1, partner: 1, marketplace: 2 },
      byWorksWith: { 'claude-code': 2, cowork: 1, web: 3 },
    });
  });
});

describe('selectDirectoryEntries', () => {
  it('sorts by installs by default with names as the tie breaker', () => {
    expect(selectDirectoryEntries(ENTRIES, {}).map((entry) => entry.id)).toEqual([
      'code-review',
      'adobe-for-creativity',
      'engineering-pack',
      'sales',
    ]);
  });

  it('sorts by name when asked', () => {
    expect(selectDirectoryEntries(ENTRIES, { sort: 'name' }).map((entry) => entry.id)).toEqual([
      'adobe-for-creativity',
      'code-review',
      'engineering-pack',
      'sales',
    ]);
  });

  it('filters by facet, works-with, verified and category', () => {
    expect(selectDirectoryEntries(ENTRIES, { source: 'partner' }).map((e) => e.id)).toEqual([
      'sales',
    ]);
    expect(selectDirectoryEntries(ENTRIES, { worksWith: 'cowork' }).map((e) => e.id)).toEqual([
      'sales',
    ]);
    expect(selectDirectoryEntries(ENTRIES, { verified: false })).toEqual([]);
    expect(selectDirectoryEntries(ENTRIES, { category: 'developer' }).map((e) => e.id)).toEqual([
      'engineering-pack',
    ]);
  });

  it('ranks search hits by name, then publisher, then skills and description', () => {
    expect(selectDirectoryEntries(ENTRIES, { search: 'code' }).map((e) => e.id)).toEqual([
      'code-review',
      'engineering-pack',
    ]);
    expect(selectDirectoryEntries(ENTRIES, { search: 'adobe' }).map((e) => e.id)).toEqual([
      'adobe-for-creativity',
    ]);
    expect(selectDirectoryEntries(ENTRIES, { search: 'nothing-matches' })).toEqual([]);
  });
});

describe('queryPluginDirectory', () => {
  it('pages with a numeric cursor and reports stats for the whole directory', () => {
    const first = queryPluginDirectory(ENTRIES, { limit: 2 });
    expect(first.entries.map((entry) => entry.id)).toEqual(['code-review', 'adobe-for-creativity']);
    expect(first.total).toBe(4);
    expect(first.nextCursor).toBe('2');
    expect(first.stats.totalPlugins).toBe(4);

    const second = queryPluginDirectory(ENTRIES, { limit: 2, cursor: first.nextCursor });
    expect(second.entries.map((entry) => entry.id)).toEqual(['engineering-pack', 'sales']);
    expect(second.nextCursor).toBeNull();
  });

  it('clamps the limit to the ceiling and treats a bad cursor as the start', () => {
    const page = queryPluginDirectory(ENTRIES, { limit: 1_000, cursor: 'abc' });
    expect(page.entries).toHaveLength(4);
    expect(page.nextCursor).toBeNull();
  });
});
