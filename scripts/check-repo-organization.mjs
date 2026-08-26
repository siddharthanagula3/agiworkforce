#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { isProtectedCleanupPath, TRACKED_STALE } from './clean-repo.mjs';

const root = process.cwd();
const errors = [];
const warnings = [];

const allowedRootFiles = new Set([
  '.git',
  '.agi-guardian.yml',
  '.claudeignore',
  '.dockerignore',
  '.env.example',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc.json',
  '.vercelignore',
  'AGI_WORKFORCE.md',
  'ARCHITECTURE.md',
  'BUILD.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'AuditRemediationLedger.md',
  'FoundersAssistance.md',
  'Cargo.lock',
  'Cargo.toml',
  'LICENSE',
  'deny.toml',
  'rust-toolchain.toml',
  'ONBOARDING.md',
  'PLAN.md',
  'README.md',
  'RELEASE.md',
  'SECURITY.md',
  'THIRD_PARTY_LICENSES.md',
  'TODO.md',
  'BREACH_RUNBOOK.md',
  'DPDP_PROGRESS.md',
  'REMEDIATION_BRIEF.md',
  'REMEDIATION_LOG.md',
  'audit-report.md',
  'audit.sh',
  'commitlint.config.cjs',
  'docker-compose.yml',
  'eslint.config.mjs',
  'node-version.txt',
  'ollama-manifest.json',
  'knip.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'skills-lock.json',
  'tsconfig.base.json',
  'turbo.json',
  'vercel.json',
  // Must live at the root: .vercelignore excludes /scripts, so an
  // ignoreCommand pointing into it can never find its own script.
  'vercel-ignore-build.sh',
]);

const knownRootDebt = new Set([
  '.DS_Store',
  '.mcp.json',
  'AUDIT_BATCHES',
  'AUDIT_FINDINGS.md',
  'AUDIT_MANIFEST.txt',
  'OVERNIGHT_REPORT.md',
  'AUDIT_PARTS',
  'AUDIT_STATE.md',
  'AUDIT_TAXONOMY.md',
  'REMEDIATION_PRIORITY.md',
  'SKILL.md',
  'PHASE2_MAP.md',
  'PUBLIC_PAGES_AUDIT.md',
  'REFERENCE_ANALYSIS.md',
  'SKILL_SESSION.md',
  'founder_work.md',
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
  '.expo',
  '.git',
  '.github',
  '.husky',
  '.remember',
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
  'infrastructure',
  'node_modules',
  'packages',
  'patches',
  'reports',
  'scripts',
  'services',
  'tasks',
  'tools',
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

if (!isProtectedCleanupPath('audit')) {
  errors.push('scripts/clean-repo.mjs must protect the live audit/ evidence ledger.');
}
if (TRACKED_STALE.some((candidate) => candidate === 'audit' || candidate.startsWith('audit/'))) {
  errors.push('scripts/clean-repo.mjs must not classify audit/ as stale cleanup output.');
}

const requiredDirs = [
  'apps',
  'audit',
  'packages',
  'crates',
  'services',
  'docs',
  'examples',
  'scripts',
  'docs/agent-context',
];

for (const dir of requiredDirs) {
  if (!fs.existsSync(path.join(root, dir))) {
    errors.push(`Missing required directory: ${dir}`);
  }
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
