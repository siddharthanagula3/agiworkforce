#!/usr/bin/env node

// Every production read that narrows by project_id must bind an account in the
// same statement, or follow one that bound the project row to an account.

import process from 'node:process';
import {
  CONTEXT_LOADER,
  findUncheckedProjectContextLoads,
  findUnloadedProjectRenders,
  findUnscopedProjectReads,
  projectScopedTables,
} from './lib/project-context-boundary.mjs';

/**
 * Reads that bind no account and are reached only behind one that does. Each
 * entry states why; the guard fails on anything not listed here.
 */
export const BASELINE = Object.freeze([
  {
    file: 'apps/web/lib/services/retrieval-index-service.ts',
    reason:
      'readProjectKnowledgeIndexStates takes an already authorised project id and runs on the ' +
      'row-level-security adapter; both callers under app/api/projects read the project for the ' +
      'signed-in user first. Move the owner into the statement if a third caller appears.',
  },
]);

const BASELINE_FILES = new Set(BASELINE.map((entry) => entry.file));

export function run(repoRoot) {
  const findings = repoRoot ? findUnscopedProjectReads(repoRoot) : findUnscopedProjectReads();
  return findings.filter((finding) => !BASELINE_FILES.has(finding.file));
}

export function renderers(repoRoot) {
  return repoRoot ? findUnloadedProjectRenders(repoRoot) : findUnloadedProjectRenders();
}

export function uncheckedLoads(repoRoot) {
  return repoRoot ? findUncheckedProjectContextLoads(repoRoot) : findUncheckedProjectContextLoads();
}

function main() {
  const tables = [...projectScopedTables()].sort();
  const violations = run();
  const unloaded = renderers();
  const unchecked = uncheckedLoads();

  if (unchecked.length > 0) {
    console.error(`Callers of ${CONTEXT_LOADER} that do not handle a null project:\n`);
    for (const finding of unchecked) {
      console.error(
        `  ${finding.file}:${finding.line}` +
          (finding.binding ? `  (${finding.binding} is never tested)` : '  (result is not bound)'),
      );
    }
    console.error(
      '\nThe loader answers null for a project that is archived, deleted, or not this\n' +
        'account\u2019s. Refuse the turn instead of running without the project.',
    );
    process.exit(1);
  }

  if (unloaded.length > 0) {
    console.error('Project prompts built without the scoped loader:\n');
    for (const finding of unloaded) {
      console.error(`  ${finding.file}  renders ${finding.renderers.join(', ')}`);
    }
    console.error(`\nRead the project through ${CONTEXT_LOADER} before rendering it.`);
    process.exit(1);
  }

  if (violations.length > 0) {
    console.error('Project reads that bind a project id but no account:\n');
    for (const violation of violations) {
      console.error(`  ${violation.file}:${violation.line}  [${violation.tables.join(', ')}]`);
      console.error(`    ${violation.sql}\n`);
    }
    console.error(
      'A project id arrives from the client. Bind user_id or organization_id in the same\n' +
        'statement, or read the project through loadProjectContext.',
    );
    process.exit(1);
  }

  console.log(
    `check-project-context-boundary: ${tables.length} project-scoped tables, ` +
      `${BASELINE.length} recorded exception(s), no unscoped project reads, ` +
      `every project prompt built through ${CONTEXT_LOADER}, every load null-checked.`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
