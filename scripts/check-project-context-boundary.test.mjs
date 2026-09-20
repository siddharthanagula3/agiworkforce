import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  findUnloadedProjectRenders,
  findUnscopedProjectReads,
  projectScopedTables,
  extractStatements,
} from './lib/project-context-boundary.mjs';
import { renderers, run } from './check-project-context-boundary.mjs';

const MIGRATION = `
create table if not exists public.user_projects (
  id uuid primary key,
  user_id text not null,
  deleted_at timestamptz
);

create table if not exists public.project_knowledge_files (
  id uuid primary key,
  project_id uuid not null,
  deleted_at timestamptz
);
`;

function makeRepo(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'project-boundary-'));
  mkdirSync(path.join(root, 'apps/web/db/neon'), { recursive: true });
  writeFileSync(path.join(root, 'apps/web/db/neon/0001_projects.sql'), MIGRATION);
  for (const [relative, source] of Object.entries(files)) {
    const full = path.join(root, relative);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, source);
  }
  return root;
}

test('enumerates the project-scoped tables from the migrations', () => {
  const root = makeRepo({});
  try {
    const tables = projectScopedTables(root);
    assert.ok(tables.has('user_projects'));
    assert.ok(tables.has('project_knowledge_files'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fails on a project read that binds no account', () => {
  const root = makeRepo({
    'apps/web/lib/services/leaky.ts': `
      export async function readFiles(db, projectId) {
        return db.query(
          \`select id, file_name
             from project_knowledge_files
            where project_id = $1 and deleted_at is null\`,
          [projectId],
        );
      }
    `,
  });
  try {
    const findings = findUnscopedProjectReads(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'apps/web/lib/services/leaky.ts');
    assert.deepEqual(findings[0].tables, ['project_knowledge_files']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts a project read that binds the owner in the same statement', () => {
  const root = makeRepo({
    'apps/web/lib/services/scoped.ts': `
      export async function readFiles(db, projectId, userId) {
        return db.query(
          \`select k.id
             from project_knowledge_files k
             join user_projects p on p.id = k.project_id
            where k.project_id = $1 and p.user_id = $2\`,
          [projectId, userId],
        );
      }
    `,
  });
  try {
    assert.deepEqual(findUnscopedProjectReads(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts a project read that follows the authorising project read', () => {
  const root = makeRepo({
    'apps/web/lib/services/authorised.ts': `
      export async function load(db, projectId, userId) {
        const [project] = await db.query(
          \`select id from user_projects where id = $1 and user_id = $2 limit 1\`,
          [projectId, userId],
        );
        if (!project) return null;
        return db.query(
          \`select id from project_knowledge_files where project_id = $1 and deleted_at is null\`,
          [projectId],
        );
      }
    `,
  });
  try {
    assert.deepEqual(findUnscopedProjectReads(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an unauthorised read before the authorising one is still a finding', () => {
  const root = makeRepo({
    'apps/web/lib/services/ordered.ts': `
      export async function load(db, projectId, userId) {
        const early = await db.query(
          \`select id from project_knowledge_files where project_id = $1\`,
          [projectId],
        );
        const [project] = await db.query(
          \`select id from user_projects where id = $1 and user_id = $2 limit 1\`,
          [projectId, userId],
        );
        return project ? early : null;
      }
    `,
  });
  try {
    const findings = findUnscopedProjectReads(root);
    assert.equal(findings.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores a statement that reads the table without narrowing by project', () => {
  const root = makeRepo({
    'apps/web/lib/services/sweep.ts': `
      export async function stale(db) {
        return db.query(
          \`select id from project_knowledge_files where deleted_at < now() - interval '30 days'\`,
        );
      }
    `,
  });
  try {
    assert.deepEqual(findUnscopedProjectReads(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ignores tests and fixtures', () => {
  const root = makeRepo({
    'apps/web/lib/services/__tests__/leaky.test.ts': `
      const sql = \`select id from project_knowledge_files where project_id = $1\`;
    `,
  });
  try {
    assert.deepEqual(findUnscopedProjectReads(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('extractStatements keeps only SQL, in source order', () => {
  const statements = extractStatements(
    'const a = `select 1 from user_projects where id = $1`;\n' +
      'const b = `not sql at all`;\n' +
      'const c = `select 2 from project_knowledge_files where project_id = $1`;',
  );
  assert.equal(statements.length, 2);
  assert.match(statements[0].sql, /user_projects/);
  assert.match(statements[1].sql, /project_knowledge_files/);
});

test('fails when a project prompt is rendered without the scoped loader', () => {
  const root = makeRepo({
    'apps/web/lib/services/voice.ts': `
      import { renderProjectContext } from './project-context-service';
      export function brief(context) {
        return renderProjectContext(context).prompt;
      }
    `,
  });
  try {
    const findings = findUnloadedProjectRenders(root);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].file, 'apps/web/lib/services/voice.ts');
    assert.deepEqual(findings[0].renderers, ['renderProjectContext']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('accepts a module that loads the project before rendering it', () => {
  const root = makeRepo({
    'apps/web/lib/services/voice.ts': `
      import { loadProjectContext, renderProjectContext } from './project-context-service';
      export async function brief(db, projectId, userId) {
        const context = await loadProjectContext(db, { projectId, userId });
        return context ? renderProjectContext(context).prompt : null;
      }
    `,
  });
  try {
    assert.deepEqual(findUnloadedProjectRenders(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the repository is clean apart from the recorded baseline', () => {
  assert.deepEqual(run(), []);
  assert.deepEqual(renderers(), []);
});
