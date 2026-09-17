import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const sql = readFileSync(resolve(neonDir, '0219_conversation_drafts.sql'), 'utf8');
const down = readFileSync(resolve(neonDir, 'down/0219_conversation_drafts.down.sql'), 'utf8');

describe('0219 a synced composer draft', () => {
  it('adds the text and the clock two devices settle on', () => {
    expect(sql).toMatch(/add column if not exists draft text/i);
    expect(sql).toMatch(/add column if not exists draft_updated_at timestamptz/i);
  });

  it('adds no table, so it adds no RLS policy, erasure entry or export entry', () => {
    expect(sql).not.toMatch(/create table/i);
    expect(sql).not.toMatch(/create policy/i);
  });

  it('says in the schema that a draft is separate from what orders the sidebar', () => {
    expect(sql).toMatch(/comment on column public\.web_conversations\.draft_updated_at/i);
    expect(sql).toMatch(/independent of updated_at/i);
  });

  it('reverses by dropping both columns and nothing else', () => {
    expect(down).toMatch(/drop column if exists draft_updated_at/i);
    expect(down).toMatch(/drop column if exists draft/i);
    expect(down).not.toMatch(/delete from public\.web_conversations/i);
    expect(down).toContain("where filename = '0219_conversation_drafts.sql'");
  });
});
