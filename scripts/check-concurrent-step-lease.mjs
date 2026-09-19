#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SCAN_DIRS = ['apps/web/lib', 'apps/web/app/api'];
const OPERATIONS_TABLE = 'public.cloud_agent_execution_operations';

// One step of a Work run may execute once. The ledger row is the single owner
// token, so a statement that starts or ends an attempt has to prove it holds
// the lease, or hold the row lock the claim transaction took.
const LEASE_PREDICATE = /\blease_token\s*=\s*\$/;
const ROW_LOCK = /\bfor\s+update\b/i;
// Settling an operation whose outcome was never observed is the one write with
// no lease to hold: nothing is executing, and pinning the state it is leaving
// lets exactly one settlement win.
const SETTLEMENT_PREDICATE = /\bstatus\s*=\s*'outcome_unknown'/;
const TRANSACTION_CALLBACK = /\.transaction\s*\(\s*async\s*\(\s*(tx|trx|client)\s*\)\s*=>\s*\{/g;

function sourceFiles() {
  const out = [];
  const step = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('__')) continue;
        step(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
      out.push(path.relative(scanRoot, full).split(path.sep).join('/'));
    }
  };
  for (const dir of SCAN_DIRS) step(path.join(scanRoot, dir));
  return out.sort();
}

/**
 * The call that issued this statement, read back from the text just before it.
 * A statement sent on a transaction handle is inside the claim transaction and
 * covered by its row lock; one sent on the pooled adapter is not.
 */
function issuedUnderRowLock(source, index) {
  const callbacks = [...source.slice(0, index).matchAll(TRANSACTION_CALLBACK)];
  const callback = callbacks.at(-1);
  if (!callback) return false;
  const handle = callback[1];
  const callPrefix = source.slice(Math.max(0, index - 100), index);
  if (!new RegExp(`\\b${handle}\\.(query|execute)(?:<[^>]*>)?\\s*\\(\\s*$`).test(callPrefix)) {
    return false;
  }
  const transactionPrefix = source.slice(callback.index ?? 0, index);
  return new RegExp(
    `select[\\s\\S]*${OPERATIONS_TABLE.replaceAll('.', '\\.')}[\\s\\S]*for\\s+update`,
    'i',
  ).test(transactionPrefix);
}

const findings = [];
let mutations = 0;
let lockedSelects = 0;

for (const file of sourceFiles()) {
  const source = fs.readFileSync(path.join(scanRoot, file), 'utf8');
  if (!source.includes(OPERATIONS_TABLE)) continue;

  for (const match of source.matchAll(/`([^`]*)`/g)) {
    const sql = match[1];
    if (!sql.includes(OPERATIONS_TABLE)) continue;
    const trimmed = sql.trim();

    if (/^select\b/i.test(trimmed)) {
      if (ROW_LOCK.test(sql)) lockedSelects += 1;
      continue;
    }
    if (!/^(update|insert|delete)\b/i.test(trimmed)) continue;
    mutations += 1;

    // An insert mints the lease it hands back, so it is the one mutation with
    // nothing to prove beyond writing a lease token.
    if (/^insert\b/i.test(trimmed)) {
      if (/\blease_token\b/.test(sql)) continue;
      findings.push(`${file}: claims a step without minting a lease: ${excerpt(sql)}`);
      continue;
    }

    if (LEASE_PREDICATE.test(sql)) continue;
    const whereAt = sql.toLowerCase().indexOf('where');
    if (whereAt >= 0 && SETTLEMENT_PREDICATE.test(sql.slice(whereAt))) continue;
    if (issuedUnderRowLock(source, match.index ?? 0)) continue;
    findings.push(`${file}: advances a step without the lease it holds: ${excerpt(sql)}`);
  }
}

function excerpt(sql) {
  return sql.replace(/\s+/g, ' ').trim().slice(0, 140);
}

if (mutations === 0) {
  console.error(
    'check-concurrent-step-lease: found no step ledger writes; the table name is stale',
  );
  process.exit(1);
}

if (lockedSelects === 0) {
  console.error(
    'check-concurrent-step-lease: the claim path no longer locks the ledger row with for update',
  );
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Work step writes that two workers could make at once:');
  for (const finding of findings) console.error(`  ${finding}`);
  console.error('Require lease_token = $n in the where clause, or claim inside the locked read.');
  process.exit(1);
}

console.log(
  `check-concurrent-step-lease: ${mutations} step ledger writes all hold a lease or the row lock`,
);
