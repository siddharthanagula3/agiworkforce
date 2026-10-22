import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(import.meta.dirname, name), 'utf8');
const up = read('0384_organization_code_tool_decision_days.sql');
const down = read('down/0384_organization_code_tool_decision_days.down.sql');

describe('0384 organization code tool decision days', () => {
  it('answers only a caller who may read the workspace usage', () => {
    expect(up).toMatch(/app_org_code_tool_decision_days[\s\S]*security definer/);
    expect(up).toContain("where public.app_has_org_permission(p_organization_id, 'billing.read')");
    expect(up).toContain('and turn.organization_id = p_organization_id');
  });

  it('returns counts of decided approvals and nothing a member typed', () => {
    expect(up).toContain('returns table (day timestamptz, accepted integer, rejected integer)');
    expect(up).toContain("and approval.state in ('approved', 'rejected')");
    expect(up).not.toMatch(/approval\.command|approval\.reason|turn\.goal|final_message/);
  });

  it('is callable by the app role only and rolls back', () => {
    expect(up).toMatch(
      /revoke all on function public\.app_org_code_tool_decision_days[^;]*from public;/,
    );
    expect(up).toMatch(
      /grant execute on function public\.app_org_code_tool_decision_days[^;]*to app_rls;/,
    );
    expect(down).toContain(
      'drop function if exists public.app_org_code_tool_decision_days(uuid, timestamptz, timestamptz);',
    );
    expect(down).toContain("where filename = '0384_organization_code_tool_decision_days.sql';");
  });
});
