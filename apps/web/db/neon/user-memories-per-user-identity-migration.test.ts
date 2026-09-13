import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UP = 'db/neon/0189_user_memories_per_user_identity.sql';
const DOWN = 'db/neon/down/0189_user_memories_per_user_identity.down.sql';

const load = (relativePath: string) => readFile(join(process.cwd(), relativePath), 'utf8');

describe('per-user memory identity migration (0189)', () => {
  it('replaces the global row key with one scoped to the owner', async () => {
    const sql = await load(UP);
    expect(sql).toMatch(/drop constraint if exists user_memories_pkey/i);
    expect(sql).toMatch(/add constraint user_memories_pkey primary key \(user_id, id\)/i);
    expect(sql).not.toMatch(/primary key \(id\)/i);
  });

  it('dedupes an import on a key unique per owner and source instead of a derived row id', async () => {
    const sql = await load(UP);
    expect(sql).toMatch(/add column if not exists import_key text/i);
    expect(sql).toMatch(
      /create unique index if not exists ux_user_memories_user_import_key\s+on public\.user_memories \(user_id, source, import_key\)\s+where import_key is not null/i,
    );
  });

  it('backfills rows that were already imported so a later import still recognises them', async () => {
    const sql = await load(UP);
    expect(sql).toMatch(/update public\.user_memories/i);
    expect(sql).toContain("where source like 'imported:%'");
    expect(sql).toContain("lower(regexp_replace(btrim(content), '\\s+', ' ', 'g'))");
    expect(sql).toMatch(/row_number\(\) over \(\s*partition by user_id, source/i);
  });

  it('never rewrites content or resurrects a deleted row', async () => {
    const sql = await load(UP);
    expect(sql).not.toMatch(/set\s+content\s*=/i);
    expect(sql).not.toMatch(/set\s+is_deleted\s*=/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.user_memories/i);
  });

  it('reverses every object it touches and retracts its own ledger row', async () => {
    const sql = await load(DOWN);
    expect(sql).toMatch(/^begin;$/im);
    expect(sql.trimEnd()).toMatch(/commit;$/i);
    expect(sql).toMatch(/add constraint user_memories_pkey primary key \(id\)/i);
    expect(sql).toMatch(/drop index if exists public\.ux_user_memories_user_import_key/i);
    expect(sql).toMatch(/alter table public\.user_memories\s+drop column if exists import_key/i);
    expect(sql).toContain(
      "delete from public.schema_migrations\n  where filename = '0189_user_memories_per_user_identity.sql'",
    );
  });

  it('says what the reversal costs, including that it can be refused', async () => {
    const sql = await load(DOWN);
    expect(sql).toMatch(/WHAT THIS COSTS/);
    expect(sql).toMatch(/CAN FAIL/i);
  });
});
