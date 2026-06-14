#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const warnings = [];

const allowedRootFiles = new Set([
  '.git',
  '.claudeignore',
  '.env.example',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc.json',
  '.vercelignore',
  'AGENTS.md',
  'AGI_WORKFORCE.md',
  'BUILD.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'Cargo.lock',
  'Cargo.toml',
  'LICENSE',
  'ONBOARDING.md',
  'PLAN.md',
  'README.md',
  'THIRD_PARTY_LICENSES.md',
  'TODO.md',
  // Hardening-mission root instruments (root-level by design — REMEDIATION_BRIEF.md
  // is the operating contract and references audit.sh/audit-report.md "at the repo root").
  'REMEDIATION_BRIEF.md',
  'REMEDIATION_LOG.md',
  'audit-report.md',
  'audit.sh',
  'commitlint.config.cjs',
  'docker-compose.yml',
  'eslint.config.mjs',
  'node-version.txt',
  'ollama-manifest.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'skills-lock.json',
  'tsconfig.base.json',
  'vercel.json',
]);

const knownRootDebt = new Set([
  '.DS_Store',
  '.gitignore.tmp',
  '.mcp.json',
  'AUDIT_BATCHES',
  'AUDIT_FINDINGS.md',
  'AUDIT_MANIFEST.txt',
  'AUDIT_PARTS',
  'AUDIT_STATE.md',
  'AUDIT_TAXONOMY.md',
  'REMEDIATION_PRIORITY.md',
  'SKILL.md',
  // VC-demo production-push workflow deliverables (audit map / public-pages audit /
  // reference analysis / session notes). Transient — relocate under docs/ once the
  // push lands; tracked as known root debt (not unclassified) until then.
  'PHASE2_MAP.md',
  'PUBLIC_PAGES_AUDIT.md',
  'REFERENCE_ANALYSIS.md',
  'SKILL_SESSION.md',
  'libnull.rlib',
]);

const allowedRootDirs = new Set([
  '.agent',
  '.agents',
  '.cache',
  '.cargo',
  '.claude',
  '.code-review-graph',
  '.codex',
  '.cursor',
  '.expo',
  '.git',
  '.github',
  '.husky',
  '.minimax',
  '.opencode',
  '.playwright-mcp',
  '.remember',
  '.superpowers',
  '.tmp_capture',
  '.vercel',
  '.vscode',
  '.worktrees',
  '_archive',
  'apps',
  'audit',
  'crates',
  'dev-scripts',
  'docs',
  'examples',
  'ios',
  'node_modules',
  'packages',
  'patches',
  'reports',
  'scripts',
  'services',
  'tasks',
]);

function isGitIgnored(entryName) {
  const result = spawnSync('git', ['check-ignore', '-q', '--', entryName], {
    cwd: root,
    stdio: 'ignore',
  });
  return result.status === 0;
}

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (isGitIgnored(entry.name)) {
    continue;
  }

  if (entry.isDirectory()) {
    if (!allowedRootDirs.has(entry.name)) {
      if (knownRootDebt.has(entry.name)) {
        warnings.push(`Known root cleanup debt: ${entry.name}`);
      } else {
        errors.push(`Unclassified root directory: ${entry.name}`);
      }
    }
    continue;
  }

  if (allowedRootFiles.has(entry.name)) {
    continue;
  }

  if (knownRootDebt.has(entry.name)) {
    warnings.push(`Known root cleanup debt: ${entry.name}`);
    continue;
  }

  errors.push(`Unclassified root file: ${entry.name}`);
}

const requiredDirs = [
  'apps',
  'packages',
  'crates',
  'services',
  'docs',
  'audit',
  'tasks',
  'reports',
  'examples',
  'scripts',
  'docs/agent-context',
];

for (const dir of requiredDirs) {
  if (!fs.existsSync(path.join(root, dir))) {
    errors.push(`Missing required directory: ${dir}`);
  }
}

if (!fs.existsSync(path.join(root, 'audit/INDEX.md'))) {
  errors.push('Missing required audit index: audit/INDEX.md');
}

for (const staleConfig of ['app.json', 'apps/mobile/app.json']) {
  if (fs.existsSync(path.join(root, staleConfig))) {
    errors.push(
      `Stale Expo config must stay removed: ${staleConfig}. Use apps/mobile/app.config.js.`,
    );
  }
}

if (fs.existsSync(path.join(root, 'opencode.json'))) {
  errors.push('Root opencode.json is retired. Use .opencode/opencode.json.');
}

if (fs.existsSync(path.join(root, 'apps/web/pnpm-workspace.yaml'))) {
  const webReadme = fs.existsSync(path.join(root, 'apps/web/README.md'))
    ? fs.readFileSync(path.join(root, 'apps/web/README.md'), 'utf8')
    : '';
  if (!webReadme.includes('apps/web/pnpm-workspace.yaml')) {
    errors.push('apps/web/pnpm-workspace.yaml must be documented in apps/web/README.md');
  }
}

const planPath = path.join(root, 'docs/plans/pre-release-repo-organization-2026-05-20.md');
if (!fs.existsSync(planPath)) {
  errors.push('Missing pre-release repo organization plan.');
} else {
  const plan = fs.readFileSync(planPath, 'utf8');
  for (const marker of ['Status:', 'Owner:', 'Last updated:', 'LLM Operability']) {
    if (!plan.includes(marker)) {
      errors.push(`Pre-release plan missing marker: ${marker}`);
    }
  }
}

if (errors.length > 0) {
  console.error('Repo organization check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    console.error('\nKnown cleanup debt:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn('Repo organization check passed with known cleanup debt:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
} else {
  console.log('Repo organization check passed.');
}
