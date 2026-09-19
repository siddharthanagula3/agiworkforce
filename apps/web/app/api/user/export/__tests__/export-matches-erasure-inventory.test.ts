import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('server-only', () => ({}));

import { USER_SCOPED_TABLES } from '@/lib/server/account-erasure';
import { UNEXPORTED_USER_TABLES } from '../route';

const source = ['app/api/user/export/route.ts', 'lib/server/restricted-user-export-reader.ts']
  .map((path) => readFileSync(join(process.cwd(), path), 'utf8'))
  .join('\n');

// The tables the export actually reads, taken from the queries rather than from
// a hand-kept list: a section whose SQL names the wrong table is a section that
// exports nothing, and the ledger swallows the error.
function tablesTheExportReads(): Set<string> {
  const tables = new Set<string>();
  for (const query of source.matchAll(/sql: `([\s\S]*?)`/g)) {
    for (const reference of (query[1] as string).matchAll(
      /\b(?:from|join)\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi,
    )) {
      tables.add((reference[1] as string).toLowerCase());
    }
  }
  return tables;
}

const DECIDE =
  'Export it by adding a section to ADDITIONAL_EXPORT_SECTIONS, or add it to UNEXPORTED_USER_TABLES with the reason it is withheld.';

// Erasure and access are two halves of one right. A table the product deletes
// on request but never shows is a right-of-access gap, and it opens silently:
// a new user-scoped table joins USER_SCOPED_TABLES because it must be erased,
// and nothing forces anyone to decide whether it must also be exported.
describe('the export accounts for every table account erasure deletes', () => {
  it('reads or deliberately withholds each user-scoped table', () => {
    const read = tablesTheExportReads();
    const unaccounted = USER_SCOPED_TABLES.map(({ table }) => table).filter(
      (table) => !read.has(table) && !(table in UNEXPORTED_USER_TABLES),
    );

    expect(
      unaccounted,
      `Account erasure deletes ${unaccounted.join(', ')}, and the export neither reads it nor declares it withheld. ${DECIDE}`,
    ).toEqual([]);
  });

  it('keeps no stale entry in the withheld list', () => {
    const erased = new Set(USER_SCOPED_TABLES.map(({ table }) => table));
    const stale = Object.keys(UNEXPORTED_USER_TABLES).filter((table) => !erased.has(table));

    expect(
      stale,
      `UNEXPORTED_USER_TABLES still withholds ${stale.join(', ')}, which account erasure no longer deletes. Drop the entry so the list only ever answers for tables that exist.`,
    ).toEqual([]);
  });

  it('does not withhold a table it also reads', () => {
    const read = tablesTheExportReads();
    const contradictory = Object.keys(UNEXPORTED_USER_TABLES).filter((table) => read.has(table));

    expect(
      contradictory,
      `UNEXPORTED_USER_TABLES claims ${contradictory.join(', ')} is withheld while the export reads it. Remove the entry; a reason nobody honours is worse than none.`,
    ).toEqual([]);
  });

  it('gives a reason for every table it withholds', () => {
    for (const [table, reason] of Object.entries(UNEXPORTED_USER_TABLES)) {
      expect(reason.trim(), `${table} is withheld without saying why`).not.toBe('');
    }
  });
});
