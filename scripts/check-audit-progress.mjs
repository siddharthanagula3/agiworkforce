#!/usr/bin/env node
// scripts/check-audit-progress.mjs — release gate for the audit remediation ledger.
//
// Exits non-zero while AuditRemediationLedger.md still carries unchecked tasks,
// so a release cannot be declared complete on top of an unfinished remediation
// plan. It is deliberately NOT wired into lint, typecheck, test, or CI: the only
// caller is the release-completion command scripts/launch-readiness-check.sh,
// which is run by hand immediately before tagging. Ordinary developer flows
// never invoke it.
//
// Usage: node scripts/check-audit-progress.mjs   (run from the repository root)

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const LEDGER = 'AuditRemediationLedger.md';
// Ledger task IDs look like BASE-009, CRIT-001, SEC-014.
const TASK_ID = /\b([A-Z][A-Z0-9]{1,15}-\d{1,4})\b/;
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

let inFence = false;
let headingId = null;
let heading = '(no heading)';
let done = 0;
const open = [];

for (const line of markdown.split('\n')) {
  if (/^\s*(```|~~~)/.test(line)) {
    inFence = !inFence;
    continue;
  }
  if (inFence) continue;

  const headingMatch = /^#{1,6}\s+(.+)$/.exec(line);
  if (headingMatch) {
    heading = headingMatch[1].trim();
    headingId = TASK_ID.exec(heading)?.[1] ?? null;
    continue;
  }

  const checkbox = /^\s*- \[([ xX])\]\s*(.*)$/.exec(line);
  if (!checkbox) continue;
  if (checkbox[1] !== ' ') {
    done += 1;
    continue;
  }

  const text = checkbox[2].replaceAll('**', '').trim();
  open.push(TASK_ID.exec(text)?.[1] ?? headingId ?? heading);
}

const total = done + open.length;

if (total === 0) {
  console.error(`Audit progress check failed: ${LEDGER} contains no task checkboxes.`);
  console.error('The ledger is the release stop gate; an empty ledger cannot prove completion.');
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
