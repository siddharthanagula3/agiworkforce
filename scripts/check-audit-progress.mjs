#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const LEDGER = 'AuditRemediationLedger.md';
const TASK_ID_SOURCE = '[A-Z][A-Z0-9]{1,15}-\\d{1,4}';
const TASK_ID = new RegExp(`\\b(${TASK_ID_SOURCE})\\b`);
const HEADING_DECLARATION = new RegExp(`^#{1,6}\\s+(${TASK_ID_SOURCE})\\b`);
const CHECKBOX_DECLARATION = new RegExp(`^\\s*- \\[[ xX]\\]\\s*\\*\\*(${TASK_ID_SOURCE})\\b`);
const MAX_LISTED = 20;

const ledgerPath = path.join(process.cwd(), LEDGER);
let markdown;
try {
  markdown = fs.readFileSync(ledgerPath, 'utf8');
} catch (error) {
  console.error(
    `Audit progress check failed: cannot read ${ledgerPath} (${error.code ?? error.message}).`,
  );
  console.error('Run this command from the repository root.');
  process.exit(1);
}

/** @type {{ char: string, length: number, line: number } | null} */
let fence = null;
let headingId = null;
let heading = '(no heading)';
let done = 0;
const open = [];
/** @type {Map<string, number[]>} id -> line numbers where it is declared */
const declarations = new Map();

const declare = (id, line) => {
  const lines = declarations.get(id);
  if (lines) lines.push(line);
  else declarations.set(id, [line]);
};

const lines = markdown.split('\n');
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  const lineNumber = index + 1;

  const fenceMatch = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
  if (fenceMatch) {
    const marker = fenceMatch[1];
    if (fence === null) {
      fence = { char: marker[0], length: marker.length, line: lineNumber };
    } else if (
      marker[0] === fence.char &&
      marker.length >= fence.length &&
      fenceMatch[2].trim() === ''
    ) {
      fence = null;
    }
    continue;
  }
  if (fence) continue;

  const headingMatch = /^#{1,6}\s+(.+)$/.exec(line);
  if (headingMatch) {
    heading = headingMatch[1].trim();
    headingId = TASK_ID.exec(heading)?.[1] ?? null;
    const declared = HEADING_DECLARATION.exec(line)?.[1];
    if (declared) declare(declared, lineNumber);
    continue;
  }

  const checkbox = /^\s*- \[([ xX])\]\s*(.*)$/.exec(line);
  if (!checkbox) continue;

  const declared = CHECKBOX_DECLARATION.exec(line)?.[1];
  if (declared) declare(declared, lineNumber);

  if (checkbox[1] !== ' ') {
    done += 1;
    continue;
  }

  const text = checkbox[2].replaceAll('**', '').trim();
  open.push(TASK_ID.exec(text)?.[1] ?? headingId ?? heading);
}

const total = done + open.length;

const integrity = [];

if (fence !== null) {
  integrity.push(
    `unclosed ${fence.char.repeat(fence.length)} code fence opened at line ${fence.line} — ` +
      'every task after it was invisible to this check',
  );
}

const duplicated = [...declarations].filter(([, at]) => at.length > 1);
if (duplicated.length > 0) {
  const sample = duplicated
    .slice(0, 5)
    .map(([id, at]) => `${id} (lines ${at.join(', ')})`)
    .join('; ');
  integrity.push(
    `${duplicated.length} task ID${duplicated.length === 1 ? ' is' : 's are'} declared more than ` +
      `once — the ledger looks duplicated or badly merged, so every count below is inflated: ${sample}` +
      (duplicated.length > 5 ? `; …and ${duplicated.length - 5} more` : ''),
  );
}

if (total === 0) {
  integrity.push(`${LEDGER} contains no task checkboxes`);
}

if (integrity.length > 0) {
  console.error(`Audit progress check failed: ${LEDGER} is not in a state this gate can measure.`);
  for (const problem of integrity) console.error(`- ${problem}`);
  console.error('The ledger is the release stop gate; repair it before completing a release.');
  process.exit(1);
}

if (open.length === 0) {
  console.log(`Audit progress check passed: ${total} ledger tasks, all closed.`);
  process.exit(0);
}

const counts = new Map();
for (const id of open) {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}
const entries = [...counts.entries()];

console.error(
  `Audit progress check failed: ${open.length} of ${total} tasks in ${LEDGER} are still open (${done} closed).`,
);
for (const [id, count] of entries.slice(0, MAX_LISTED)) {
  console.error(`- ${id}: ${count} unchecked item${count === 1 ? '' : 's'}`);
}
if (entries.length > MAX_LISTED) {
  console.error(`- ...and ${entries.length - MAX_LISTED} more ledger entries with open items.`);
}
console.error(
  'Close each task, or record an evidence-backed resolution, before completing a release.',
);
process.exit(1);
