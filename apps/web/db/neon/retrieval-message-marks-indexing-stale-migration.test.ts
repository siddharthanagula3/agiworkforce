import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0410_retrieval_message_marks_indexing_stale.sql');
const down = read('down/0410_retrieval_message_marks_indexing_stale.down.sql');
const original = read('0202_retrieval_index.sql');

const header = (sql: string) =>
  /create or replace function public\.retrieval_track_message\(\)\s+returns trigger\s+language plpgsql\s+security definer\s+set search_path = public/.test(
    sql,
  );

describe('0410 retrieval message marks indexing stale', () => {
  it('keeps the signature and security of the 0202 function', () => {
    expect(header(original)).toBe(true);
    expect(header(up)).toBe(true);
    expect(header(down)).toBe(true);
  });

  it('marks a conversation document stale from indexed, indexing and failed', () => {
    expect(up).toContain("and status in ('indexed', 'indexing', 'failed');");
    expect(up).toContain("set status = 'stale', next_attempt_at = now(), updated_at = now()");
    expect(up).toContain('where conversation_id = new.conversation_id');
  });

  it('does not touch the trigger, which still points at the same function', () => {
    expect(up).not.toMatch(/create trigger|drop trigger/i);
    expect(original).toContain('execute function public.retrieval_track_message()');
  });

  it('runs in one transaction and changes no data', () => {
    expect(up).toMatch(/^begin;$/m);
    expect(up.trimEnd()).toMatch(/commit;$/);
    expect(up).not.toMatch(/\balter table\b|\bdelete from\b/i);
  });

  it('restores the 0202 body and retracts its ledger row', () => {
    expect(down).toContain("and status in ('indexed', 'failed');");
    expect(down).not.toContain("'indexing'");
    expect(down).toContain("where filename = '0410_retrieval_message_marks_indexing_stale.sql';");
    expect(down).toMatch(/WHAT THIS COSTS/);
    expect(down).toMatch(/^begin;$/m);
    expect(down.trimEnd()).toMatch(/commit;$/);
  });
});
