import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { RETENTION_MATRIX } from '@/lib/services/deletion-manifest';

/**
 * A derived store is only safe to lose when something can rebuild it. The
 * deletion manifest decides which tables are derived; the architecture note
 * has to say, for each of them, how it is regenerated and how its source's
 * deletion reaches it, or a derived table exists that nobody can rebuild.
 */

const REPO_ROOT = path.resolve(__dirname, '../../../../..');
const DOCUMENT = 'docs/architecture/derived-state.md';
const SECTION = '## 2. The stored derived values';
const COLUMNS = [
  'Value',
  'Derives from',
  'Regeneration',
  'Version marker',
  'Invalidation',
  'Deletion propagation',
];

function sectionRows(): string[][] {
  const source = readFileSync(path.join(REPO_ROOT, DOCUMENT), 'utf8');
  const start = source.indexOf(SECTION);
  if (start < 0) return [];
  const rest = source.slice(start + SECTION.length);
  const body = rest.slice(0, rest.search(/\n## /) < 0 ? undefined : rest.search(/\n## /));
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|[\s|:-]+\|$/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim().replace(/^`|`$/g, '')),
    );
}

describe('every derived table says how it is rebuilt', () => {
  const derivedTables = RETENTION_MATRIX.filter(
    (entry) => entry.dataClass === 'derived_content' && entry.kind === 'table',
  ).map((entry) => entry.store);
  const [header, ...rows] = sectionRows();

  it('reads the derived tables from the manifest and the table from the document', () => {
    expect(derivedTables.length).toBeGreaterThanOrEqual(3);
    expect(header).toEqual(COLUMNS);
  });

  it('gives each derived table exactly one row, and no row to anything else', () => {
    expect(rows.map((row) => row[0]).sort()).toEqual([...derivedTables].sort());
  });

  it('fills every column of every row', () => {
    const blank = rows.flatMap((row) =>
      COLUMNS.flatMap((column, index) =>
        (row[index] ?? '') === '' ? [`${row[0]}: ${column}`] : [],
      ),
    );

    expect(blank).toEqual([]);
  });
});
