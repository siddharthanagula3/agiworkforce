#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const ignoredParts = new Set([
  'node_modules',
  'dist',
  'ios',
  '.expo',
  '.cache',
  'coverage',
  'build',
]);

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function walk(relativeDir, files = []) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return files;

  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (ignoredParts.has(entry.name)) continue;
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      walk(relativePath, files);
      continue;
    }
    files.push(relativePath);
  }

  return files;
}

function requireIncludes(relativePath, expected) {
  if (!exists(relativePath)) {
    errors.push(`Missing required structure doc: ${relativePath}`);
    return;
  }

  const body = readText(relativePath);
  if (!body.includes(expected)) {
    errors.push(`${relativePath} must include ${JSON.stringify(expected)}`);
  }
}

const forbiddenWebSrcFeatureFiles = walk('apps/web/src/features');
for (const file of forbiddenWebSrcFeatureFiles) {
  errors.push(`Web product feature code must live in apps/web/features, not ${file}`);
}

if (exists('apps/web/.feature-migration')) {
  errors.push(
    'Temporary Web feature migration directory must not exist: apps/web/.feature-migration',
  );
}

const forbiddenFeatureMarkers = [
  'src/features/',
  'Barrel re-export',
  'Do not add new code here',
  'Migrated from apps/web/features',
];

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.name.includes('\\')) {
    errors.push(`Root entry contains a backslash and must be renamed or removed: ${entry.name}`);
  }
}

if (exists('docs/planning')) {
  errors.push(
    'Use docs/plans for active plans or docs/archive for historical plans; docs/planning is retired.',
  );
}

const retiredTopLevelDocs = [
  'ARCHITECTURE.md',
  'BILLION_DOLLAR_PLAYBOOK.md',
  'HANDOFF.md',
  'HOSTING.md',
  'OWNERSHIP.md',
  'PERFORMANCE.md',
  'PRD-APPENDIX-A-DATA-MODELS.md',
  'PRD-APPENDIX-B-API-CONTRACTS.md',
  'PRD-APPENDIX-C-MONOREPO-LAYOUT.md',
  'PRD-APPENDIX-D-SCALING-OBSERVABILITY-COMPLIANCE.md',
  'PRD-MOBILE.md',
  'PRD-RESOLUTIONS-AND-AUDIT.md',
  'PRD.md',
  'PRICING.md',
  'ROADMAP.md',
  'SCALING.md',
  'VISION.md',
  'cli-binary-size-2026-05-15.md',
];

for (const docName of retiredTopLevelDocs) {
  const retiredPath = `docs/${docName}`;
  if (exists(retiredPath)) {
    errors.push(`Retired top-level doc must stay archived, not active: ${retiredPath}`);
  }
}

const activeReferencePaths = [
  'README.md',
  'ONBOARDING.md',
  'AGI_WORKFORCE.md',
  'docs/README.md',
  ...walk('docs/current'),
  ...walk('docs/surfaces'),
  ...walk('docs/decisions'),
  ...walk('docs/engineering'),
  ...walk('docs/enterprise'),
  ...walk('docs/marketing'),
  ...walk('docs/launch'),
  ...walk('docs/design'),
  ...walk('docs/research'),
  'apps/mobile/README.md',
  'packages/data-layer/README.md',
  'supabase/README.md',
  ...walk('packages/data-layer/src'),
  ...walk('packages/unified-chat/src'),
  'apps/web/app/api/me/route.ts',
  'apps/desktop/src-tauri/src/sys/commands/migration.rs',
  'apps/extension/THREAT_MODEL.md',
  'apps/mobile/components/onboarding/ByokConsentModal.tsx',
].filter((file, index, all) => exists(file) && all.indexOf(file) === index);

for (const file of activeReferencePaths) {
  if (!/\.(md|ts|tsx|rs)$/.test(file)) continue;
  const body = readText(file);
  for (const docName of retiredTopLevelDocs) {
    for (const marker of [`docs/${docName}`, `../${docName}`, `/docs/${docName}`]) {
      if (body.includes(marker)) {
        errors.push(
          `${file} references retired active doc path ${marker}; use docs/current or docs/archive/2026-05-21-docs-consolidation instead.`,
        );
      }
    }
  }
}

for (const retiredMobileWaitlistPath of [
  'apps/mobile/components/waitlist/CloudWaitlistSheet.tsx',
  'apps/mobile/services/waitlist.ts',
  'apps/mobile/stores/waitlistStore.ts',
  'apps/mobile/components/projects/ProjectCard.tsx',
  'apps/mobile/components/billing/UpsellCard.tsx',
]) {
  if (exists(retiredMobileWaitlistPath)) {
    errors.push(`Retired Mobile feature path must stay removed: ${retiredMobileWaitlistPath}`);
  }
}

for (const file of walk('apps/web/features')) {
  const body = readText(file);
  for (const marker of forbiddenFeatureMarkers) {
    if (body.includes(marker)) {
      errors.push(`${file} contains stale split-feature marker: ${marker}`);
    }
  }
}

const mobileWaitlistForbiddenImports = [
  '@/components/waitlist/CloudWaitlistSheet',
  '@/services/waitlist',
  '@/stores/waitlistStore',
  '../services/waitlist',
  '../stores/waitlistStore',
  '@/components/projects/ProjectCard',
  '../components/projects/ProjectCard',
  '@/components/billing/UpsellCard',
  '../components/billing/UpsellCard',
];

const userFacingCliDocs = [
  'README.md',
  'apps/cli/README.md',
  'apps/cli/npm/README.md',
  'apps/cli/scripts/demo.sh',
  'docs/surfaces/cli.md',
  'docs/current/agent-and-repo-operability.md',
  'docs/engineering/naming-conventions.md',
  'docs/decisions/CURRENT_DECISIONS.md',
].filter(exists);

const legacyCommandPattern =
  /\bagiworkforce\s+(login|exec|sync|plugin|session|onboarding|mcp|marketplace|ecosystem|app|init|auth-status|features|execpolicy|help|--debug|--chrome|--no-chrome|--no-tui|--resume|-p)\b/g;

for (const file of userFacingCliDocs) {
  const body = readText(file);
  const matches = [...body.matchAll(legacyCommandPattern)];
  for (const match of matches) {
    errors.push(
      `${file} uses legacy CLI command example "${match[0]}"; use "agi ${match[1]}" unless explicitly documenting the compatibility alias.`,
    );
  }
}

const workspaceFilterFiles = [
  'BUILD.md',
  'vercel.json',
  'apps/sandbox/README.md',
  'apps/web/scripts/build-chat-spa.sh',
  'apps/web/scripts/build-with-chat.sh',
  'scripts/verify-surfaces.sh',
  'scripts/launch-verify.sh',
  'docs/plans/domain-first-reorg.md',
  'docs/surfaces/web.md',
].filter(exists);

for (const file of workspaceFilterFiles) {
  const body = readText(file);
  if (body.includes('--filter web')) {
    errors.push(`${file} uses ambiguous pnpm filter "--filter web"; use "@agiworkforce/web".`);
  }
}

for (const file of walk('apps/mobile')) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  const body = readText(file);
  for (const marker of mobileWaitlistForbiddenImports) {
    if (body.includes(marker)) {
      errors.push(`${file} imports retired Mobile waitlist path: ${marker}`);
    }
  }
}

requireIncludes('apps/web/README.md', '`features/` - product-domain feature code.');
requireIncludes('apps/web/src/README.md', 'Product-domain code belongs in');
requireIncludes('apps/web/features/index.ts', 'canonical Web product-domain root');
requireIncludes('docs/plans/domain-first-reorg.md', '`apps/web/features/`');
requireIncludes('docs/plans/domain-first-reorg.md', '`apps/mobile/src/features');
requireIncludes('docs/plans/domain-first-reorg.md', '`apps/desktop/src/features');
requireIncludes('docs/engineering/naming-conventions.md', 'Primary CLI command: `agi`.');
requireIncludes(
  'docs/engineering/naming-conventions.md',
  'Compatibility CLI alias: `agiworkforce`.',
);
requireIncludes(
  'docs/engineering/naming-conventions.md',
  'Use `PLAN.md` for active strategic plan and phase structure.',
);
requireIncludes('apps/cli/Cargo.toml', 'default-run = "agi"');
requireIncludes('apps/cli/Cargo.toml', 'name = "agi"\npath = "src/main.rs"');
requireIncludes('apps/cli/Cargo.toml', 'name = "agiworkforce"\npath = "src/bin/agiworkforce.rs"');
requireIncludes('apps/cli/npm/package.json', '"agi": "bin/agi.js"');
requireIncludes('apps/cli/npm/package.json', '"agiworkforce": "bin/agiworkforce.js"');
requireIncludes('vercel.json', 'pnpm --filter @agiworkforce/web build');

if (errors.length > 0) {
  console.error('Structure convention check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Structure convention check passed.');
