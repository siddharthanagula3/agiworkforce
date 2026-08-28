#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireFile(relativePath) {
  if (!exists(relativePath)) {
    errors.push(`Missing required hook/config file: ${relativePath}`);
  }
}

function requireIncludes(relativePath, expected) {
  if (!exists(relativePath)) return;
  const body = readText(relativePath);
  if (!body.includes(expected)) {
    errors.push(`${relativePath} must include ${JSON.stringify(expected)}`);
  }
}

function requireExecutable(relativePath) {
  if (!exists(relativePath)) return;
  const mode = fs.statSync(path.join(root, relativePath)).mode;
  if ((mode & 0o111) === 0) {
    errors.push(`${relativePath} must be executable`);
  }
}

function requirePackageScript(name, expected) {
  const packageJson = JSON.parse(readText('package.json'));
  const actual = packageJson.scripts?.[name];
  if (!actual) {
    errors.push(`package.json missing script ${name}`);
    return;
  }
  if (expected && !actual.includes(expected)) {
    errors.push(`package.json script ${name} must include ${JSON.stringify(expected)}`);
  }
}

for (const file of [
  '.husky/commit-msg',
  '.husky/pre-commit',
  '.husky/pre-push',
  'commitlint.config.cjs',
  'docs/standards/naming-conventions.md',
]) {
  requireFile(file);
}

for (const hook of ['.husky/commit-msg', '.husky/pre-commit', '.husky/pre-push']) {
  requireExecutable(hook);
}

requireIncludes('.husky/commit-msg', 'pnpm exec commitlint --edit "$1"');
requireIncludes('.husky/pre-commit', 'pnpm exec lint-staged');
requireIncludes('.husky/pre-commit', 'pnpm check:audit-inventory');
requireIncludes('.husky/pre-commit', 'pnpm check:executable-docs');
requireIncludes('.husky/pre-commit', 'pnpm check:structure-conventions');
requireIncludes('.husky/pre-push', 'SKIP_PRE_PUSH=1');
requireIncludes('.husky/pre-push', 'pnpm check:llm-operability');
requireIncludes('.husky/pre-push', 'git diff --check');
requireIncludes('.husky/pre-push', 'git diff --cached --check');

requireIncludes('commitlint.config.cjs', '@commitlint/config-conventional');
requireIncludes('commitlint.config.cjs', 'header-max-length');
requireIncludes('commitlint.config.cjs', 'subject-case');

requirePackageScript('check:hooks', 'scripts/check-hooks.mjs');
requirePackageScript('check:audit-inventory', 'scripts/check-audit-inventory.mjs');
requirePackageScript('check:executable-docs', 'scripts/check-executable-docs.mjs');
requirePackageScript('check:llm-operability', 'pnpm check:hooks');

requireIncludes('docs/standards/naming-conventions.md', '.husky/commit-msg');
requireIncludes('docs/standards/naming-conventions.md', '.husky/pre-commit');
requireIncludes('docs/standards/naming-conventions.md', '.husky/pre-push');

if (errors.length > 0) {
  console.error('Hook check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Hook check passed.');
