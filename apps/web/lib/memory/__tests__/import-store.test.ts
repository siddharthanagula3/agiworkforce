import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { persistImportedMemories } from '../import-store';
import { normalizeMemoryKey } from '../import-parser';

const VICTIM = 'user_victim';
const SOURCE = 'imported:chatgpt';

function legacyDerivedId(userId: string, source: string, normalizedKey: string): string {
  const hex = createHash('sha256')
    .update(`agi-imported-memory-v1\0${userId}\0${source}\0${normalizedKey}`)
    .digest('hex')
    .slice(0, 32);
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const uuidHex = `${hex.slice(0, 12)}5${hex.slice(13, 16)}${variant}${hex.slice(17)}`;
  return `${uuidHex.slice(0, 8)}-${uuidHex.slice(8, 12)}-${uuidHex.slice(12, 16)}-${uuidHex.slice(16, 20)}-${uuidHex.slice(20)}`;
}

const query = vi.fn();

function issued(): { sql: string; params: unknown[] } {
  const call = query.mock.calls.find((entry) => String(entry[0]).includes('insert into'));
  expect(call).toBeDefined();
  return { sql: String(call![0]), params: (call![1] ?? []) as unknown[] };
}

function batch(): Array<Record<string, unknown>> {
  return JSON.parse(String(issued().params[1])) as Array<Record<string, unknown>>;
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue([]);
});

describe('persistImportedMemories row identity', () => {
  it('sends no row id, so the database mints a random one no caller can predict', async () => {
    await persistImportedMemories(
      { query },
      {
        userId: VICTIM,
        items: ['Likes dark mode'],
        source: SOURCE,
      },
    );

    const { sql } = issued();
    expect(sql).toContain('insert into user_memories (user_id, content, source, import_key)');
    expect(sql).not.toMatch(/insert into user_memories[^)]*\bid\b/);
    for (const entry of batch()) {
      expect(entry).not.toHaveProperty('id');
    }
  });

  it('never writes the id an attacker could derive from the owner, source and text', async () => {
    const content = 'Lives in Bengaluru';
    await persistImportedMemories({ query }, { userId: VICTIM, items: [content], source: SOURCE });

    const guessable = legacyDerivedId(VICTIM, SOURCE, normalizeMemoryKey(content));
    expect(JSON.stringify(batch())).not.toContain(guessable);
    expect(JSON.stringify(issued().params)).not.toContain(guessable);
  });

  it('dedupes on a key scoped to the owner and source, not on a global row id', async () => {
    await persistImportedMemories(
      { query },
      {
        userId: VICTIM,
        items: ['Likes dark mode', 'likes   DARK mode'],
        source: SOURCE,
      },
    );

    const { sql } = issued();
    expect(sql).toContain(
      'on conflict (user_id, source, import_key) where import_key is not null do nothing',
    );
    expect(sql).not.toContain('on conflict (id)');
    expect(batch()).toEqual([{ content: 'Likes dark mode', importKey: 'likes dark mode' }]);
  });

  it('reports a repeat import as skipped rather than inserted', async () => {
    query.mockResolvedValueOnce([]);
    const result = await persistImportedMemories(
      { query },
      {
        userId: VICTIM,
        items: ['Likes dark mode'],
        source: SOURCE,
      },
    );
    expect(result).toEqual({ memories: [], insertedCount: 0, skippedDuplicateCount: 1 });
  });

  it('writes nothing when every item is empty', async () => {
    const result = await persistImportedMemories(
      { query },
      {
        userId: VICTIM,
        items: ['   ', ''],
        source: SOURCE,
      },
    );
    expect(query).not.toHaveBeenCalled();
    expect(result).toEqual({ memories: [], insertedCount: 0, skippedDuplicateCount: 0 });
  });
});
