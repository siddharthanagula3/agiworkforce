import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 0085 turns three product promises into database facts: exactly one owner,
 * a licensed-seat ceiling, and a real invitation lifecycle.
 *
 * There is no live PostgreSQL in this repo's test environment (no pglite, no
 * pg-mem, no testcontainers — verified), so these are source-level invariants
 * in the same style as tenancy-foundation-migration.test.ts. Each one pins a
 * regression that would be SILENT: a ceiling that stops being enforced by the
 * database, a counter an application path can write, a policy that stops
 * failing closed, or a resurrection of the membership model 0058 removed.
 */
describe('organization seats and lifecycle migration (0085)', () => {
  const load = () =>
    readFile(join(process.cwd(), 'db/neon/0085_organization_seats_lifecycle.sql'), 'utf8');

  describe('ownership is a database fact', () => {
    it('enforces at most one owner with a partial unique index', async () => {
      const sql = await load();
      expect(sql).toMatch(
        /create unique index if not exists idx_org_members_single_owner\s+on public\.organization_members \(organization_id\)\s+where role = 'owner'/i,
      );
    });

    it('reconciles pre-existing multi-owner organizations BEFORE building that index', async () => {
      const sql = await load();
      const reconcileAt = sql.search(
        /update public\.organization_members as m\s+set role = 'admin'/i,
      );
      const indexAt = sql.search(/create unique index if not exists idx_org_members_single_owner/i);
      expect(reconcileAt).toBeGreaterThan(-1);
      expect(indexAt).toBeGreaterThan(-1);
      // If the index were created first it would simply fail to build on any
      // organization that already has two owners, and the migration would be
      // un-appliable on live data.
      expect(reconcileAt).toBeLessThan(indexAt);
    });

    it('enforces at least one owner with a DEFERRED constraint trigger', async () => {
      const sql = await load();
      // Deferred so a legitimate demote-then-promote transfer inside one
      // transaction is legal, while committing an ownerless org is not.
      expect(sql).toMatch(
        /create constraint trigger assert_org_has_owner[\s\S]{0,200}deferrable initially deferred/i,
      );
      // All three operations: a delete, a demotion, and populating an org with
      // members but no owner must each be rejected at commit.
      expect(sql).toMatch(
        /create constraint trigger assert_org_has_owner\s+after insert or update or delete on public\.organization_members/i,
      );
      expect(sql).toMatch(/would be left without an owner/i);
    });

    it('lets a cascading organization delete through instead of blocking it', async () => {
      const sql = await load();
      expect(sql).toMatch(
        /if not exists \(select 1 from public\.organizations where id = target_org\)/i,
      );
    });

    it('derives owner_user_id rather than letting application code set it', async () => {
      const sql = await load();
      expect(sql).toMatch(/add column if not exists owner_user_id text/i);
      expect(sql).toMatch(
        /owner_user_id = \(\s*select m\.user_id\s+from public\.organization_members as m/i,
      );
    });
  });

  describe('the seat ceiling is enforced by the database', () => {
    it('adds a CHECK that bounds consumed seats by licensed seats', async () => {
      const sql = await load();
      expect(sql).toMatch(
        /constraint organizations_seats_within_license check \(seats_consumed <= licensed_seats\)/i,
      );
    });

    it('moves seats_consumed only from triggers, in both directions', async () => {
      const sql = await load();
      expect(sql).toMatch(/set seats_consumed = o\.seats_consumed \+ seat_delta/i);
      // Membership: +1 on insert, -1 on delete.
      expect(sql).toMatch(/if tg_op = 'INSERT' then[\s\S]{0,160}seat_delta := 1/i);
      expect(sql).toMatch(/elsif tg_op = 'DELETE' then[\s\S]{0,160}seat_delta := -1/i);
      expect(sql).toMatch(
        /after insert or update or delete on public\.organization_members[\s\S]{0,120}sync_organization_membership_state/i,
      );
    });

    it('makes a PENDING invitation hold a seat and every exit release it', async () => {
      const sql = await load();
      expect(sql).toMatch(/seat_delta := case when new\.status = 'pending' then 1 else 0 end/i);
      expect(sql).toMatch(
        /if old\.status = 'pending' and new\.status <> 'pending' then\s+seat_delta := -1/i,
      );
      expect(sql).toMatch(
        /after insert or update or delete on public\.organization_invitations[\s\S]{0,120}sync_organization_invitation_seats/i,
      );
    });

    it('refuses direct application writes to the seat columns', async () => {
      const sql = await load();
      // A trigger-maintained counter drifts the moment one route writes it, and
      // a licensed_seats an admin can raise is a free upgrade.
      expect(sql).toMatch(/guard_organization_seat_columns/i);
      expect(sql).toMatch(
        /seats_consumed is maintained by triggers and cannot be written directly/i,
      );
      expect(sql).toMatch(/licensed_seats is written by billing provisioning/i);
      expect(sql).toMatch(/before update on public\.organizations/i);
    });

    it('backfills a behaviour-preserving floor so no live org is instantly over-subscribed', async () => {
      const sql = await load();
      expect(sql).toMatch(/licensed_seats = greatest\(/i);
      expect(sql).toMatch(/seats_consumed = \(\s*select count\(\*\)/i);
    });
  });

  describe('the invitation entity', () => {
    it('stores only a token hash and never a raw token', async () => {
      const sql = await load();
      expect(sql).toMatch(/token_hash text not null unique/i);
      expect(sql).not.toMatch(/\btoken text\b/i);
    });

    it('cannot mint an owner through an invitation link', async () => {
      const sql = await load();
      expect(sql).toMatch(
        /role text not null default 'member'\s+check \(role = any \(array\['admin', 'member', 'viewer'\]\)\)/i,
      );
    });

    it('allows one pending invitation per address per organization', async () => {
      const sql = await load();
      // Without this, the same address consumes two seats and "resend" becomes
      // a second row rather than an update.
      expect(sql).toMatch(
        /create unique index if not exists idx_org_invitations_pending_email\s+on public\.organization_invitations \(organization_id, email\)\s+where status = 'pending'/i,
      );
    });

    it('constrains status to the closed lifecycle vocabulary', async () => {
      const sql = await load();
      expect(sql).toMatch(
        /check \(status = any \(array\['pending', 'accepted', 'declined', 'revoked', 'expired'\]\)\)/i,
      );
    });

    it('requires an actor on an accepted invitation', async () => {
      const sql = await load();
      expect(sql).toMatch(/check \(status <> 'accepted' or accepted_by_user_id is not null\)/i);
    });

    it('indexes the expiry sweep so releasing lapsed seats stays cheap', async () => {
      const sql = await load();
      expect(sql).toMatch(/idx_org_invitations_expiry[\s\S]{0,120}where status = 'pending'/i);
    });
  });

  describe('row level security extends the tenancy foundation', () => {
    it('adds the admin read and write policies organization_members never had', async () => {
      const sql = await load();
      // 0054 gave organization_members exactly one policy (self-read), which is
      // why an admin reading the member list under app_rls sees only themselves.
      expect(sql).toMatch(
        /create policy organization_members_admin_read[\s\S]{0,200}app_has_org_role\(organization_id, array\['owner', 'admin'\]::text\[\]\)/i,
      );
      expect(sql).toMatch(/create policy organization_members_admin_write/i);
    });

    it('refuses an owner promotion by a non-owner inside the write policy', async () => {
      const sql = await load();
      // Otherwise an admin could demote the owner and promote themselves in one
      // transaction and slip past the deferred at-least-one-owner trigger.
      expect(sql).toMatch(
        /role <> 'owner'\s+or public\.app_has_org_role\(organization_id, array\['owner'\]::text\[\]\)/i,
      );
    });

    it('locks invitations to organization admins and binds every policy to app_rls', async () => {
      const sql = await load();
      expect(sql).toMatch(
        /alter table public\.organization_invitations enable row level security/i,
      );
      expect(sql).toMatch(/alter table public\.organization_invitations force row level security/i);
      expect(sql).toMatch(
        /create policy organization_invitations_admin_access\s+on public\.organization_invitations for all to app_rls/i,
      );
      expect(sql).toMatch(
        /grant select, insert, update, delete on public\.organization_invitations to app_rls/i,
      );
    });

    it('resolves authorization from the membership table, never from a client claim', async () => {
      const sql = await load();
      expect(sql).toMatch(/app_has_org_role/);
      expect(sql).not.toMatch(/current_setting\('request\.jwt\.claim\.org_role'/i);
      // No policy may be created without a role binding, or it applies to
      // PUBLIC and the BYPASSRLS owner regime becomes the only barrier.
      const policies = sql.match(/create policy [\s\S]*?;/g) ?? [];
      expect(policies.length).toBeGreaterThan(0);
      for (const policy of policies) {
        expect(policy).toMatch(/to app_rls/i);
      }
    });

    it('pins search_path on every SECURITY DEFINER function it adds', async () => {
      const sql = await load();
      // Only real declarations: `security definer` at the start of a line in a
      // CREATE FUNCTION body, not the word appearing inside a comment.
      const definers = sql.match(/^security definer[\s\S]{0,120}/gim) ?? [];
      expect(definers.length).toBeGreaterThan(0);
      for (const definer of definers) {
        expect(definer).toMatch(/set search_path = public, pg_temp/i);
      }
    });
  });

  describe('0058 is not undone', () => {
    it('creates no second membership system and no forked role vocabulary', async () => {
      const sql = await load();
      // 0058 dropped teams/team_members because a second membership model with
      // an admin/editor/viewer vocabulary and no owner made last-owner
      // protection impossible. Everything here hangs off organizations.
      // Relation REFERENCES only — the header comment names the dropped tables
      // deliberately, to record why they must not come back.
      const relationRef = (name: string) =>
        new RegExp(
          `\\b(create table|alter table|from|join|into|update|references)\\s+(if not exists\\s+)?(public\\.)?${name}\\b`,
          'i',
        );
      expect(sql).not.toMatch(relationRef('teams'));
      expect(sql).not.toMatch(relationRef('team_members'));
      expect(sql).not.toMatch(relationRef('team_invitations'));
      expect(sql).not.toMatch(relationRef('team_seats'));
      expect(sql).not.toMatch(/'editor'/i);
    });
  });
});
