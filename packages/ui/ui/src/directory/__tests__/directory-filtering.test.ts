import { describe, expect, it } from 'vitest';

import {
  buildFileTree,
  countActiveFilters,
  formatInstallCount,
  matchesDirectoryFilters,
  matchesDirectorySearch,
  matchesDirectorySource,
  selectDirectoryEntries,
  sortDirectoryEntries,
  toggleFilterValue,
} from '../filtering';
import { INSTALL_COUNT_FLOOR } from '../constants';
import type { DirectoryEntry } from '../types';

function entry(patch: Partial<DirectoryEntry> & { id: string; name: string }): DirectoryEntry {
  return { description: '', ...patch };
}

const alpha = entry({
  id: 'alpha',
  name: 'Alpha',
  publisher: 'AGI',
  description: 'Reads spreadsheets',
  installCount: 500,
  updatedAt: '2026-01-01T00:00:00.000Z',
  sourceId: 'agi',
  facets: { status: ['installed'], category: ['Data'] },
});
const beta = entry({
  id: 'beta',
  name: 'beta',
  publisher: 'Community',
  description: 'Writes docs',
  installCount: 900,
  updatedAt: '2026-06-01T00:00:00.000Z',
  sourceId: 'community',
  facets: { status: ['not-installed'], category: ['Productivity'] },
});
const gamma = entry({ id: 'gamma', name: 'Gamma', description: 'No metadata' });

describe('matchesDirectorySearch', () => {
  it('matches name, publisher and description case insensitively', () => {
    expect(matchesDirectorySearch(alpha, 'ALPHA')).toBe(true);
    expect(matchesDirectorySearch(alpha, 'agi')).toBe(true);
    expect(matchesDirectorySearch(alpha, 'spreadsheets')).toBe(true);
    expect(matchesDirectorySearch(alpha, 'docs')).toBe(false);
  });

  it('treats a blank query as a match', () => {
    expect(matchesDirectorySearch(gamma, '   ')).toBe(true);
  });
});

describe('matchesDirectoryFilters', () => {
  it('ors within a group and ands across groups', () => {
    expect(matchesDirectoryFilters(alpha, { status: ['installed', 'not-installed'] })).toBe(true);
    expect(matchesDirectoryFilters(alpha, { status: ['installed'], category: ['Data'] })).toBe(
      true,
    );
    expect(
      matchesDirectoryFilters(alpha, { status: ['installed'], category: ['Productivity'] }),
    ).toBe(false);
  });

  it('excludes an entry with no facet for a selected group', () => {
    expect(matchesDirectoryFilters(gamma, { status: ['installed'] })).toBe(false);
  });

  it('ignores an empty group selection', () => {
    expect(matchesDirectoryFilters(gamma, { status: [] })).toBe(true);
  });
});

describe('matchesDirectorySource', () => {
  it('passes everything when no chip is active', () => {
    expect(matchesDirectorySource(gamma, null)).toBe(true);
  });

  it('keeps only entries from the active chip', () => {
    expect(matchesDirectorySource(alpha, 'agi')).toBe(true);
    expect(matchesDirectorySource(beta, 'agi')).toBe(false);
  });
});

describe('sortDirectoryEntries', () => {
  const entries = [beta, gamma, alpha];

  it('sorts by name ignoring case', () => {
    expect(sortDirectoryEntries(entries, 'name').map((item) => item.id)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('sorts newest first and pushes undated entries last', () => {
    expect(sortDirectoryEntries(entries, 'updated').map((item) => item.id)).toEqual([
      'beta',
      'alpha',
      'gamma',
    ]);
  });

  it('sorts by install count and pushes countless entries last', () => {
    expect(sortDirectoryEntries(entries, 'popular').map((item) => item.id)).toEqual([
      'beta',
      'alpha',
      'gamma',
    ]);
  });

  it('does not mutate the input', () => {
    const input = [beta, alpha];
    sortDirectoryEntries(input, 'name');
    expect(input.map((item) => item.id)).toEqual(['beta', 'alpha']);
  });
});

describe('selectDirectoryEntries', () => {
  it('applies search, filters, source and sort together', () => {
    const result = selectDirectoryEntries({
      entries: [alpha, beta, gamma],
      query: 'e',
      selection: { status: ['not-installed'] },
      sourceId: 'community',
      sort: 'name',
    });
    expect(result.map((item) => item.id)).toEqual(['beta']);
  });
});

describe('toggleFilterValue', () => {
  it('adds a value then removes the group once empty', () => {
    const added = toggleFilterValue({}, 'status', 'installed');
    expect(added).toEqual({ status: ['installed'] });
    expect(toggleFilterValue(added, 'status', 'installed')).toEqual({});
  });

  it('replaces the value when the group is exclusive and clears it on a second toggle', () => {
    const web = toggleFilterValue({}, 'works-with', 'web', true);
    expect(web).toEqual({ 'works-with': ['web'] });
    expect(toggleFilterValue(web, 'works-with', 'claude-code', true)).toEqual({
      'works-with': ['claude-code'],
    });
    expect(toggleFilterValue(web, 'works-with', 'web', true)).toEqual({});
  });

  it('counts every selected value across groups', () => {
    expect(countActiveFilters({ status: ['a', 'b'], type: ['c'] })).toBe(3);
  });
});

describe('formatInstallCount', () => {
  it('hides counts below the floor and undefined counts', () => {
    expect(formatInstallCount(undefined)).toBeNull();
    expect(formatInstallCount(INSTALL_COUNT_FLOOR - 1)).toBeNull();
  });

  it('renders exact, thousand and million scales', () => {
    expect(formatInstallCount(INSTALL_COUNT_FLOOR)).toBe('10');
    expect(formatInstallCount(1200)).toBe('1.2K');
    expect(formatInstallCount(12_000)).toBe('12K');
    expect(formatInstallCount(2_400_000)).toBe('2.4M');
    expect(formatInstallCount(2_000_000)).toBe('2M');
  });
});

describe('buildFileTree', () => {
  it('derives folder rows from nested paths without duplicating them', () => {
    const tree = buildFileTree([
      { path: 'SKILL.md', content: '' },
      { path: 'fonts/Bold.ttf', content: '' },
      { path: 'fonts/Regular.ttf', content: '' },
    ]);
    expect(tree).toEqual([
      { path: 'SKILL.md', label: 'SKILL.md', depth: 0, kind: 'file' },
      { path: 'fonts', label: 'fonts', depth: 0, kind: 'folder' },
      { path: 'fonts/Bold.ttf', label: 'Bold.ttf', depth: 1, kind: 'file' },
      { path: 'fonts/Regular.ttf', label: 'Regular.ttf', depth: 1, kind: 'file' },
    ]);
  });

  it('returns a single row for a one file skill', () => {
    expect(buildFileTree([{ path: 'SKILL.md', content: 'body' }])).toHaveLength(1);
  });
});
