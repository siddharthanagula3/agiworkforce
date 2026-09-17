import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);

function readMigration(name: string): string {
  return readFileSync(resolve(neonDir, name), 'utf8');
}

describe('0090 shared project knowledge is read-only for org members', () => {
  const sql = readMigration('0090_shared_project_knowledge_read_only.sql');

  it('does not reintroduce a FOR ALL policy on project_knowledge_files', () => {
    expect(sql).not.toMatch(/on\s+public\.project_knowledge_files\s+for\s+all/i);
  });

  it('grants org members SELECT only', () => {
    expect(sql).toMatch(
      /create policy project_knowledge_files_shared_read[\s\S]*?for select to app_rls/i,
    );
    const readPolicy = sql.slice(
      sql.indexOf('create policy project_knowledge_files_shared_read'),
      sql.indexOf('create policy project_knowledge_files_owner_insert'),
    );
    expect(readPolicy).toContain('organization_shared_projects');
  });

  it('restricts INSERT, UPDATE and DELETE to the project owner', () => {
    for (const command of ['insert', 'update', 'delete']) {
      expect(sql).toMatch(
        new RegExp(`create policy project_knowledge_files_owner_${command}`, 'i'),
      );
    }

    const writeSection = sql.slice(
      sql.indexOf('create policy project_knowledge_files_owner_insert'),
    );
    expect(writeSection).not.toContain('organization_shared_projects');
    expect(writeSection).not.toContain('app_org_resource_is_readable');
  });

  it('preserves the per-member explicit denial on the read path', () => {
    expect(sql).toContain('organization_project_access');
    expect(sql).toMatch(/a\.access = 'none'/);
  });

  it('drops the superseded 0086 policy by name so the fix is idempotent', () => {
    expect(sql).toContain(
      'drop policy if exists project_knowledge_files_tenant_isolation on public.project_knowledge_files',
    );
  });

  /**
   * A later migration may widen these policies, but only deliberately. Each
   * entry is a reviewed decision recorded here so a future widening has to be
   * argued for in a diff rather than landing as a quiet `create policy`.
   */
  const REVIEWED_LATER_POLICY_CHANGES = ['0217_shared_project_editor_write.sql'];

  it('is the last unreviewed migration to touch this table POLICIES, so its grants win', () => {
    const laterPolicyChanges = readdirSync(neonDir)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .filter((f) => Number.parseInt(f.slice(0, 4), 10) > 90)
      .filter((f) => {
        const sqlText = readMigration(f);
        return /(create|alter|drop)\s+policy\s+(if\s+exists\s+)?\w+\s+on\s+(public\.)?project_knowledge_files\b/i.test(
          sqlText,
        );
      })
      .filter((f) => !REVIEWED_LATER_POLICY_CHANGES.includes(f));

    expect(laterPolicyChanges).toEqual([]);
  });

  it('keeps every reviewed widening gated on an explicit per-member write grant', () => {
    for (const file of REVIEWED_LATER_POLICY_CHANGES) {
      const later = readMigration(file);
      const knowledgePolicies = later
        .split('create policy')
        .filter((chunk) => /on public\.project_knowledge_files/i.test(chunk));

      expect(knowledgePolicies.length).toBeGreaterThan(0);
      for (const policy of knowledgePolicies) {
        expect(policy).toContain('organization_project_access');
        expect(policy).toMatch(/a\.access = 'write'/);
        expect(policy).not.toMatch(/for\s+all/i);
      }
    }
  });
});
