#!/usr/bin/env node
/**
 * Work picked up with nobody present asks whether its owner may still act.
 *
 * The subjects are enumerated from the tree, not from a list of workers: every
 * SQL statement in apps/web that reads a table the schema gives both an owner
 * column and an organization column, that names no caller, and that is deciding
 * whether to pick the row up (a lease claim, a readiness column, or a statement
 * inside a cron route). A statement like that runs on somebody's behalf when
 * nobody asked for it, so two questions have to be answered inside the
 * statement: is the owner's ACCOUNT still allowed to run unattended, and are
 * they still a member of the workspace the row names. A candidate list computed
 * beforehand cannot answer either, which is why both are predicates.
 *
 * Statements this repository may not change yet are recorded in
 * scripts/config/membership-unattended-work-baseline.json with the SQL that
 * would fix each and the file that owns it. The guard refuses any addition.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { stripComments } from './lib/module-graph.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const BASELINE_PATH = 'scripts/config/membership-unattended-work-baseline.json';

const SCAN_DIRS = ['apps/web/lib', 'apps/web/app'];

const OWNER_COLUMNS = ['user_id', 'owner_id', 'owner_user_id', 'account_id', 'created_by'];

/** A caller supplied the subject, so somebody is present and this is a request. */
const NAMES_ITS_CALLER = new RegExp(
  `\\b(?:[a-z_]+\\.)?(?:${OWNER_COLUMNS.join('|')})\\s*=\\s*\\$\\d`,
  'i',
);

/**
 * The statement is taking work to run: a lease, a queue position or the column
 * that says an automation is armed. A sweep that destroys or reports on rows
 * runs for the workspace rather than for the person, and is not a subject.
 */
const PICKS_WORK_UP =
  /\bskip\s+locked\b|\bis_enabled\b|\bnext_execution_at\b|\bscheduled_for\b|\bstatus\s*=\s*'(?:queued|ready)'/i;

/** Already claimed by a worker, so this statement is ending work, not starting it. */
const ALREADY_RUNNING = /\bstatus\s*=\s*'running'/i;

/**
 * One row somebody named, so this is an act on a chosen row rather than a sweep
 * for work. A statement that orders and limits is still sweeping, even when it
 * also accepts an id.
 */
const NAMES_ONE_ROW = /\b(?:[a-z_]+\.)?id\s*=\s*\$\d/i;
const SWEEPS_MANY = /\border\s+by\b/i;

const CONSULTS_MEMBERSHIP = /\borganization_members\b|\bownerIsActiveWorkspaceMemberSql\b/;
const CONSULTS_ACCOUNT = /\bownerMayRunUnattendedSql\b|\berasure_tombstones\b|\baccount_status\b/;

function read(repoRoot, relativePath) {
  try {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

/** Tables the schema gives both an owner and an organization, after drops. */
export function workspaceOwnedTables(repoRoot = REPO_ROOT) {
  const owned = new Set();
  const dropped = new Set();
  const directory = path.join(repoRoot, MIGRATIONS_DIR);
  let names;
  try {
    names = fs.readdirSync(directory).filter((name) => name.endsWith('.sql'));
  } catch {
    return owned;
  }
  const hasOwner = new RegExp(`\\b(?:${OWNER_COLUMNS.join('|')})\\b`, 'i');
  const organizationColumns = new Map();

  for (const name of names.sort()) {
    const sql = stripComments(fs.readFileSync(path.join(directory, name), 'utf8'));
    const created = /create table (?:if not exists )?public\.([a-z_]+)\s*\(([\s\S]*?)\n\);/gi;
    let match;
    while ((match = created.exec(sql))) {
      const table = match[1].toLowerCase();
      const body = match[2] ?? '';
      if (hasOwner.test(body)) owned.add(table);
      if (/\borganization_id\b/i.test(body)) organizationColumns.set(table, true);
    }
    const addedOrganization =
      /alter table (?:only )?public\.([a-z_]+)[\s\S]{0,400}?add column (?:if not exists )?organization_id/gi;
    while ((match = addedOrganization.exec(sql)))
      organizationColumns.set(match[1].toLowerCase(), true);
    const addedOwner = new RegExp(
      `alter table (?:only )?public\\.([a-z_]+)[\\s\\S]{0,400}?add column (?:if not exists )?(?:${OWNER_COLUMNS.join('|')})\\b`,
      'gi',
    );
    while ((match = addedOwner.exec(sql))) owned.add(match[1].toLowerCase());
    const dropTable = /drop table (?:if exists )?(?:public\.)?([a-z_]+)/gi;
    while ((match = dropTable.exec(sql))) dropped.add(match[1].toLowerCase());
  }

  for (const table of [...owned]) {
    if (!organizationColumns.has(table) || dropped.has(table)) owned.delete(table);
  }
  return owned;
}

function sourceFiles(repoRoot, roots) {
  const found = [];
  const walk = (relativePath) => {
    const absolute = path.join(repoRoot, relativePath);
    let stats;
    try {
      stats = fs.statSync(absolute);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    if (!stats.isDirectory()) {
      if (/\.tsx?$/.test(relativePath) && !/\.(test|spec)\./.test(relativePath)) {
        found.push(relativePath);
      }
      return;
    }
    if (/(^|\/)(node_modules|__tests__|__mocks__|e2e|\.next)$/.test(relativePath)) return;
    for (const entry of fs.readdirSync(absolute).sort()) walk(path.posix.join(relativePath, entry));
  };
  for (const root of roots) walk(root);
  return found;
}

function statementsIn(source) {
  const statements = [];
  const template = /`([^`]*?(?:from|into|update|join)\s+(?:public\.)?[a-z_]+[\s\S]*?)`/gi;
  let match;
  while ((match = template.exec(source))) {
    if (/^\s*(?:with|select|update)\b/i.test(match[1])) statements.push(match[1]);
  }
  return statements;
}

function lineOf(source, statement) {
  const at = source.indexOf(statement);
  return at < 0 ? 0 : source.slice(0, at).split('\n').length;
}

/**
 * A statement built from a module-level constant is read with that constant in
 * place, one level deep. A parameter is not resolved: a gate handed in from
 * somewhere else is not this statement saying it asks.
 */
export function withModuleConstants(statement, source) {
  return statement.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (whole, name) => {
    const declaration = new RegExp(`\\bconst\\s+${name}\\s*=\\s*([\\s\\S]{0,400}?);\\n`).exec(
      source,
    );
    return declaration ? declaration[1] : whole;
  });
}

export function readBaseline(repoRoot = REPO_ROOT) {
  const raw = read(repoRoot, BASELINE_PATH);
  if (raw === null) return { ungated: [] };
  return JSON.parse(raw);
}

export function checkMembershipUnattendedWork(repoRoot = REPO_ROOT, options = {}) {
  const baseline = options.baseline ?? readBaseline(repoRoot);
  const failures = [];
  const report = { tables: 0, pickups: 0, gated: 0, recorded: 0 };

  const tables = workspaceOwnedTables(repoRoot);
  report.tables = tables.size;
  if (tables.size === 0) {
    failures.push(
      `${MIGRATIONS_DIR}: no workspace-owned table found, so nothing can be enumerated.`,
    );
    return { failures, report };
  }
  const tablePattern = new RegExp(`\\b(?:public\\.)?(${[...tables].join('|')})\\b`);

  const recorded = new Map(
    (baseline.ungated ?? []).map((entry) => [`${entry.file}#${entry.table}`, entry]),
  );
  const seen = new Set();

  for (const relativePath of sourceFiles(repoRoot, options.roots ?? SCAN_DIRS)) {
    const source = stripComments(read(repoRoot, relativePath) ?? '');
    if (!tablePattern.test(source)) continue;
    for (const raw of statementsIn(source)) {
      const statement = withModuleConstants(raw, source);
      const named = tablePattern.exec(statement);
      if (!named) continue;
      if (NAMES_ITS_CALLER.test(statement)) continue;
      if (!PICKS_WORK_UP.test(statement)) continue;
      if (ALREADY_RUNNING.test(statement)) continue;
      if (NAMES_ONE_ROW.test(statement) && !SWEEPS_MANY.test(statement)) continue;
      report.pickups += 1;

      const membership = CONSULTS_MEMBERSHIP.test(statement);
      const account = CONSULTS_ACCOUNT.test(statement);
      if (membership && account) {
        report.gated += 1;
        continue;
      }

      const key = `${relativePath}#${named[1]}`;
      const entry = recorded.get(key);
      if (entry) {
        seen.add(key);
        report.recorded += 1;
        continue;
      }
      const missing = [
        membership ? null : 'the membership predicate',
        account ? null : 'the account gate',
      ]
        .filter(Boolean)
        .join(' and ');
      failures.push(
        `${relativePath}:${lineOf(source, raw)} picks up work over public.${named[1]} with ` +
          `nobody present and carries neither caller nor ${missing}. Render it inside the ` +
          'statement, or record it in ' +
          `${BASELINE_PATH} with the SQL that would fix it and the file that owns it.`,
      );
    }
  }

  for (const [key, entry] of recorded) {
    if (seen.has(key)) continue;
    failures.push(`${BASELINE_PATH}: ${key} matches no statement any more; delete the entry.`);
  }
  for (const entry of baseline.ungated ?? []) {
    if (!entry.sql || !entry.owner || (entry.reason ?? '').length < 40) {
      failures.push(
        `${BASELINE_PATH}: ${entry.file}#${entry.table} needs the exact SQL, the owning file and a reason stated in full.`,
      );
    }
  }

  return { failures, report };
}

function main() {
  const { failures, report } = checkMembershipUnattendedWork();
  if (failures.length > 0) {
    console.error('check:membership-unattended-work failed.\n');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error('');
    process.exit(1);
  }
  console.log(
    `check:membership-unattended-work: OK (${report.pickups} statement(s) picking work up over ` +
      `${report.tables} workspace-owned table(s), ${report.gated} asking both questions, ` +
      `${report.recorded} recorded)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) main();
