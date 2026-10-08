import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const neonDir = resolve(import.meta.dirname);
const filename = '0358_shared_project_editor_needs_share_permission.sql';
const sql = readFileSync(resolve(neonDir, filename), 'utf8');
const down = readFileSync(
  resolve(neonDir, 'down/0358_shared_project_editor_needs_share_permission.down.sql'),
  'utf8',
);
const editorWrite = readFileSync(resolve(neonDir, '0217_shared_project_editor_write.sql'), 'utf8');

const POLICIES = [
  'user_projects_org_shared_editor_update',
  'project_knowledge_files_editor_insert',
  'project_knowledge_files_editor_update',
  'project_knowledge_files_editor_delete',
];

function policyBody(source: string, name: string): string {
  const start = source.indexOf(`create policy ${name}`);
  expect(start, name).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf(');\n\n', start));
}

function grantClauses(body: string): string[] {
  return body.split("and a.access = 'write'").slice(1);
}

describe('0358 an edit grant on a shared project needs a role that still shares', () => {
  it('re-states every 0217 editor policy and requires content.share in each grant clause', () => {
    for (const name of POLICIES) {
      expect(sql).toContain(`drop policy if exists ${name}`);
      const clauses = grantClauses(policyBody(sql, name));
      expect(clauses.length, name).toBe(grantClauses(policyBody(editorWrite, name)).length);
      for (const clause of clauses) {
        expect(clause).toMatch(
          /^\s*and public\.app_has_org_permission\(s\.organization_id, 'content\.share'\)/,
        );
      }
    }
  });

  it('keeps each policy on its own command, so no clause widens to another', () => {
    expect(sql).toMatch(
      /user_projects_org_shared_editor_update\s+on public\.user_projects for update/,
    );
    for (const command of ['insert', 'update', 'delete']) {
      expect(sql).toMatch(
        new RegExp(
          `project_knowledge_files_editor_${command}\\s+on public\\.project_knowledge_files for ${command}`,
        ),
      );
    }
    expect(sql).not.toMatch(/for all/i);
  });

  it('reverses to the 0217 policies exactly and forgets the migration', () => {
    for (const name of POLICIES) {
      expect(policyBody(down, name)).toBe(policyBody(editorWrite, name));
    }
    expect(down).not.toContain('content.share');
    expect(down).toContain(`where filename = '${filename}'`);
  });
});
