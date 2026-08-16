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

  it('is the last migration to touch this table POLICIES, so its grants win', () => {
    const laterPolicyChanges = readdirSync(neonDir)
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .filter((f) => Number.parseInt(f.slice(0, 4), 10) > 90)
      .filter((f) => {
        const sqlText = readMigration(f);
        return /(create|alter|drop)\s+policy[\s\S]{0,400}?project_knowledge_files/i.test(sqlText);
      });

    expect(laterPolicyChanges).toEqual([]);
  });
});
