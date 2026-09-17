import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const sql = readFileSync(resolve(neonDir, '0217_shared_project_editor_write.sql'), 'utf8');
const down = readFileSync(
  resolve(neonDir, 'down/0217_shared_project_editor_write.down.sql'),
  'utf8',
);

describe('0217 an editor grant on a shared project', () => {
  it('lets an editor change the project record but never create or delete one', () => {
    expect(sql).toMatch(
      /create policy user_projects_org_shared_editor_update[\s\S]*?for update to app_rls/i,
    );
    expect(sql).not.toMatch(/on public\.user_projects for (insert|delete|all)/i);
  });

  it('requires an explicit per-member write grant, never the share default', () => {
    const policies = sql.split('create policy').slice(1);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toMatch(/a\.access = 'write'/);
      expect(policy).not.toMatch(/default_access/);
    }
  });

  it('keeps every widened policy per command, so DELETE cannot inherit a read clause', () => {
    for (const command of ['insert', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`project_knowledge_files_editor_${command}`, 'i'));
    }
    expect(sql).not.toMatch(/on public\.project_knowledge_files for all/i);
  });

  it('guards the owner column with a trigger, which RLS cannot express', () => {
    expect(sql).toContain('user_projects_owner_column_guard');
    expect(sql).toMatch(/new\.user_id is distinct from old\.user_id/i);
    expect(sql).toMatch(/new\.organization_id is distinct from old\.organization_id/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public, pg_temp/i);
  });

  it('reverses cleanly, taking the trigger and its function with the policies', () => {
    for (const name of [
      'project_knowledge_files_editor_delete',
      'project_knowledge_files_editor_update',
      'project_knowledge_files_editor_insert',
      'user_projects_org_shared_editor_update',
    ]) {
      expect(down).toContain(`drop policy if exists ${name}`);
    }
    expect(down).toContain('drop trigger if exists user_projects_owner_column_guard');
    expect(down).toContain('drop function if exists public.user_projects_owner_column_guard()');
    expect(down).toContain("where filename = '0217_shared_project_editor_write.sql'");
  });
});
