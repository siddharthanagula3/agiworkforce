import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { reversalErrors, unreversedObjects } from '../../../../scripts/check-neon-migrations.mjs';

const MIGRATION = '0156_message_thread_variants.sql';

const migration = fs.readFileSync(path.resolve(import.meta.dirname, MIGRATION), 'utf8');
const reversal = fs.readFileSync(
  path.resolve(import.meta.dirname, 'down', MIGRATION.replace(/\.sql$/, '.down.sql')),
  'utf8',
);
const ddl = migration.replace(/--[^\n]*/g, '');

describe('message thread variants migration', () => {
  it('is marked as not yet applied, like every other unapplied draft', () => {
    expect(migration).toContain('NOT YET APPLIED');
  });

  it('hangs the tree off web_messages itself rather than a second table', () => {
    expect(migration).toContain(
      'add column if not exists parent_id uuid references public.web_messages(id)',
    );
  });

  it('leaves the parent pointer at NO ACTION so an unspliced delete fails loudly', () => {
    const parentPointer = migration.slice(migration.indexOf('add column if not exists parent_id'));
    expect(parentPointer.slice(0, parentPointer.indexOf(';'))).not.toMatch(/on\s+delete/);
  });

  it('clears a leaf that points at a deleted message instead of dangling', () => {
    expect(migration).toContain(
      'add column if not exists active_leaf_message_id uuid\n' +
        '    references public.web_messages(id) on delete set null',
    );
  });

  it('indexes the variant-group and ancestor-chain lookup the transcript index cannot serve', () => {
    expect(migration).toContain(
      'create index if not exists idx_web_messages_conversation_parent\n' +
        '  on public.web_messages (conversation_id, parent_id)',
    );
  });

  it('adds both columns nullable, so no existing row needs a backfilled value', () => {
    expect(ddl).not.toMatch(/parent_id uuid[^;]*not null/i);
    expect(ddl).not.toMatch(/active_leaf_message_id uuid[^;]*not null/i);
    expect(ddl).not.toMatch(/(parent_id|active_leaf_message_id)[^;]*\bdefault\b/i);
  });

  it('changes nothing else on either table', () => {
    expect(ddl).not.toMatch(/\bupdate\s+public\.web_(messages|conversations)\b/i);
    expect(ddl).not.toMatch(/\bdrop\s+(table|column|index)\b/i);
  });

  it('reverses every object it declares and retracts its own ledger row', () => {
    expect(unreversedObjects(migration, reversal)).toEqual([]);
    expect(reversalErrors(MIGRATION, migration, reversal)).toEqual([]);
  });

  it('names the topology the reversal destroys, not just the columns it drops', () => {
    expect(reversal).toContain('WHAT THIS COSTS');
    expect(reversal).toContain('drop column if exists active_leaf_message_id');
    expect(reversal).toContain('drop index if exists public.idx_web_messages_conversation_parent');
    expect(reversal).toContain('drop column if exists parent_id');
  });
});
