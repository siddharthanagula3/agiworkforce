#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const codeownersPath = '.github/CODEOWNERS';

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

if (!exists(codeownersPath)) {
  errors.push('Missing .github/CODEOWNERS.');
} else {
  const body = readText(codeownersPath);

  for (const marker of [
    'Provisional CODEOWNERS',
    'Replace @siddhartha with GitHub teams when the company/org structure exists.',
    '* @siddhartha',
  ]) {
    if (!body.includes(marker)) {
      errors.push(`${codeownersPath} must include ${JSON.stringify(marker)}`);
    }
  }

  for (const requiredPath of [
    '/AGENTS.md',
    '/CLAUDE.md',
    '/PLAN.md',
    '/TODO.md',
    '/CHANGELOG.md',
    '/docs/agent-context/',
    '/docs/engineering/',
    '/audit/',
    '/scripts/check-*.mjs',
    '/apps/cli/',
    '/apps/desktop/',
    '/apps/web/',
    '/apps/mobile/',
    '/apps/extension/',
    '/apps/extension-vscode/',
    '/packages/types/',
    '/packages/providers/',
    '/packages/llm-runtime/',
    '/packages/runtime/',
    '/packages/unified-chat/',
    '/crates/',
    '/services/',
    '/apps/web/db/neon/',
    '/docs/enterprise/',
    '/docs/security/',
    '/docs/legal/',
    '/packages/compliance/',
  ]) {
    if (!body.includes(requiredPath)) {
      errors.push(`${codeownersPath} missing required owned path: ${requiredPath}`);
    }
  }
}

if (errors.length > 0) {
  console.error('CODEOWNERS contract check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('CODEOWNERS contract check passed.');
