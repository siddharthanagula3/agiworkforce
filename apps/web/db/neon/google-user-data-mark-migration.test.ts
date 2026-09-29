import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GOOGLE_USER_DATA_CONNECTOR_IDS } from '@/lib/connectors/google-user-data';
import { directoryServerId } from '@/lib/connectors/mcp-directory-targets';

const dir = path.join(process.cwd(), 'db/neon');
const MIGRATION = readdirSync(dir).find((name) =>
  name.endsWith('_conversation_google_user_data.sql'),
);
if (!MIGRATION) throw new Error('the Google user data mark migration is missing');
const sql = readFileSync(path.join(dir, MIGRATION), 'utf8');

function namedIds(): Set<string> {
  const lists = [...sql.matchAll(/any \(array\[([^\]]+)\]\)/g)].map((match) => match[1] ?? '');
  expect(lists.length).toBeGreaterThan(0);
  const sets = lists.map(
    (list) => new Set([...list.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')),
  );
  for (const set of sets) expect([...set].sort()).toEqual([...sets[0]!].sort());
  return sets[0]!;
}

describe('Google user data mark backfill', () => {
  it('names every Google connector and its directory server id', () => {
    const expected = [
      ...GOOGLE_USER_DATA_CONNECTOR_IDS,
      ...GOOGLE_USER_DATA_CONNECTOR_IDS.map(directoryServerId),
    ];
    const named = namedIds();
    for (const id of expected) expect(named, `${id} is not backfilled`).toContain(id);
  });

  it('is safe to run twice: it only touches unmarked conversations', () => {
    expect(sql).toMatch(/where c\.google_user_data_at is null/);
    expect(sql).toMatch(/add column if not exists google_user_data_at/);
  });

  it('is bounded by a statement timeout inside its transaction', () => {
    expect(sql).toMatch(/set local statement_timeout = '\d+min'/);
    expect(sql.indexOf('set local statement_timeout')).toBeLessThan(sql.indexOf('update '));
  });

  it('reads tool evidence from both transcript shapes and from Google-imported project sources', () => {
    expect(sql).toMatch(/m\.metadata -> 'tools'/);
    expect(sql).toMatch(/'toolInvocations' -> 'offered'/);
    expect(sql).toMatch(/external_resource_references/);
  });
});
