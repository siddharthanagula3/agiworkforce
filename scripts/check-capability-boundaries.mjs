#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

const ignoredParts = new Set([
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
  'public',
  'playwright-report',
  'test-results',
]);
const sourceExt = new Set(['.ts', '.tsx']);

const SURFACE_RE =
  /(SlashCommand|slash-command|useSlashCommand|Composer|PlusMenu|AttachmentMenu|AddToChatSheet|ChatInput)/;
const REGISTRY_RE =
  /(BUILT_IN_SLASH_COMMANDS|filterSlashCommandsByCapability|slash-command-registry)/;
const CMD_LITERAL_RE = /['"`]\/[a-z][a-z0-9-]+['"`]/g;
const MIN_DISTINCT = 4;

const ALLOWLIST = new Map([
  [
    'apps/mobile/src/features/chat/components/ChatInput.tsx',
    'mobile slash set (/image,/voice,/compare,/export) — adopt the now-shared @agiworkforce/unified-chat registry and package menu in the mobile composer.',
  ],
]);

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (ignoredParts.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (sourceExt.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

for (const file of walk(root)) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  if (!SURFACE_RE.test(rel)) continue;
  if (rel.includes('.test.') || rel.includes('__tests__')) continue;
  if (rel.endsWith('slash-command-registry.ts')) continue;

  const src = fs.readFileSync(file, 'utf8');
  const distinct = new Set((src.match(CMD_LITERAL_RE) || []).map((s) => s.replace(/['"`]/g, '')));
  if (distinct.size < MIN_DISTINCT) continue;
  if (REGISTRY_RE.test(src)) continue;

  if (ALLOWLIST.has(rel)) continue;
  errors.push(
    `${rel}: hardcodes ${distinct.size} slash-command literals without importing the canonical ` +
      `@agiworkforce/unified-chat registry (BUILT_IN_SLASH_COMMANDS + filterSlashCommandsByCapability). ` +
      `Consume the registry + capability filter instead of a private allowlist.`,
  );
}

if (errors.length > 0) {
  console.error('✗ capability-boundary check failed:\n' + errors.map((e) => '  - ' + e).join('\n'));
  console.error(
    '\nFix: import BUILT_IN_SLASH_COMMANDS + filterSlashCommandsByCapability from the registry and ' +
      'gate via useCapability/isCapabilityEnabled. If this is intentional tracked debt, add it to ' +
      'the ALLOWLIST in scripts/check-capability-boundaries.mjs with a tracking note.',
  );
  process.exit(1);
}

console.log(
  `✓ capability boundaries: all audited composer/slash surfaces consume the registry ` +
    `(${ALLOWLIST.size} tracked-debt surface(s) allowlisted, pending adoption).`,
);
