#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const IGNORED = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  '.next',
  'target',
  'coverage',
  '.cache',
  '.turbo',
  '.expo',
  'Pods',
  '.vercel',
  'dist-web',
  '.vscode-test',
  'playwright-report',
  'test-results',
]);
const SOURCE_EXT = new Set(['.ts', '.tsx']);

const INLINE_ADMIN_ROLE =
  /\[\s*(['"`])(owner|admin)\1\s*,\s*(['"`])(owner|admin)\3\s*\]\s*(?:as const\s*)?\.\s*includes\s*\(/;

const HELPER = 'isOrganizationAdminRole';
const HELPER_SOURCE = 'packages/contracts/types/src/enterprise/index.ts';

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.github') continue;
    if (IGNORED.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (SOURCE_EXT.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const offenders = [];
for (const file of walk(root)) {
  const relative = path.relative(root, file);
  if (relative === HELPER_SOURCE) continue;
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split('\n');
  for (const [index, line] of lines.entries()) {
    if (INLINE_ADMIN_ROLE.test(line)) {
      offenders.push(`${relative}:${index + 1}  ${line.trim()}`);
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `check:org-role-checks — ${offenders.length} inline organization-admin role test(s) found.\n` +
      `Use ${HELPER}() from @agiworkforce/types so one edit changes every gate.\n`,
  );
  for (const offender of offenders) console.error(`  ${offender}`);
  process.exit(1);
}

console.log(
  'check:org-role-checks — every organization-admin gate goes through the shared helper.',
);
