import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0386_organization_code_session_days.sql');
const down = read('down/0386_organization_code_session_days.down.sql');

describe('0386 organization code session days', () => {
  it('counts the whole workspace for a caller who may read its usage', () => {
    expect(up).toMatch(/app_org_code_session_days[\s\S]*security definer/);
    expect(up).toContain("where public.app_has_org_permission(p_organization_id, 'billing.read')");
    expect(up).toContain('and request_row.organization_id = p_organization_id');
    expect(up).not.toMatch(/current_app_user_id\(\)/);
  });

  it('counts settled code sessions only and returns counts', () => {
    expect(up).toContain("and request_row.status = 'completed'");
    expect(up).toContain("and request_row.usage->>'workload' = 'code'");
    expect(up).toContain("count(distinct request_row.usage->>'sessionId')::integer as sessions");
    expect(up).toContain('returns table (day timestamptz, sessions integer)');
  });

  it('is callable by the app role only and rolls back', () => {
    expect(up).toMatch(/revoke all on function public\.app_org_code_session_days[^;]*from public;/);
    expect(up).toMatch(
      /grant execute on function public\.app_org_code_session_days[^;]*to app_rls;/,
    );
    expect(down).toContain(
      'drop function if exists public.app_org_code_session_days(uuid, timestamptz, timestamptz);',
    );
    expect(down).toContain("where filename = '0386_organization_code_session_days.sql';");
  });
});
