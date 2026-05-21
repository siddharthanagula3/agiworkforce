#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const warnings = [];

const allowedRootFiles = new Set([
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
  'app.json',
  'commitlint.config.cjs',
  'docker-compose.yml',
  'eslint.config.mjs',
  'node-version.txt',
  'ollama-manifest.json',
  'opencode.json',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'skills-lock.json',
  'tsconfig.base.json',
  'vercel.json',
]);

const knownRootDebt = new Set(['.DS_Store', '.gitignore.tmp', '.mcp.json', 'libnull.rlib']);

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
  'reports',
  'scripts',
  'services',
  'supabase',
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
  'supabase',
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

if (!fs.existsSync(path.join(root, 'audit/audit-log.md'))) {
  errors.push('Missing required audit fire log: audit/audit-log.md');
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
