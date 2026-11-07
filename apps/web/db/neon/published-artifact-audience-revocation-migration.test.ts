import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0395_published_artifact_audience_revocation.sql');
const down = read('down/0395_published_artifact_audience_revocation.down.sql');
const prior = read('0372_published_site_viewers.sql');
const normalize = (sql: string) => sql.replace(/\s+/gu, ' ').trim();

function functionSource(sql: string, name: string): string {
  const match = sql.match(
    new RegExp('create (?:or replace )?function public\\.' + name + '\\([\\s\\S]*?\\$\\$;', 'u'),
  );
  if (!match) throw new Error('Missing function: ' + name);
  return match[0];
}

function policySource(sql: string, name: string): string {
  const match = sql.match(new RegExp('create policy ' + name + '\\s[\\s\\S]*?;', 'u'));
  if (!match) throw new Error('Missing policy: ' + name);
  return match[0];
}

// Source contracts only: PostgreSQL integration must verify roles, recursion,
// stale grant revocation, runtime authorization, and storage RLS.
describe('0395 publication audience revocation source contracts', () => {
  it('checks both the migration owner and actual new helper owner can bypass RLS', () => {
    expect(up).toContain('rolname = current_user and (rolsuper or rolbypassrls)');
    expect(up.indexOf('rolname = current_user')).toBeLessThan(up.indexOf('create function'));
    expect(up).toContain('from pg_catalog.pg_proc proc');
    expect(up).toContain('owner_role.oid = proc.proowner');
    expect(up).toContain(
      "proc.oid = 'public.app_owns_published_artifact(uuid)'::pg_catalog.regprocedure",
    );
    expect(up).toContain('(owner_role.rolsuper or owner_role.rolbypassrls)');
    expect(up.indexOf('owner_role.rolbypassrls')).toBeLessThan(up.indexOf('create policy'));
  });

  it('exposes only a current-user-bounded boolean without recursive RLS or mutation', () => {
    const helper = functionSource(up, 'app_owns_published_artifact');
    expect(helper).toContain(
      'create function public.app_owns_published_artifact(p_published_artifact_id uuid)',
    );
    expect(helper).toContain('returns boolean');
    expect(helper).toContain('stable');
    expect(helper).toContain('security definer');
    expect(helper).toContain('set search_path = pg_catalog, pg_temp');
    expect(helper).toContain('set row_security = off');
    expect(helper).toContain('from public.published_artifacts artifact');
    expect(helper).toContain('artifact.id = p_published_artifact_id');
    expect(helper).toContain("nullif(btrim(public.current_app_user_id()), '') is not null");
    expect(helper).toContain('artifact.user_id = public.current_app_user_id()');
    expect(helper).not.toMatch(/\bp_user|organization|current_app_org|insert|update|delete|execute/iu);
    expect(up).toContain(
      'revoke all on function public.app_owns_published_artifact(uuid) from public;',
    );
    expect(up).toContain(
      'grant execute on function public.app_owns_published_artifact(uuid) to app_rls;',
    );
    expect(
      up.match(/grant execute on function public\.app_owns_published_artifact[\s\S]*?;/gu),
    ).toHaveLength(1);
  });

  it('adds only separate owner SELECT and DELETE grant policies', () => {
    for (const [suffix, command] of [['read', 'select'], ['delete', 'delete']]) {
      const policy = policySource(up, 'organization_shared_artifacts_publication_owner_' + suffix);
      expect(normalize(policy)).toContain(
        'on public.organization_shared_artifacts for ' + command + ' to app_rls',
      );
      expect(policy).toContain('using (public.app_owns_published_artifact(published_artifact_id))');
      expect(policy).not.toMatch(/exists|from public\.published_artifacts|with check|organization_id/iu);
    }
    expect(up).not.toMatch(/drop policy.*organization_shared_artifacts/iu);
    expect(up).not.toMatch(/on public\.organization_shared_artifacts for (all|insert|update)/iu);
    expect(up).not.toMatch(/alter role|alter table|delete from|update public\.|insert into/iu);
  });

  it('excludes invited from grant SELECT but preserves public and organization discovery', () => {
    const policy = policySource(up, 'published_artifacts_org_shared_read');
    const oldPolicy = policySource(
      read('0184_organization_shared_artifacts.sql'),
      'published_artifacts_org_shared_read',
    );
    expect(policy).toContain("visibility in ('public', 'organization')");
    expect(
      normalize(policy.replace("visibility in ('public', 'organization')\n    and ", '')),
    ).toBe(normalize(oldPolicy));
  });

  it.each(['app_runnable_published_artifact', 'app_can_run_published_artifact'])(
    'restricts only the org grant branch of %s and preserves its other gates',
    (name) => {
      const current = functionSource(up, name);
      const old = functionSource(prior, name);
      const guardedBranch = /or \(\s*a\.visibility = 'organization'\s*and exists \(([\s\S]*?app_org_resource_is_readable\(share\.organization_id\))\s*\)\s*\)/u;
      expect(current).toMatch(guardedBranch);
      expect(normalize(current.replace(guardedBranch, 'or exists ($1 )'))).toBe(normalize(old));
      expect(current).toContain("a.kind in ('html', 'react')");
      expect(current).toContain("nullif(public.current_app_user_id(), '') is not null");
      expect(current).toContain("a.visibility = 'public'");
      expect(current).toContain('a.user_id = public.current_app_user_id()');
      expect(current).toContain("a.visibility = 'invited'");
      expect(current).toContain('viewer.email = lower(profile.email)');
      const signature = name + (name === 'app_runnable_published_artifact' ? '(text)' : '(uuid)');
      for (const sql of [up, down]) {
        expect(sql).toContain('revoke all on function public.' + signature + ' from public;');
        expect(sql).toContain('grant execute on function public.' + signature + ' to app_rls;');
      }
      expect(normalize(functionSource(down, name))).toBe(normalize(old));
    },
  );

  it('keeps storage and connector authorization attached to the corrected runtime predicate', () => {
    expect(prior).toContain('public.app_can_run_published_artifact(published_artifact_id)');
    for (const filename of [
      '0383_published_artifact_connector_audience.sql',
      '0391_artifact_runtime_usage_cap.sql',
    ]) {
      expect(read(filename)).toContain('public.app_can_run_published_artifact(a.id)');
    }
    expect(up).not.toMatch(/create policy published_artifact_storage|create.*app_published_artifact_/u);
  });

  it('pairs transactional up/down and restores prior policy before removing the helper', () => {
    for (const sql of [up, down]) {
      expect(sql.trim()).toMatch(/^begin;[\s\S]*commit;$/u);
    }
    expect(down).toContain('WARNING: rollback restores stale workspace-grant access');
    expect(normalize(policySource(down, 'published_artifacts_org_shared_read'))).toBe(
      normalize(policySource(
        read('0184_organization_shared_artifacts.sql'),
        'published_artifacts_org_shared_read',
      )),
    );
    for (const suffix of ['read', 'delete']) {
      const drop = 'drop policy organization_shared_artifacts_publication_owner_' + suffix;
      expect(down).toContain(drop);
      expect(down.indexOf(drop)).toBeLessThan(down.indexOf('drop function'));
    }
    expect(down).toContain('drop function public.app_owns_published_artifact(uuid);');
    expect(down).toContain("where filename = '0395_published_artifact_audience_revocation.sql';");
    expect(down).not.toMatch(/delete from public\.(?!schema_migrations)|drop table|alter role/iu);
  });

  it.each([
    [
      '0184_organization_shared_artifacts.sql',
      '1b6d168812ab5b01f7101945696246b450cd42786a01aa2b58228f6c070ad915',
    ],
    [
      '0185_org_shared_artifact_policy_recursion.sql',
      '5176b64ebd69a828ca03445a1bd253ecba9767df95358b59778b066acc3c6ed8',
    ],
    [
      '0200_organization_permission_grid.sql',
      'c514f650c163aae2c42235e690544d4673e6e601ea08d0349c089c68677b10cc',
    ],
    [
      '0372_published_site_viewers.sql',
      '3aa9d0304d8c9cec3cb32dd969dfb2fabf89fb3d9809fc818643283c48274444',
    ],
  ])('preserves checksummed predecessor %s', (filename, digest) => {
    expect(createHash('sha256').update(read(filename)).digest('hex')).toBe(digest);
  });
});
