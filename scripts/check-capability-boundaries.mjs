#!/usr/bin/env node
/**
 * check:capability-boundaries
 *
 * Enforces the platform-capability single-source-of-truth on the live entry
 * points. The recurring failure mode (architecture review, 2026-06) is a chat
 * composer / slash menu defining its OWN hardcoded command or capability
 * allowlist instead of consuming the canonical registry + capability matrix —
 * which silently drifts and re-introduces desktop-on-web leaks.
 *
 * This guard fails any chat/composer/slash SURFACE file that hardcodes a
 * slash-command list (>= 4 distinct `/command` literals) without importing the
 * canonical slash-command-registry (BUILT_IN_SLASH_COMMANDS /
 * filterSlashCommandsByCapability). Known not-yet-migrated surfaces are
 * allowlisted as tracked debt so the guard passes today AND blocks NEW
 * divergence. Scope is path-limited to composer/menu/slash surfaces to avoid
 * false positives on routers (which also contain `/path` literals).
 */
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

// Only audit chat composer / slash-command / menu surfaces.
const SURFACE_RE =
  /(SlashCommand|slash-command|useSlashCommand|Composer|PlusMenu|AttachmentMenu|AddToChatSheet|ChatInput)/;
// Importing the canonical registry / capability filter = compliant.
const REGISTRY_RE =
  /(BUILT_IN_SLASH_COMMANDS|filterSlashCommandsByCapability|slash-command-registry)/;
// A slash-command id literal: '/search' (lowercase command, single segment).
const CMD_LITERAL_RE = /['"`]\/[a-z][a-z0-9-]+['"`]/g;
const MIN_DISTINCT = 4;

// Tracked debt — surfaces that still maintain a private list, pending adoption.
// Each MUST have a tracking note. The guard blocks any NEW unlisted surface.
const ALLOWLIST = new Map([
  [
    'apps/desktop/src/hooks/useSlashCommandAutocomplete.ts',
    'desktop v3 slash autocomplete — promote COMMAND_SUGGESTIONS into the shared registry (capability-architecture review Strong-Improvement)',
  ],
  [
    'apps/desktop/src/features/chat/SlashCommandMenu.tsx',
    'legacy desktop SlashCommandMenu (pre-v3) — pending registry adoption / removal',
  ],
  [
    'apps/mobile/src/features/chat/components/ChatInput.tsx',
    'mobile slash set (/image,/voice,/compare,/export) — BLOCKED on the registry being web-scoped (apps/web/features/chat/commands). Move the registry to a shared package so mobile/desktop can consume it (capability-architecture review Strong-Improvement).',
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
  if (REGISTRY_RE.test(src)) continue; // consumes the registry → compliant

  if (ALLOWLIST.has(rel)) continue; // tracked debt
  errors.push(
    `${rel}: hardcodes ${distinct.size} slash-command literals without importing the canonical ` +
      `slash-command-registry (BUILT_IN_SLASH_COMMANDS + filterSlashCommandsByCapability). ` +
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
