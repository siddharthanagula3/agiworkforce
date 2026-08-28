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

function ownedPatterns(body) {
  const patterns = [];
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const [pattern] = line.split(/\s+/);
    if (pattern && pattern !== '*') patterns.push(pattern);
  }
  return patterns;
}

function resolvesOnDisk(pattern) {
  const relativePath = pattern.replace(/^\/+/, '').replace(/\/+$/, '');
  if (relativePath === '') return { resolved: true };
  const directory = path.dirname(relativePath);
  const base = path.basename(relativePath);
  if (directory.includes('*')) {
    return { resolved: false, reason: 'only the last path segment may contain a wildcard' };
  }
  if (!base.includes('*')) return { resolved: exists(relativePath) };
  const matcher = new RegExp(
    `^${base
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*')}$`,
  );
  const absoluteDirectory = path.join(root, directory);
  if (!fs.existsSync(absoluteDirectory)) return { resolved: false };
  return { resolved: fs.readdirSync(absoluteDirectory).some((entry) => matcher.test(entry)) };
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
    '/PLAN.md',
    '/CHANGELOG.md',
    '/docs/agent-context/',
    '/docs/development/',
    '/docs/standards/',
    '/audit/',
    '/scripts/check-*.mjs',
    '/apps/cli/',
    '/apps/desktop/',
    '/apps/web/',
    '/apps/mobile/',
    '/apps/extension/',
    '/apps/extension-vscode/',
    '/packages/contracts/types/',
    '/packages/contracts/cloud-contracts/',
    '/packages/platform/artifacts/',
    '/packages/client/sync/',
    '/packages/ai/providers/',
    '/tools/',
    '/packages/ai/provider-runtime/',
    '/packages/client/client-runtime/',
    '/packages/ui/unified-chat/',
    '/crates/',
    '/services/',
    '/apps/web/db/neon/',
    '/docs/compliance/',
    '/docs/security/',
    '/packages/contracts/compliance/',
  ]) {
    if (!body.includes(requiredPath)) {
      errors.push(`${codeownersPath} missing required owned path: ${requiredPath}`);
    }
  }

  for (const pattern of ownedPatterns(body)) {
    const { resolved, reason } = resolvesOnDisk(pattern);
    if (!resolved) {
      errors.push(
        `${codeownersPath} owns a path that does not exist: ${pattern}` +
          (reason ? ` (${reason})` : ''),
      );
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
