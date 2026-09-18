import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION = '0229_support_access_grants.sql';

describe('break-glass support access migration (0229)', () => {
  const load = () => readFile(join(process.cwd(), 'db/neon', MIGRATION), 'utf8');

  it('cannot record a grant approved by the operator who asked for it', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /constraint support_access_grants_needs_a_second_approver check \(\s*approved_by_user_id is null or approved_by_user_id <> requested_by_user_id/i,
    );
  });

  it('caps a grant window in the schema, not only in the code path in front of it', async () => {
    const sql = await load();
    expect(sql).toMatch(/expires_at <= requested_at \+ interval '8 hours'/i);
    expect(sql).toMatch(/expires_at > requested_at/i);
  });

  it('ties approval to an expiry, so no approved grant is open-ended', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /\(status = 'approved'\) =\s*\(approved_by_user_id is not null and decided_at is not null and expires_at is not null\)/i,
    );
  });

  it('records a refusal as its own event, not only the reads that succeeded', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /event in \('requested', 'approved', 'denied', 'revoked', 'expired', 'accessed', 'refused'\)/i,
    );
  });

  it('refuses updates and deletes on the trail for every role, including the owner', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /create or replace function public\.support_access_events_are_append_only/i,
    );
    expect(sql).toMatch(/raise exception[\s\S]{0,120}append-only/i);
    expect(sql).toMatch(
      /create trigger support_access_events_append_only\s+before update or delete on public\.support_access_events/i,
    );
  });

  it('chains each entry to the one before it and refuses a malformed digest', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /previous_hash text not null check \(previous_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i,
    );
    expect(sql).toMatch(
      /entry_hash text not null unique check \(entry_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/i,
    );
  });

  it('revokes the write privilege 0037 hands out by default, on both tables', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /revoke insert, update, delete on public\.support_access_grants from app_rls/i,
    );
    expect(sql).toMatch(
      /revoke insert, update, delete on public\.support_access_events from app_rls/i,
    );
    expect(sql).toMatch(/revoke usage, select on sequence public\.support_access_events_id_seq/i);
  });

  it('lets the workspace read its own grants and its own trail', async () => {
    const sql = await load();
    for (const table of ['support_access_grants', 'support_access_events']) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} force row level security`, 'i'),
      );
      expect(sql).toMatch(
        new RegExp(
          `create policy ${table}_workspace_read[\\s\\S]{0,400}for select to app_rls`,
          'i',
        ),
      );
    }
    expect(sql).toMatch(/m\.role in \('owner', 'admin'\)/i);
  });

  it('keeps the trail free of foreign keys, so evidence outlives what it names', async () => {
    const sql = await load();
    const events = sql.slice(
      sql.indexOf('create table if not exists public.support_access_events'),
      sql.indexOf('create or replace function public.support_access_events_are_append_only'),
    );
    expect(events).not.toMatch(/references\s+public\./i);
    expect(events).not.toMatch(/on delete cascade/i);
  });
});
