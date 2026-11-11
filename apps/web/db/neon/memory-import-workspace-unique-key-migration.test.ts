import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0409_memory_import_workspace_unique_key.sql');
const down = read('down/0409_memory_import_workspace_unique_key.down.sql');
const store = readFileSync(
  resolve(import.meta.dirname, '../../lib/memory/import-store.ts'),
  'utf8',
);

const SENTINEL = '00000000-0000-0000-0000-000000000000';

describe('0409 memory import workspace unique key', () => {
  it('adds the workspace to the import key and retires the account-wide index', () => {
    expect(up).toMatch(
      /create unique index if not exists ux_user_memories_user_org_import_key\s+on public\.user_memories \(\s*user_id,\s*source,\s*import_key,\s*\(coalesce\(organization_id, '00000000-0000-0000-0000-000000000000'::uuid\)\)\s*\)\s+where import_key is not null;/,
    );
    expect(up).toContain('drop index if exists public.ux_user_memories_user_import_key;');
    expect(up.indexOf('create unique index')).toBeLessThan(up.indexOf('drop index'));
  });

  it('keeps personal rows, which have no organization, unique among themselves', () => {
    expect(up).toContain(`coalesce(organization_id, '${SENTINEL}'::uuid)`);
    expect(up).not.toMatch(/import_key,\s*organization_id\s*\)/);
  });

  it('runs in one transaction and never rewrites or deletes rows', () => {
    expect(up).toMatch(/^begin;$/m);
    expect(up.trimEnd()).toMatch(/commit;$/);
    expect(up).not.toMatch(/\b(update|delete)\s+(from\s+)?public\.user_memories/i);
    expect(up).not.toMatch(/concurrently/i);
  });

  it('restores the account-wide index, can be refused, and retracts its ledger row', () => {
    expect(down).toMatch(/^begin;$/m);
    expect(down.trimEnd()).toMatch(/commit;$/);
    expect(down).toMatch(
      /create unique index if not exists ux_user_memories_user_import_key\s+on public\.user_memories \(user_id, source, import_key\)\s+where import_key is not null;/,
    );
    expect(down).toContain('drop index if exists public.ux_user_memories_user_org_import_key;');
    expect(down).toContain("where filename = '0409_memory_import_workspace_unique_key.sql';");
    expect(down).toMatch(/WHAT THIS COSTS/);
    expect(down).toMatch(/CAN FAIL/);
    expect(down).not.toMatch(/\bdelete\s+from\s+public\.user_memories/i);
  });

  it('is the index the import insert names as its conflict target', () => {
    expect(store).toContain(`'${SENTINEL}'`);
    expect(store).toContain(
      'on conflict (user_id, source, import_key, (${WORKSPACE_KEY_EXPRESSION})) where import_key is not null',
    );
    expect(store).toContain("coalesce(organization_id, '${PERSONAL_WORKSPACE_KEY}'::uuid)");
  });
});
