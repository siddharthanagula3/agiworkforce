import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_ORGANIZATION_PERMISSIONS,
  LEGACY_ORGANIZATION_PERMISSIONS,
  LEGACY_ORGANIZATION_PERMISSION_ALIASES,
  ORGANIZATION_PERMISSIONS,
  type LegacyOrganizationPermission,
} from '@agiworkforce/types';

/**
 * The alias map lives twice, in the registry and in 0248, because a CHECK
 * constraint and an RLS predicate cannot import TypeScript. Nothing else keeps
 * the two copies honest, so this does.
 */
const MIGRATION = path.join(
  __dirname,
  '../../../../../../db/neon/0248_permission_namespaces_and_scim_group_membership_lock.sql',
);

const sql = readFileSync(MIGRATION, 'utf8');

function seededAliases(): Map<string, string> {
  const block = /insert into public\.organization_permission_aliases[\s\S]*?on conflict/u.exec(sql);
  expect(block).not.toBeNull();
  const pairs = new Map<string, string>();
  for (const match of (block?.[0] ?? '').matchAll(/\('([^']+)',\s*'([^']+)'\)/gu)) {
    pairs.set(match[1] as string, match[2] as string);
  }
  return pairs;
}

function knownPermissionsConstraint(): Set<string> {
  const block = /add constraint organization_roles_known_permissions[\s\S]*?\]::text\[\]/u.exec(
    sql,
  );
  expect(block).not.toBeNull();
  return new Set(
    [...(block?.[0] ?? '').matchAll(/'([^']+)'/gu)].map((match) => match[1] as string),
  );
}

describe('0248 permission alias layer', () => {
  it('seeds exactly the aliases the registry declares', () => {
    const seeded = seededAliases();
    expect(seeded.size).toBe(LEGACY_ORGANIZATION_PERMISSIONS.length);
    for (const legacy of LEGACY_ORGANIZATION_PERMISSIONS) {
      expect(seeded.get(legacy)).toBe(LEGACY_ORGANIZATION_PERMISSION_ALIASES[legacy]);
    }
  });

  it('lets a role carry either form of every permission', () => {
    const allowed = knownPermissionsConstraint();
    for (const permission of ORGANIZATION_PERMISSIONS) {
      expect(allowed.has(permission)).toBe(true);
    }
    expect(allowed.size).toBe(ORGANIZATION_PERMISSIONS.length);
  });

  it('reserves both forms of the three Primary Owner permissions', () => {
    const block =
      /add constraint organization_roles_primary_owner_permissions[\s\S]*?\]::text\[\]/u.exec(
        sql,
      )?.[0];
    expect(block).toBeDefined();
    for (const legacy of [
      'ownership.transfer',
      'workspace.delete',
      'billing.contracts.manage',
    ] as LegacyOrganizationPermission[]) {
      expect(block).toContain(`'${legacy}'`);
      expect(block).toContain(`'${LEGACY_ORGANIZATION_PERMISSION_ALIASES[legacy]}'`);
    }
  });

  it('gives organization_roles a version column and takes SCIM membership writes away', () => {
    expect(sql).toContain('add column if not exists version integer not null default 1');
    expect(sql).toContain(
      'revoke insert, update, delete on public.scim_group_members from app_rls',
    );
    expect(sql).toContain('for select to app_rls');
  });

  it('resolves a grant through the closure function', () => {
    expect(sql).toContain('public.organization_permission_closure');
    expect(sql).toMatch(/select public\.organization_permission_closure\(/u);
    for (const canonical of CANONICAL_ORGANIZATION_PERMISSIONS.filter((key) =>
      key.endsWith('.manage'),
    )) {
      expect(knownPermissionsConstraint().has(canonical)).toBe(true);
    }
  });
});
