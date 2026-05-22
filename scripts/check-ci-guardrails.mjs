#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function requireIncludes(relativePath, expected) {
  if (!exists(relativePath)) {
    errors.push(`Missing required CI file: ${relativePath}`);
    return;
  }

  const body = readText(relativePath);
  if (!body.includes(expected)) {
    errors.push(`${relativePath} must include ${JSON.stringify(expected)}`);
  }
}

function requireNotIncludes(relativePath, forbidden) {
  if (!exists(relativePath)) return;
  const body = readText(relativePath);
  if (body.includes(forbidden)) {
    errors.push(`${relativePath} must not include ${JSON.stringify(forbidden)}`);
  }
}

requireIncludes('.github/workflows/repo-operability.yml', 'pull_request:');
requireIncludes('.github/workflows/repo-operability.yml', 'bash scripts/check-node-version.sh');
requireIncludes('.github/workflows/repo-operability.yml', 'pnpm install --frozen-lockfile');
requireIncludes('.github/workflows/repo-operability.yml', 'pnpm check:llm-operability');

requireIncludes('.github/workflows/ci.yml', 'python3 scripts/check-no-conflict-markers.py');
requireIncludes('.github/workflows/ci.yml', 'pnpm audit --audit-level=critical');
requireIncludes('.github/workflows/ci.yml', 'pnpm audit --audit-level=high');
requireIncludes('.github/workflows/ci.yml', 'pnpm lint');
requireIncludes('.github/workflows/ci.yml', 'pnpm typecheck:all');
requireIncludes('.github/workflows/ci.yml', 'pnpm test');
requireIncludes('.github/workflows/ci.yml', 'pnpm --filter @agiworkforce/web build');
requireIncludes('.github/workflows/ci.yml', 'cargo audit --deny warnings');
requireIncludes(
  '.github/workflows/ci.yml',
  'cargo clippy -p agiworkforce-desktop -p agiworkforce-cli --lib',
);
requireIncludes('.github/workflows/ci.yml', 'bash apps/desktop/check-wiring.sh');

requireIncludes('.github/workflows/ci.yml', 'Semgrep (security audit)');
requireIncludes('.github/workflows/ci.yml', 'continue-on-error: true');
requireIncludes('.github/workflows/ci.yml', 'TEMPORARY revert to advisory mode');
requireIncludes('.github/workflows/ci.yml', 'proper drive-to-zero');

requireIncludes(
  '.github/workflows/actions-pinned-check.yml',
  'All third-party actions are SHA-pinned',
);
requireIncludes('.github/workflows/actions-pinned-check.yml', '@[0-9a-f]{40}');
requireIncludes('.github/workflows/release-cli.yml', 'agiworkforce-*.${{ matrix.archive }}');
requireNotIncludes('.github/workflows/ci.yml', '--filter web');

if (errors.length > 0) {
  console.error('CI guardrail check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('CI guardrail check passed.');
