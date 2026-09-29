import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GOOGLE_USER_DATA_CONNECTOR_IDS } from '@/lib/connectors/google-user-data';
import { directoryServerId } from '@/lib/connectors/mcp-directory-targets';

const dir = path.join(process.cwd(), 'db/neon');
const MIGRATION = readdirSync(dir).find((name) =>
  name.endsWith('_conversation_google_user_data.sql'),
);
if (!MIGRATION) throw new Error('the Google user data mark migration is missing');
const sql = readFileSync(path.join(dir, MIGRATION), 'utf8').replace(/--.*$/gm, '');

const script = readFileSync(
  path.join(process.cwd(), '../../scripts/backfill-google-user-data-mark.mjs'),
  'utf8',
);

function scriptIds(): Set<string> {
  const block = /GOOGLE_CONNECTOR_SERVER_IDS = Object\.freeze\(\[([^\]]+)\]\)/.exec(script);
  expect(block).not.toBeNull();
  return new Set([...(block?.[1] ?? '').matchAll(/'([^']+)'/g)].map((match) => match[1] ?? ''));
}

describe('Google user data mark migration', () => {
  it('only adds a nullable column, so the table lock lasts milliseconds', () => {
    expect(sql).toMatch(/add column if not exists google_user_data_at timestamptz;/);
    expect(sql).not.toMatch(/\bdefault\b/i);
    expect(sql).not.toMatch(/^\s*update\b/im);
  });

  it('fails fast instead of queueing chats behind a contended lock', () => {
    expect(sql).toMatch(/set local lock_timeout = '5s'/);
    expect(sql.indexOf('set local lock_timeout')).toBeLessThan(sql.indexOf('alter table'));
  });
});

describe('Google user data mark backfill', () => {
  it('names every Google connector and its directory server id', () => {
    const expected = [
      ...GOOGLE_USER_DATA_CONNECTOR_IDS,
      ...GOOGLE_USER_DATA_CONNECTOR_IDS.map(directoryServerId),
    ];
    const named = scriptIds();
    for (const id of expected) expect(named, `${id} is not backfilled`).toContain(id);
  });
});
