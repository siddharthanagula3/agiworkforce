#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const errors = [];

// The previous agent-doc corpus was deleted in 0dbae4f2b at 1,482 lines across
// 17 files because nothing kept it honest. These are the properties that make
// the replacement different, enforced rather than intended.
const AGENTS = 'AGENTS.md';
const CLAUDE = 'CLAUDE.md';

// A contract nobody finishes reading is not a contract. AGENTS.md is loaded
// into every agent's context; CLAUDE.md is an adapter and must stay thin.
const MAX_LINES = { [AGENTS]: 260, [CLAUDE]: 80 };

// Rules an agent must not be able to miss, stated as substrings so a rewrite
// that drops the rule fails rather than silently weakening it.
const REQUIRED_IN_AGENTS = [
  'canonical owner',
  'working tree',
  'fails closed',
  'trust boundaries',
  'never hand-edit',
];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

for (const [file, limit] of Object.entries(MAX_LINES)) {
  if (!fs.existsSync(path.join(root, file))) {
    errors.push(`${file} must exist; four shipped surfaces read it at runtime`);
    continue;
  }
  const lines = read(file).split('\n').length;
  if (lines > limit) {
    errors.push(
      `${file} is ${lines} lines, over the ${limit}-line budget; move detail into docs/ and leave a pointer`,
    );
  }
}

if (fs.existsSync(path.join(root, AGENTS))) {
  const body = read(AGENTS).toLowerCase();
  for (const rule of REQUIRED_IN_AGENTS) {
    if (!body.includes(rule.toLowerCase())) {
      errors.push(`${AGENTS} must still state the rule containing ${JSON.stringify(rule)}`);
    }
  }
}

if (fs.existsSync(path.join(root, CLAUDE))) {
  const body = read(CLAUDE);
  if (!body.includes(AGENTS)) {
    errors.push(`${CLAUDE} must point at ${AGENTS}; it is an adapter, not a second contract`);
  }
}

const KNOWN_SCOPED = new Set(['apps/web/AGENTS.md', 'apps/web/CLAUDE.md']);
const scoped = execFileSync('git', ['ls-files', '*AGENTS.md', '*CLAUDE.md'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
  .filter((file) => file.includes('/') && !KNOWN_SCOPED.has(file));

for (const file of scoped) {
  errors.push(
    `${file} is an unregistered scoped agent file; add it to KNOWN_SCOPED here with a reason, or fold its rules into ${AGENTS}`,
  );
}

if (errors.length > 0) {
  console.error('Agent documentation check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Agent documentation check passed (${AGENTS}, ${CLAUDE}, ${scoped.length} scoped).`);
