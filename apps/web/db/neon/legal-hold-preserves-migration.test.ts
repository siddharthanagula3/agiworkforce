import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0415_legal_hold_preserves.sql');
const down = read('down/0415_legal_hold_preserves.down.sql');
const gate = readFileSync(
  resolve(import.meta.dirname, '../../lib/services/legal-hold-gate.ts'),
  'utf8',
);
const SIGNATURE = 'public.legal_hold_preserves(uuid, text, text)';

function functionBody(sql: string): string {
  const start = sql.indexOf('as $$\ndeclare');
  const end = sql.indexOf('end;\n$$;', start);
  return sql.slice(start, end);
}

describe('0415 legal hold preserves', () => {
  it('is a draft inside one transaction', () => {
    expect(up).toContain(
      '-- NOT YET APPLIED : draft only, pending explicit approval before running.',
    );
    expect(up.trimStart().startsWith('--')).toBe(true);
    expect(up).toMatch(/\nbegin;\n/);
    expect(up.trimEnd().endsWith('commit;')).toBe(true);
  });

  it('defines a definer function that takes identifiers and returns only a boolean', () => {
    expect(up).toContain('create or replace function public.legal_hold_preserves(');
    expect(up).toContain('p_organization_id uuid,');
    expect(up).toContain('p_owner_user_id text,');
    expect(up).toContain('p_resource_type text');
    expect(up).toContain('returns boolean');
    expect(up).toContain('security definer');
    expect(up).toContain('set search_path = pg_catalog, pg_temp');
    expect(up).toContain('set row_security = off');
  });

  it('is executable by app_rls alone', () => {
    expect(up).toContain(`revoke all on function ${SIGNATURE} from public;`);
    expect(up).toContain(`grant execute on function ${SIGNATURE} to app_rls;`);
    expect(up.indexOf('revoke all on function')).toBeLessThan(up.indexOf('grant execute'));
  });

  it('refuses to run under an owner that RLS would filter, before and after creating', () => {
    expect(up).toContain('rolname = current_user and (rolsuper or rolbypassrls)');
    expect(up).toContain(`proc.oid = '${SIGNATURE}'::pg_catalog.regprocedure`);
    expect(up).toContain('(owner_role.rolsuper or owner_role.rolbypassrls)');
  });

  it('answers a member only about a row that member may see, failing closed otherwise', () => {
    const body = functionBody(up);
    expect(body).toContain("caller text := nullif(btrim(public.current_app_user_id()), '');");
    expect(body).toContain('public.app_row_is_visible(p_owner_user_id, p_organization_id)');
    expect(body).toContain("m.role in ('owner', 'admin')");
    expect(body).toContain("m.status = 'active'");
    expect(body).toContain("pg_catalog.current_setting('role', true) is distinct from 'none'");
    const guard = body.indexOf('app_row_is_visible');
    const holds = body.indexOf('from public.legal_holds h');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(holds);
    expect(body.match(/return true;/g)).toHaveLength(2);
  });

  it('applies the same scopes as the predicate it replaces', () => {
    const body = functionBody(up);
    expect(body).toContain('h.released_at is null');
    expect(body).toContain('h.organization_id = p_organization_id');
    expect(body).toContain('or h.resource_types is null');
    expect(body).toContain('or p_resource_type = any (h.resource_types)');
    expect(body).toContain("h.scope = 'organization'");
    expect(body).toContain("(h.scope = 'member' and h.subject_user_id = p_owner_user_id)");
    expect(body).toContain('from public.legal_hold_custodians c');
    expect(body).toContain('and c.user_id = p_owner_user_id');
  });

  it('is what the gate renders for every destructive statement', () => {
    expect(gate).toMatch(
      /public\.legal_hold_preserves\(\$\{organization\}::uuid, \$\{owner\}::text, \$\{store\}\)/u,
    );
  });

  it('rolls back what it adds', () => {
    expect(down).toContain('WHAT THIS COSTS');
    expect(down).toContain(
      'drop function if exists public.legal_hold_preserves(uuid, text, text);',
    );
    expect(down).toContain("where filename = '0415_legal_hold_preserves.sql';");
    expect(down).toMatch(/\nbegin;\n[\s\S]*\ncommit;\s*$/);
  });
});
