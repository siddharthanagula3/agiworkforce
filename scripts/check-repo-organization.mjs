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
  'AGENTS.md',
  'AGI_WORKFORCE.md',
  'ARCHITECTURE.md',
  'BUILD.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'Cargo.lock',
  'Cargo.toml',
  'LICENSE',
  'deny.toml',
  'rust-toolchain.toml',
  'ONBOARDING.md',
  'PLAN.md',
  'README.md',
  'SECURITY.md',
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
  // knip resolves its config from the repo root and offers no way to relocate
  // it, so this is root-level by tool constraint rather than by choice. Backs
  // `check:knip` / `check:knip:production`; the rationale, the first-run
  // numbers, and the path to making it a CI gate live in
  // docs/engineering/dead-code-detection.md.
  'knip.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'skills-lock.json',
  'tsconfig.base.json',
  'turbo.json',
  'vercel.json',
]);

const knownRootDebt = new Set([
  '.DS_Store',
  '.mcp.json',
  'AUDIT_BATCHES',
  'AUDIT_FINDINGS.md',
  'AUDIT_MANIFEST.txt',
  // Session report deliverable. Transient — relocate under docs/ after the
  // P2 PR lands; tracked as known root debt (not unclassified) until then.
  'OVERNIGHT_REPORT.md',
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
  // Agent<>founder handoff ledger (keys / docs / decisions the founder still owes).
  // Transient — relocate under docs/ once the production push settles.
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

// audit/ is the live evidence-ledger root and must remain both required and
// protected from cleanup. tasks/ and reports/ remain optional disposable roots;
// durable conclusions live in docs/agent-context/known-flaws.md and docs/current.
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
