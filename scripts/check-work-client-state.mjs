#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SCAN_DIRS = ['apps/web/features', 'apps/web/shared', 'apps/web/app', 'packages/ui'];

// What a Work task is doing. The server owns it: a browser that keeps it is a
// second answer nobody reconciles, and it survives a sign-out the run does not.
const WORK_STATE_FIELDS = [
  'pendingApprovals',
  'toolExecutions',
  'activeToolStreams',
  'runState',
  'runStatus',
  'taskState',
  'taskStatus',
  'stepStatus',
  'cloudAgentRun',
  'workRun',
  'workTask',
];

// A storage key naming one run keeps that run's state per browser.
const RUN_KEYED = /\b(run|task)_?[iI]d\b/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('__')) continue;
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) continue;
    out.push(path.relative(scanRoot, full).split(path.sep).join('/'));
  }
  return out;
}

function balancedFrom(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return source.slice(openIndex);
}

function partializeBlocks(source) {
  const blocks = [];
  for (const match of source.matchAll(/partialize\s*:/g)) {
    const open = source.indexOf('{', match.index ?? 0);
    if (open < 0) continue;
    blocks.push(balancedFrom(source, open));
  }
  return blocks;
}

function setItemKeys(source) {
  const keys = [];
  for (const match of source.matchAll(/\.setItem\s*\(/g)) {
    const start = (match.index ?? 0) + match[0].length;
    const end = source.indexOf(',', start);
    keys.push(source.slice(start, end < 0 ? start + 120 : end));
  }
  return keys;
}

const findings = [];
let stores = 0;

for (const file of SCAN_DIRS.flatMap((dir) => walk(path.join(scanRoot, dir))).sort()) {
  const source = fs.readFileSync(path.join(scanRoot, file), 'utf8');
  const persists = /from\s+'zustand\/middleware'/.test(source) && /\bpersist\s*\(/.test(source);

  if (persists) {
    stores += 1;
    const blocks = partializeBlocks(source);
    const held = WORK_STATE_FIELDS.filter((field) => new RegExp(`\\b${field}\\b`).test(source));
    if (blocks.length === 0 && held.length > 0) {
      findings.push(
        `${file}: holds ${held.join(', ')} and persists the whole store, with no partialize to leave it out`,
      );
    }
    for (const block of blocks) {
      for (const field of held) {
        if (!new RegExp(`\\b${field}\\b`).test(block)) continue;
        findings.push(`${file}: persists ${field}, which only the server can answer for`);
      }
    }
  }

  for (const key of setItemKeys(source)) {
    if (!RUN_KEYED.test(key)) continue;
    findings.push(`${file}: stores a Work run under a per-run browser key: ${key.trim()}`);
  }
}

if (stores === 0) {
  console.error('check-work-client-state: found no persisted stores; the scan roots are stale');
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Work task state that would live only in a browser:');
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(
    'Keep run state in memory and re-read it from the server; persist preferences only.',
  );
  process.exit(1);
}

console.log(
  `check-work-client-state: ${stores} persisted stores keep preferences only, not Work task state`,
);
