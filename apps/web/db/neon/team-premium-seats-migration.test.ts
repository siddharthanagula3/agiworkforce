import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Team Premium seats migration (0360)', () => {
  const load = () => readFile(join(process.cwd(), 'db/neon/0360_team_premium_seats.sql'), 'utf8');
  const loadDown = () =>
    readFile(join(process.cwd(), 'db/neon/down/0360_team_premium_seats.down.sql'), 'utf8');

  it('records how many licensed seats are Premium, starting every organization at none', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /alter table public\.organizations\s+add column if not exists licensed_premium_seats integer not null default 0/i,
    );
    expect(sql).toMatch(
      /constraint organizations_licensed_premium_seats_non_negative\s+check \(licensed_premium_seats >= 0\)/i,
    );
  });

  it('starts every existing member on a Standard seat and accepts only the two seat types', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /alter table public\.organization_members\s+add column if not exists seat_type text not null default 'standard'/i,
    );
    expect(sql).toMatch(
      /constraint organization_members_seat_type_known\s+check \(seat_type = any \(array\['standard', 'premium'\]\)\)/i,
    );
  });

  it('takes over the seat_type column 0234 created, converting its rows before the new check', async () => {
    const sql = await load();
    const dropOld = sql.search(/drop constraint if exists organization_members_seat_type_check/i);
    const convert = sql.search(
      /update public\.organization_members\s+set seat_type = 'standard'\s+where seat_type <> all \(array\['standard', 'premium'\]\)/i,
    );
    const flush = sql.search(/set constraints all immediate;/i);
    const addNew = sql.search(/add constraint organization_members_seat_type_known/i);
    expect(dropOld).toBeGreaterThan(-1);
    expect(convert).toBeGreaterThan(dropOld);
    expect(flush).toBeGreaterThan(convert);
    expect(addNew).toBeGreaterThan(flush);
    expect(sql).toMatch(/alter column seat_type set default 'standard'/i);
  });

  it('restores 0234 seat_type on the way down instead of dropping the column', async () => {
    const down = await loadDown();
    expect(down).not.toMatch(/drop column if exists seat_type;/i);
    expect(down).toMatch(
      /update public\.organization_members set seat_type = 'full';\s+set constraints all immediate;/i,
    );
    expect(down).toMatch(/alter column seat_type set default 'full'/i);
    expect(down).toMatch(
      /add constraint organization_members_seat_type_check\s+check \(seat_type = any \(array\['full', 'limited', 'guest'\]\)\)/i,
    );
  });

  it('refuses a Premium membership beyond the paid Premium seats, inside the database', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /create trigger guard_premium_seat_assignment\s+before insert or update on public\.organization_members/i,
    );
    expect(sql).toMatch(/if assigned_premium \+ 1 > paid_premium then/i);
    expect(sql).toMatch(/errcode = 'check_violation'/i);
    expect(sql).toMatch(/constraint = 'organization_members_premium_within_license'/i);
  });

  it('takes the organization row lock before counting, so two assignments of the last seat serialize', async () => {
    const sql = await load();
    const lockAt = sql.search(
      /from public\.organizations as o\s+where o\.id = new\.organization_id\s+for update/i,
    );
    const countAt = sql.search(/select count\(\*\)\s+into assigned_premium/i);
    expect(lockAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(lockAt);
  });

  it('does not count the row being written against itself', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /and m\.seat_type = 'premium'\s+and m\.status = 'active'\s+and m\.user_id <> new\.user_id/i,
    );
  });

  it('runs the assignment guard with a pinned search path and no public execute', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /create or replace function public\.guard_premium_seat_assignment\(\)[\s\S]{0,120}security definer\s+set search_path = public, pg_temp/i,
    );
    expect(sql).toMatch(
      /revoke all on function public\.guard_premium_seat_assignment\(\) from public/i,
    );
  });

  it('keeps the paid Premium count out of application hands, with the two older seat guards intact', async () => {
    const sql = await load();
    const guard = sql.slice(
      sql.search(/create or replace function public\.guard_organization_seat_columns/i),
    );
    expect(guard).toMatch(/if current_user = 'app_rls' then/i);
    expect(guard).toMatch(/new\.seats_consumed is distinct from old\.seats_consumed/i);
    expect(guard).toMatch(/new\.licensed_seats is distinct from old\.licensed_seats/i);
    expect(guard).toMatch(
      /new\.licensed_premium_seats is distinct from old\.licensed_premium_seats[\s\S]{0,200}insufficient_privilege/i,
    );
  });

  it('stamps when a seat type changed, which orders who keeps Premium when fewer are paid for', async () => {
    const sql = await load();
    expect(sql).toMatch(/new\.seat_type_changed_at := now\(\)/i);
    expect(sql).toMatch(
      /create index if not exists idx_org_members_premium_seats\s+on public\.organization_members \(organization_id, seat_type_changed_at, user_id\)\s+where seat_type = 'premium'/i,
    );
  });

  it('counts only active members, so a removed member never holds a paid Premium seat', async () => {
    const sql = await load();
    expect(sql).toMatch(/if new\.seat_type <> 'premium' or new\.status <> 'active' then/i);
    expect(sql).toMatch(/where seat_type = 'premium' and status = 'active';/i);
  });

  it('brings a reactivated Premium member back on Standard when no paid seat is free', async () => {
    const sql = await load();
    expect(sql).toMatch(
      /if becomes_active and new\.seat_type is not distinct from old\.seat_type then\s+new\.seat_type := 'standard';/i,
    );
  });

  it('refuses the application role a paid-through date, which would grant Premium on its own', async () => {
    const sql = await load();
    const guard = sql.slice(
      sql.search(/create or replace function public\.guard_premium_paid_through/i),
    );
    expect(guard.split('$$;')[0]).not.toMatch(/security definer/i);
    expect(guard).toMatch(
      /if current_user = 'app_rls'\s+and new\.premium_paid_through is not null[\s\S]{0,400}insufficient_privilege/i,
    );
    expect(sql).toMatch(
      /create trigger guard_premium_paid_through\s+before insert or update of premium_paid_through on public\.organization_members/i,
    );
  });

  it('moves the seat assignment time only when the seat type moves', async () => {
    const sql = await load();
    expect(sql).toMatch(/new\.seat_type_changed_at := old\.seat_type_changed_at;\s+return new;/i);
  });

  it('leaves the total seat ceiling from 0085 alone', async () => {
    const sql = await load();
    expect(sql).not.toMatch(/organizations_seats_within_license/i);
    expect(sql).not.toMatch(/sync_organization_membership_state/i);
  });

  it('reverses every object it adds and restores the earlier seat guard', async () => {
    const down = await loadDown();
    expect(down).toMatch(/^[\s\S]*begin;[\s\S]*commit;\s*$/i);
    for (const column of ['premium_paid_through', 'seat_type_changed_at']) {
      expect(down).toMatch(
        new RegExp(
          `alter table public\\.organization_members drop column if exists ${column};`,
          'i',
        ),
      );
    }
    expect(down).toMatch(
      /alter table public\.organizations drop column if exists licensed_premium_seats;/i,
    );
    expect(down).toMatch(/drop function if exists public\.guard_premium_seat_assignment\(\)/i);
    expect(down).toMatch(/drop function if exists public\.guard_premium_paid_through\(\)/i);
    const restored = down.slice(
      down.search(/create or replace function public\.guard_organization_seat_columns/i),
    );
    expect(restored).toMatch(/new\.licensed_seats is distinct from old\.licensed_seats/i);
    expect(restored.split('$$;')[0]).not.toMatch(/licensed_premium_seats/i);
    expect(down).toMatch(
      /delete from public\.schema_migrations\s+where filename = '0360_team_premium_seats\.sql'/i,
    );
  });
});
