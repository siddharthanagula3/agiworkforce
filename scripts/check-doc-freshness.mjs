#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const warnings = [];

// A "Last updated" line is worse than no line when it disagrees with git: it
// invites a reader to trust a date nobody maintains. This checks the claim
// against the commit that actually touched the file.
const REGISTRY = 'docs/agent-context/doc-status.json';
const HEADER = /^Last updated:\s*(\d{4}-\d{2}-\d{2})\s*$/m;
const DRIFT_DAYS = 120;

// --follow --diff-filter=AM measures the last commit that changed the file's
// CONTENT. A plain `git log -1` counts a pure rename, so a documentation move
// would make every header in the tree look stale on the day it landed.
function lastContentChange(file) {
  const out = execFileSync(
    'git',
    ['log', '--follow', '-1', '--format=%cs', '--diff-filter=AM', '--', file],
    { cwd: root, encoding: 'utf8' },
  ).trim();
  return out || null;
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY), 'utf8'));
const registered = [
  ...(registry.currentSourcesOfTruth ?? []),
  ...(registry.currentEvidence ?? []),
].filter((entry) => typeof entry === 'string' && entry.endsWith('.md'));

for (const file of registered) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    errors.push(`${file} is registered in ${REGISTRY} but does not exist`);
    continue;
  }

  const body = fs.readFileSync(absolute, 'utf8');
  const match = body.match(HEADER);
  if (!match) {
    errors.push(`${file} is a registered source of truth and must carry a "Last updated:" header`);
    continue;
  }

  const claimed = match[1];
  const actual = lastContentChange(file);
  if (!actual) continue;

  const drift = daysBetween(claimed, actual);
  if (drift > DRIFT_DAYS) {
    errors.push(
      `${file} claims Last updated ${claimed} but was last committed ${actual} (${drift} days later); re-read it and correct the header`,
    );
  } else if (drift > 0) {
    warnings.push(`${file}: header ${claimed}, last commit ${actual} (${drift} days behind)`);
  }
}

if (errors.length > 0) {
  console.error('Documentation freshness check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

if (warnings.length > 0) {
  console.warn(
    `Documentation freshness check passed with ${warnings.length} header(s) behind git:`,
  );
  for (const warning of warnings) console.warn(`- ${warning}`);
} else {
  console.log(`Documentation freshness check passed (${registered.length} registered documents).`);
}
