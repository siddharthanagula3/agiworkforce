#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const CHECKLIST = 'docs/work/enterprise-master-build-checklist-2026-09-16.md';
const VERSION_MATRIX = '.github/cross-version-matrix.json';
const SURFACE_CHAIN = '.github/cross-surface-e2e-chain.json';
const WORKFLOW = '.github/workflows/cross-version-compatibility.yml';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

/**
 * Titles of one numbered checklist section, in the order the checklist lists
 * them. Read from the checklist rather than copied into the manifest, so a row
 * added there fails this guard instead of quietly going unmeasured.
 */
export function checklistTitles(markdown, section) {
  const start = markdown.indexOf(`\n# ${section}.`);
  if (start === -1) return [];
  const rest = markdown.slice(start + 1);
  const end = rest.indexOf('\n# ');
  const body = end === -1 ? rest : rest.slice(0, end);
  return [
    ...body.matchAll(/^- \[[ x]\] (.+?)(?: _\(revised\)_)?(?: ⛔.*)?(?: - (?:🔴|🟡|🟢).*)?$/gmu),
  ].map((match) => match[1].trim());
}

function compare(kind, expected, actual) {
  const missing = expected.filter((title) => !actual.includes(title));
  const extra = actual.filter((title) => !expected.includes(title));
  for (const title of missing) {
    errors.push(`${kind}: the checklist lists "${title}" and the manifest does not.`);
  }
  for (const title of extra) {
    errors.push(`${kind}: the manifest lists "${title}" and the checklist does not.`);
  }
}

function checkVersionMatrix(markdown) {
  const matrix = readJson(VERSION_MATRIX);
  compare(
    VERSION_MATRIX,
    checklistTitles(markdown, 109),
    matrix.pairs.map((pair) => pair.title),
  );

  for (const pair of matrix.pairs) {
    const label = `${VERSION_MATRIX} pair ${pair.id}`;
    if (pair.status === 'covered') {
      if (!pair.test || !exists(pair.test)) {
        errors.push(
          `${label} claims coverage from ${pair.test ?? '(no file)'}, which is not there.`,
        );
      }
      if (!pair.command) errors.push(`${label} claims coverage but names no command to run it.`);
      if (pair.reason || pair.unblockedBy) {
        errors.push(`${label} is covered and blocked at once; a pair is one or the other.`);
      }
      continue;
    }
    if (pair.status !== 'blocked') {
      errors.push(
        `${label} has status ${JSON.stringify(pair.status)}; use "covered" or "blocked".`,
      );
      continue;
    }
    if (!pair.reason) errors.push(`${label} is blocked and does not say why.`);
    if (!pair.unblockedBy)
      errors.push(`${label} is blocked and does not name what would unblock it.`);
    if (pair.test || pair.command) {
      errors.push(`${label} is blocked yet names a test to run; a blocked pair runs nothing.`);
    }
  }
}

function checkSurfaceChain(markdown) {
  const chain = readJson(SURFACE_CHAIN);
  compare(
    SURFACE_CHAIN,
    checklistTitles(markdown, 110),
    chain.steps.map((step) => step.title),
  );

  const orders = chain.steps.map((step) => step.order);
  if (orders.some((order, index) => order !== index + 1)) {
    errors.push(`${SURFACE_CHAIN}: steps must be numbered 1..n in chain order.`);
  }
  if (chain.tenant.state === 'absent' && !chain.tenant.unblockedBy) {
    errors.push(
      `${SURFACE_CHAIN}: the tenant is absent and nothing names the action that creates it.`,
    );
  }

  for (const step of chain.steps) {
    const label = `${SURFACE_CHAIN} step ${step.id}`;
    const surface = chain.surfaces[step.surface];
    if (!surface) {
      errors.push(
        `${label} names surface ${JSON.stringify(step.surface)}, which this file does not declare.`,
      );
      continue;
    }
    if (step.status === 'covered') {
      if (!step.spec || !exists(step.spec)) {
        errors.push(
          `${label} claims coverage from ${step.spec ?? '(no file)'}, which is not there.`,
        );
      }
      if (chain.tenant.state === 'absent') {
        errors.push(`${label} claims coverage while the tenant it runs against does not exist.`);
      }
      continue;
    }
    if (step.status !== 'blocked') {
      errors.push(
        `${label} has status ${JSON.stringify(step.status)}; use "covered" or "blocked".`,
      );
      continue;
    }
    const causes = step.blockedBy ?? [];
    if (causes.length === 0) errors.push(`${label} is blocked and names no cause.`);
    for (const cause of causes) {
      if (cause === 'tenant' && chain.tenant.state !== 'absent') {
        errors.push(`${label} blames the tenant, which this file says exists.`);
      }
      if (cause === 'surface' && surface.drivable !== false) {
        errors.push(`${label} blames its surface, which this file says is drivable.`);
      }
      if (cause !== 'tenant' && cause !== 'surface') {
        errors.push(
          `${label} names cause ${JSON.stringify(cause)}; only "tenant" and "surface" resolve.`,
        );
      }
    }
    if (!surface.drivable && !surface.why) {
      errors.push(
        `${SURFACE_CHAIN}: surface ${step.surface} is not drivable and does not say why.`,
      );
    }
  }
}

function checkWorkflowRunsWhatIsCovered() {
  if (!exists(WORKFLOW)) {
    errors.push(`Missing ${WORKFLOW}; the matrices are only honest if a workflow runs them.`);
    return;
  }
  const workflow = read(WORKFLOW);
  for (const pair of readJson(VERSION_MATRIX).pairs) {
    if (pair.status !== 'covered') continue;
    if (!workflow.includes(pair.id)) {
      errors.push(`${WORKFLOW} does not run covered pair ${pair.id}.`);
    }
  }
  if (!workflow.includes('scripts/check-cross-version-matrix.mjs')) {
    errors.push(`${WORKFLOW} must run this guard, otherwise the matrices drift unchecked.`);
  }
  if (!workflow.includes('scripts/run-cross-surface-chain.mjs')) {
    errors.push(`${WORKFLOW} must run the cross-surface chain runner.`);
  }
}

export function runChecks() {
  errors.length = 0;
  const markdown = read(CHECKLIST);
  checkVersionMatrix(markdown);
  checkSurfaceChain(markdown);
  checkWorkflowRunsWhatIsCovered();
  return [...errors];
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const found = runChecks();
  if (found.length > 0) {
    console.error('Cross-version and cross-surface matrix check failed:\n');
    for (const error of found) console.error(`- ${error}\n`);
    console.error(
      'A pair or step that claims coverage it does not have turns the gap it was written to\n' +
        'record into a green check. Name the test, or name what would unblock it.\n',
    );
    process.exit(1);
  }
  const pairs = readJson(VERSION_MATRIX).pairs;
  const steps = readJson(SURFACE_CHAIN).steps;
  console.log(
    `Cross-version matrix check passed (${pairs.filter((pair) => pair.status === 'covered').length} of ` +
      `${pairs.length} §109 pairs covered, ${steps.filter((step) => step.status === 'covered').length} of ` +
      `${steps.length} §110 chain steps covered).`,
  );
}
