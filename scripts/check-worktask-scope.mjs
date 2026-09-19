#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SCAN_DIRS = ['apps/web/lib', 'apps/web/app/api'];

// Every table that holds one account's Work task and what it did. A row here
// answers "whose run is this", so no statement may read or write one without
// saying whose.
const WORK_TABLES = [
  'cloud_agent_runs',
  'cloud_agent_steps',
  'cloud_agent_events',
  'cloud_agent_artifacts',
  'cloud_agent_execution_operations',
  'cloud_agent_approvals',
  'cloud_agent_budgets',
];

const SCOPE_COLUMNS = /\b(user_id|workspace_id|organization_id|owner_user_id)\b/;
const STATEMENT = /\b(select|insert|update|delete)\b/i;

// The reaper sweeps runs no caller is waiting on, so it has no owner to scope
// by. In exchange every statement it issues must be bounded by staleness and a
// row limit: a sweep that can select any run is a cross-account write.
const SWEEP_MODULES = new Set(['apps/web/lib/services/cloud-agent-run-reaper.ts']);
const SWEEP_BOUNDS = [/\blimit\b/i, /\bupdated_at\s*<|\bcreated_at\s*</i];

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
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx')) continue;
      if (entry.name.includes('.test.') || entry.name.endsWith('.d.ts')) continue;
      out.push(path.relative(scanRoot, full).split(path.sep).join('/'));
    }
  };
  for (const dir of SCAN_DIRS) step(path.join(scanRoot, dir));
  return out.sort();
}

function statements(source) {
  const found = [];
  for (const match of source.matchAll(/`([^`]*)`/g)) {
    const sql = match[1];
    if (!WORK_TABLES.some((table) => sql.includes(`public.${table}`))) continue;
    if (!STATEMENT.test(sql)) continue;
    found.push(sql);
  }
  return found;
}

/**
 * An insert has to name the owner among its columns; every other statement has
 * to constrain by it after `where`. A scope column in a returning list or a
 * select list is not a boundary, so only those two places count.
 */
function isScoped(sql) {
  const lower = sql.toLowerCase();
  const insertAt = lower.search(/insert\s+into\s+public\./);
  if (insertAt >= 0) {
    const valuesAt = lower.indexOf('values', insertAt);
    const columns = valuesAt > 0 ? sql.slice(insertAt, valuesAt) : sql.slice(insertAt);
    if (SCOPE_COLUMNS.test(columns)) return true;
  }
  const returningAt = lower.lastIndexOf('returning');
  const predicate = returningAt >= 0 ? sql.slice(0, returningAt) : sql;
  const whereAt = predicate.toLowerCase().indexOf('where');
  return whereAt >= 0 && SCOPE_COLUMNS.test(predicate.slice(whereAt));
}

const findings = [];
let scanned = 0;

for (const file of sourceFiles()) {
  const source = fs.readFileSync(path.join(scanRoot, file), 'utf8');
  for (const sql of statements(source)) {
    scanned += 1;
    if (isScoped(sql)) continue;
    const excerpt = sql.replace(/\s+/g, ' ').trim().slice(0, 140);
    if (SWEEP_MODULES.has(file)) {
      if (SWEEP_BOUNDS.every((bound) => bound.test(sql))) continue;
      findings.push(`${file}: unbounded sweep, needs a staleness bound and a limit: ${excerpt}`);
      continue;
    }
    findings.push(`${file}: ${excerpt}`);
  }
}

if (scanned === 0) {
  console.error('check-worktask-scope: found no Work task statements; the table list is stale');
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Work task statements that do not say whose run they touch:');
  for (const finding of findings) console.error(`  ${finding}`);
  console.error('Add user_id, workspace_id or organization_id to the where clause or the insert.');
  process.exit(1);
}

console.log(`check-worktask-scope: ${scanned} Work task statements all scope to an owner`);
