#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

const ledgerPath = 'docs/agent-context/non-md-artifact-status.json';
const archiveRoot = 'docs/archive/2026-06-05-doc-reset';

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(absolute(relativePath));
}

function readJson(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(absolute(relativePath), 'utf8'));
  } catch (error) {
    errors.push(`${relativePath} is not valid JSON: ${error.message}`);
    return null;
  }
}

function listFilesRecursive(relativeDir) {
  const absoluteDir = absolute(relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const out = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(relativePath));
    } else if (entry.isFile()) {
      out.push(relativePath);
    }
  }
  return out;
}

function hasFiles(relativeDir) {
  return listFilesRecursive(relativeDir).length > 0;
}

const ledger = readJson(ledgerPath);
if (ledger) {
  for (const key of [
    'version',
    'lastUpdated',
    'keepActive',
    'rebuildRequired',
    'archivedHistorical',
  ]) {
    if (!ledger[key]) {
      errors.push(`${ledgerPath} missing ${key}`);
    }
  }

  const apiEntry = (ledger.rebuildRequired ?? []).find((entry) => entry.path === 'docs/api/**');
  if (!apiEntry || apiEntry.status !== 'rebuild-required') {
    errors.push(`${ledgerPath} must mark docs/api/** as rebuild-required`);
  }
}

const blockedLiveDirs = [
  'docs/audit',
  'docs/screenshots',
  'docs/design/brand-mark-proposals',
  'docs/design/mobile-wireframes-2026-05-18',
  'audit/repo-organization/reference-index',
];

for (const dir of blockedLiveDirs) {
  if (exists(dir) && hasFiles(dir)) {
    errors.push(`${dir} is historical evidence; archive it under ${archiveRoot}`);
  }
}

const blockedLiveFiles = [
  'docs/design/pitch-deck-verified-numbers-2026-05-17.md',
  'tasks/research/_evidence.csv',
  'tasks/research/_risk_register.csv',
  'tasks/research/_search_log.csv',
];

for (const file of blockedLiveFiles) {
  if (exists(file)) {
    errors.push(`${file} is historical evidence; archive it under ${archiveRoot}`);
  }
}

for (const file of listFilesRecursive('tasks/team-status')) {
  if (file.endsWith('.txt')) {
    errors.push(`${file} is raw historical output; archive it under ${archiveRoot}`);
  }
}

// Note: the former docs/archive/2026-06-05-doc-reset/** archived-artifact
// existence checks were removed — scripts/clean-repo.mjs deletes docs/archive/**
// under the agi-alpha policy, so requiring those paths is obsolete.

const allowedLiveNonMarkdownPrefixes = [
  'docs/agent-context/',
  'docs/api/',
  'docs/design/ui-ux-reference-2026-07/',
  'docs/spec/artifacts/',
  'docs/visual-verification/',
  'audit/desktop-ui-computer-use/screenshots/',
  'audit/demo-readiness/screenshots/',
  'reports/generated/',
];
const allowedLiveNonMarkdownFiles = new Set(['audit/inventory.json']);

for (const scanRoot of ['docs', 'audit', 'reports', 'tasks']) {
  for (const file of listFilesRecursive(scanRoot)) {
    if (file.startsWith('docs/archive/')) continue;
    if (file.endsWith('.md')) continue;

    if (file.endsWith('/.DS_Store') || path.basename(file) === '.DS_Store') {
      errors.push(
        `${file} is local filesystem junk and must not be tracked or left in docs/audit/tasks`,
      );
      continue;
    }

    if (
      !allowedLiveNonMarkdownFiles.has(file) &&
      !allowedLiveNonMarkdownPrefixes.some((prefix) => file.startsWith(prefix))
    ) {
      errors.push(`${file} is an unclassified live non-Markdown artifact`);
    }
  }
}

if (errors.length > 0) {
  console.error('Non-Markdown artifact check failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Non-Markdown artifact check passed.');
