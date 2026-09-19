import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_ORGANIZATION_ROLES,
  LEGACY_ORGANIZATION_PERMISSIONS,
  PRIMARY_OWNER_ONLY_PERMISSIONS,
} from '@agiworkforce/types';

const neonDir = resolve(import.meta.dirname);

function readMigration(name: string): string {
  return readFileSync(resolve(neonDir, name), 'utf8');
}

function withoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

function textArray(literal: string): string[] {
  return [...literal.matchAll(/'([a-z_.]+)'/g)].map((match) => match[1] as string);
}

function seededPermissions(sql: string): Record<string, string[]> {
  const seed = /insert into public\.organization_roles[\s\S]*?on conflict/i.exec(sql)?.[0] ?? '';
  const rows = [...seed.matchAll(/\(null, '([a-z_]+)',[\s\S]*?array\[([\s\S]*?)\]::text\[\]\)/g)];
  return Object.fromEntries(rows.map((row) => [row[1], textArray(row[2] as string)]));
}

function policy(sql: string, name: string): string {
  const match = new RegExp(`create policy ${name}\\b[\\s\\S]*?;`, 'i').exec(withoutComments(sql));
  return match?.[0] ?? '';
}

describe('0200 organization permission grid', () => {
  const sql = readMigration('0200_organization_permission_grid.sql');
  const down = readMigration('down/0200_organization_permission_grid.down.sql');

  it('seeds every built-in role with the legacy permission vocabulary it shipped with', () => {
    const seeded = seededPermissions(sql);
    expect(Object.keys(seeded).sort()).toEqual(Object.keys(BUILT_IN_ORGANIZATION_ROLES).sort());
    for (const permissions of Object.values(seeded)) {
      expect(
        permissions.every((permission) =>
          (LEGACY_ORGANIZATION_PERMISSIONS as readonly string[]).includes(permission),
        ),
      ).toBe(true);
    }
    expect(seeded['primary_owner']?.sort()).toEqual([...LEGACY_ORGANIZATION_PERMISSIONS].sort());
    expect(seeded['owner']?.sort()).toEqual(
      LEGACY_ORGANIZATION_PERMISSIONS.filter(
        (permission) => !(PRIMARY_OWNER_ONLY_PERMISSIONS as readonly string[]).includes(permission),
      ).sort(),
    );
  });

  it('knows every legacy permission and no later namespaced permission', () => {
    const known =
      /constraint organization_roles_known_permissions check \(\s*permissions <@ array\[([\s\S]*?)\]/i.exec(
        sql,
      );
    expect(textArray(known?.[1] ?? '').sort()).toEqual([...LEGACY_ORGANIZATION_PERMISSIONS].sort());
  });

  it('refuses the Primary Owner permissions on every role but the built-in primary owner', () => {
    const constraint =
      /constraint organization_roles_primary_owner_permissions check \(([\s\S]*?)\n {2}\),/i.exec(
        sql,
      );
    expect(constraint?.[1]).toMatch(/organization_id is null and key = 'primary_owner'/);
    expect(
      textArray(constraint?.[1] ?? '')
        .filter((p) => p.includes('.'))
        .sort(),
    ).toEqual(
      PRIMARY_OWNER_ONLY_PERMISSIONS.filter(
        (permission) => !permission.startsWith('admin.'),
      ).sort(),
    );
  });

  it('defines the viewer as read-only', () => {
    expect(seededPermissions(sql)['viewer']).toEqual(['content.read']);
    expect(BUILT_IN_ORGANIZATION_ROLES.viewer.permissions).toEqual(['content.read']);
  });

  it('maps the single membership owner to the Primary Owner and unions extra and group roles', () => {
    const fn =
      /create or replace function public\.organization_member_permissions[\s\S]*?\$\$;/i.exec(
        sql,
      )?.[0];
    expect(fn).toMatch(/case m\.role when 'owner' then 'primary_owner' else m\.role end/);
    expect(fn).toMatch(/join public\.organization_member_roles mr/);
    expect(fn).toMatch(/join public\.organization_group_roles gr/);
    expect(fn).toMatch(/su\.linked_user_id = p_user_id/);
    expect(fn).toMatch(/and su\.active/);
    expect(sql).toMatch(
      /revoke all on function public\.organization_member_permissions\(uuid, text\) from public;/,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.organization_member_permissions\(uuid, text\) to app_rls/,
    );
  });

  it('requires content.share, not mere membership, to share an artifact or conversation into a workspace', () => {
    for (const name of [
      'organization_shared_artifacts_owner_insert',
      'organization_shared_artifacts_owner_update',
      'organization_shared_sessions_owner_insert',
      'organization_shared_sessions_owner_update',
    ]) {
      const text = policy(sql, name);
      expect(text, name).toMatch(/to app_rls/i);
      expect(text, name).toMatch(
        /with check \(\s*public\.app_has_org_permission\(organization_id, 'content\.share'\)/,
      );
    }
  });

  it('refuses a write grant on a shared project to someone who may not share', () => {
    expect(policy(sql, 'organization_project_access_admin_write')).toMatch(
      /access <> 'write'\s+or public\.app_org_member_may_hold_write\(organization_id, user_id\)/,
    );
  });

  it('asks permissions, never role names, in every policy it creates', () => {
    const body = withoutComments(sql);
    const policies = body.match(/create policy[\s\S]*?;/gi) ?? [];
    expect(policies.length).toBeGreaterThan(30);
    for (const text of policies) {
      expect(text).not.toMatch(/app_has_org_role\s*\(/);
      expect(text).not.toMatch(/current_app_org_role\s*\(/);
    }
    expect(body).not.toMatch(/app_has_org_role\s*\(/);
  });

  it('refuses a role grant that carries a permission the granter does not hold', () => {
    expect(policy(sql, 'organization_member_roles_insert')).toMatch(
      /app_org_role_within_caller_permissions\(organization_id, role_id\)/,
    );
    expect(policy(sql, 'organization_group_roles_insert')).toMatch(
      /app_org_role_within_caller_permissions\(organization_id, role_id\)/,
    );
    expect(policy(sql, 'organization_roles_insert')).toMatch(
      /app_org_permissions_within_caller\(organization_id, permissions\)/,
    );
  });

  it('lets a delegated manager change only the roles of their own group', () => {
    expect(policy(sql, 'organization_group_roles_insert')).toMatch(
      /app_is_org_group_manager\(organization_id, group_id\)/,
    );
    expect(policy(sql, 'organization_group_managers_write')).toMatch(/'groups\.manage'/);
  });

  it('forces row level security on all four new tables', () => {
    for (const table of [
      'organization_roles',
      'organization_member_roles',
      'organization_group_roles',
      'organization_group_managers',
    ]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} force row level security`));
    }
  });

  it('records the Primary Owner definition in the header', () => {
    expect(sql).toMatch(
      /only the Primary Owner can\s*--\s*transfer ownership, delete the workspace/i,
    );
    expect(sql).toMatch(/NOT YET APPLIED/);
  });

  it('reverses every rewired predicate and policy and drops what it created', () => {
    expect(down).toMatch(/current_app_org_role\(\) in \('owner', 'admin'\)/);
    expect(down).toMatch(/array\['owner', 'admin', 'member', 'viewer'\]::text\[\]/);
    for (const name of [
      'organization_shared_artifacts_owner_insert',
      'organization_shared_sessions_owner_insert',
      'organization_members_admin_write',
      'sso_connections_owner_insert',
      'organization_billing_invoices_admin_read',
    ]) {
      expect(down).toMatch(new RegExp(`create policy ${name}\\b`));
    }
    for (const table of [
      'organization_group_managers',
      'organization_group_roles',
      'organization_member_roles',
      'organization_roles',
    ]) {
      expect(down).toMatch(new RegExp(`drop table if exists public\\.${table};`));
    }
    expect(down).toMatch(/drop function if exists public\.app_has_org_permission\(uuid, text\);/);
  });
});

describe('0201 workspace policy layers and revisions', () => {
  const sql = readMigration('0201_workspace_policy_layers_and_revisions.sql');
  const down = readMigration('down/0201_workspace_policy_layers_and_revisions.down.sql');

  it('keys one layer per role, group or user in a workspace', () => {
    expect(sql).toMatch(
      /subject_type text not null check \(subject_type in \('role', 'group', 'user'\)\)/,
    );
    expect(sql).toMatch(/unique \(organization_id, subject_type, subject_id\)/);
  });

  it('revisions every table whose rows change a policy decision', () => {
    for (const table of [
      'organization_admin_policies',
      'organization_model_policies',
      'organization_connector_policies',
      'organization_policy_overrides',
      'organization_roles',
      'organization_member_roles',
      'organization_group_roles',
    ]) {
      expect(sql).toContain(`'${table}'`);
    }
    expect(sql).toMatch(/pg_advisory_xact_lock/);
  });

  it('lets every member poll the revision and nobody write it through the application role', () => {
    expect(sql).toMatch(/grant select on public\.organization_policy_revisions to app_rls;/);
    expect(sql).toMatch(
      /revoke insert, update, delete on public\.organization_policy_revisions from app_rls;/,
    );
    expect(policy(sql, 'organization_policy_revisions_member_read')).toMatch(/'content\.read'/);
  });

  it('shows a member their own exception and nobody else theirs', () => {
    expect(policy(sql, 'organization_policy_overrides_read')).toMatch(
      /subject_type = 'user' and subject_id = public\.current_app_user_id\(\)/,
    );
    expect(policy(sql, 'organization_policy_overrides_write')).toMatch(/'policy\.manage'/);
  });

  it('removes an exception when its role, group or member goes away', () => {
    expect(sql).toMatch(/create trigger delete_role_policy_overrides/);
    expect(sql).toMatch(/create trigger delete_group_policy_overrides/);
    expect(sql).toMatch(/create trigger delete_member_policy_overrides/);
  });

  it('reverses cleanly', () => {
    expect(down).toMatch(/drop table if exists public\.organization_policy_revisions;/);
    expect(down).toMatch(/drop table if exists public\.organization_policy_overrides;/);
    expect(down).toMatch(
      /drop function if exists public\.record_organization_policy_revision\(\);/,
    );
  });
});
