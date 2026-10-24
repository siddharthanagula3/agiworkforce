#!/usr/bin/env node
/* global console */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const FRAMEWORK_STEMS = new Set([
  'index',
  'page',
  'layout',
  'route',
  'loading',
  'error',
  'not-found',
  'template',
  'default',
  'global-error',
  'opengraph-image',
  'twitter-image',
  'icon',
  'apple-icon',
  'sitemap',
  'robots',
  'manifest',
  '_layout',
  '+html',
  '+not-found',
]);

export const EXEMPT_PREFIXES = ['apps/mobile/app/', 'audit/', '.agents/skills/'];

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;
const HOOK = /^use[A-Z][A-Za-z0-9]*$/;

export function stemOf(file) {
  return path.posix.basename(file).split('.')[0];
}

export function isExempt(file) {
  if (EXEMPT_PREFIXES.some((prefix) => file.startsWith(prefix))) return true;
  const segments = file.split('/');
  if (segments.some((segment) => segment.includes('[') || segment.includes('('))) return true;
  if (segments.includes('__fixtures__')) return true;
  const stem = stemOf(file);
  return FRAMEWORK_STEMS.has(stem) || HOOK.test(stem);
}

export function namingViolations(files) {
  return files
    .filter((file) => file.endsWith('.tsx'))
    .filter((file) => !isExempt(file))
    .filter((file) => !PASCAL_CASE.test(stemOf(file)))
    .sort();
}

function trackedFiles(root) {
  const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: root,
    maxBuffer: 1024 * 1024 * 64,
  });
  return output.toString('utf8').split('\0').filter(Boolean);
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const violations = namingViolations(trackedFiles(root));
  if (violations.length > 0) {
    console.error(
      'File naming check failed: .tsx files are PascalCase (hooks are useX, framework route files keep their names).',
    );
    for (const file of violations) console.error(`  ${file}`);
    process.exit(1);
  }
  console.log('File naming check passed: every .tsx file is PascalCase or exempt.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
