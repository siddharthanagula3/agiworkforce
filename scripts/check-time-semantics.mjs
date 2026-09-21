#!/usr/bin/env node

// One clock. Rows are stored in UTC, a schedule keeps the zone the reader chose
// it in, and a consequential row is stamped by the server rather than by
// whoever called it. This guard reads all three out of the migrations.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readTableColumns } from './check-resource-metadata.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/time-contract.json';
export const MIGRATIONS_DIR = 'apps/web/db/neon';

function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function migrationSql(repoRoot) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  return readdirSync(dir)
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .sort()
    .map((name) => ({
      name,
      sql: stripSqlComments(readFileSync(path.join(dir, name), 'utf8')).toLowerCase(),
    }));
}

/** Every timestamp column, with the type and the default the migration gave it. */
export function readTimeColumns(repoRoot = REPO_ROOT) {
  const columns = [];
  for (const { name, sql } of migrationSql(repoRoot)) {
    for (const match of sql.matchAll(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s*\(([\s\S]*?)\n\s*\)\s*;/g,
    )) {
      for (const line of match[2].split('\n')) {
        const column =
          /^\s*([a-z_][a-z0-9_]*)\s+(timestamp\w*(?:\s+with(?:out)?\s+time\s+zone)?|date|time)\b(.*)$/.exec(
            line,
          );
        if (column === null) continue;
        columns.push({
          table: match[1],
          column: column[1],
          type: column[2].replace(/\s+/g, ' '),
          rest: column[3],
          migration: name,
        });
      }
    }
    for (const match of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\s*\.\s*)?([a-z_][a-z0-9_]*)\s+([\s\S]*?);/g,
    )) {
      for (const added of match[2].matchAll(
        /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_][a-z0-9_]*)\s+(timestamp\w*(?:\s+with(?:out)?\s+time\s+zone)?|date|time)\b([^,]*)/g,
      )) {
        columns.push({
          table: match[1],
          column: added[1],
          type: added[2].replace(/\s+/g, ' '),
          rest: added[3],
          migration: name,
        });
      }
    }
  }
  return columns;
}

function checkStoredInUtc({ contract, columns, errors }) {
  const naive = new RegExp(contract.naiveTypeMatch);
  const exemptions = new Map(
    (contract.naiveTimeExemptions ?? []).map((entry) => [`${entry.table}.${entry.column}`, entry]),
  );
  const seen = new Set();

  for (const entry of columns) {
    if (!naive.test(entry.type)) continue;
    const key = `${entry.table}.${entry.column}`;
    if (exemptions.has(key)) {
      seen.add(key);
      continue;
    }
    errors.push(
      `${MIGRATIONS_DIR}/${entry.migration}: ${key} is "${entry.type}", which stores a wall clock ` +
        'with no zone. Two readers in two places disagree about when it happened.',
    );
  }

  for (const [key, entry] of exemptions) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: naive time exemption ${key} carries no reason.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: naive time exemption ${key} is no longer naive. Delete it; this list only shrinks.`,
      );
    }
  }
}

/** A recurrence with no zone runs at the wrong hour twice a year. */
function checkScheduleZones({ contract, tables, errors }) {
  const recurrence = new RegExp(contract.recurrenceColumnMatch);
  const zone = new RegExp(contract.zoneColumnMatch);
  const exemptions = new Map(
    (contract.zonelessScheduleExemptions ?? []).map((entry) => [entry.table, entry]),
  );
  const seen = new Set();
  let scheduled = 0;

  for (const [table, columns] of [...tables].sort(([a], [b]) => a.localeCompare(b))) {
    if (![...columns].some((column) => recurrence.test(column))) continue;
    scheduled += 1;
    if ([...columns].some((column) => zone.test(column))) {
      if (exemptions.has(table)) {
        errors.push(
          `${CONTRACT_PATH}: ${table} is recorded as having no zone and now carries one. Delete the entry.`,
        );
      }
      continue;
    }
    if (exemptions.has(table)) {
      seen.add(table);
      continue;
    }
    errors.push(
      `${MIGRATIONS_DIR}: ${table} stores a recurrence and no zone, so the reader who asked for ` +
        '09:00 gets 08:00 for half the year.',
    );
  }

  if (scheduled === 0) {
    errors.push(
      `${CONTRACT_PATH}: no table matches ${contract.recurrenceColumnMatch}, so the schedule zone ` +
        'rule is reading nothing.',
    );
  }

  for (const [table, entry] of exemptions) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: zoneless schedule ${table} carries no reason.`);
    }
    if (!seen.has(table)) {
      errors.push(
        `${CONTRACT_PATH}: zoneless schedule ${table} no longer stores a recurrence. Delete it.`,
      );
    }
  }
}

/** The zone is only honoured if something resolves a local time inside it. */
function checkDaylightSaving({ repoRoot, contract, errors }) {
  const { module, evidence, consumers } = contract.zonedTime;
  const source = readSource(repoRoot, module);
  if (source === null) {
    errors.push(`${CONTRACT_PATH}: zoned time lives in ${module}, which does not exist.`);
    return;
  }
  for (const marker of evidence) {
    if (!source.includes(marker)) {
      errors.push(
        `${module}: no longer uses ${marker}, so a local time is resolved with a fixed offset and ` +
          'the schedule drifts by an hour when the zone changes.',
      );
    }
  }
  for (const consumer of consumers) {
    const contents = readSource(repoRoot, consumer);
    if (contents === null) {
      errors.push(
        `${CONTRACT_PATH}: ${consumer} is named as a zoned-time consumer and does not exist.`,
      );
      continue;
    }
    if (!/timeZone/.test(contents)) {
      errors.push(
        `${consumer}: is named as a zoned-time consumer and resolves a local time without naming a ` +
          'zone, so the stored zone is decoration and the run drifts by an hour twice a year.',
      );
    }
  }
}

/** Who stamped the row: the server, or whoever called it. */
function checkServerAuthoritative({ contract, columns, errors }) {
  const stamped = new RegExp(contract.serverStampedColumnMatch);
  const serverDefault = new RegExp(contract.serverDefaultMatch);
  const exemptions = new Map(
    (contract.callerStampedExemptions ?? []).map((entry) => [
      `${entry.table}.${entry.column}`,
      entry,
    ]),
  );
  const seen = new Set();
  const byKey = new Map();

  for (const entry of columns) {
    if (!stamped.test(entry.column)) continue;
    const key = `${entry.table}.${entry.column}`;
    const existing = byKey.get(key);
    if (existing === undefined || serverDefault.test(entry.rest)) byKey.set(key, entry);
  }

  for (const [key, entry] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
    if (serverDefault.test(entry.rest)) {
      if (exemptions.has(key)) {
        errors.push(
          `${CONTRACT_PATH}: ${key} is recorded as caller stamped and now defaults to the server clock. Delete the entry.`,
        );
      }
      continue;
    }
    if (exemptions.has(key)) {
      seen.add(key);
      continue;
    }
    errors.push(
      `${MIGRATIONS_DIR}/${entry.migration}: ${key} records when something happened and takes the ` +
        'time from whoever inserted the row. A client with a wrong clock, or a lying one, decides ' +
        'the order of events.',
    );
  }

  for (const [key, entry] of exemptions) {
    if (typeof entry.why !== 'string' || entry.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: caller-stamped exemption ${key} carries no reason.`);
    }
    if (!seen.has(key)) {
      errors.push(
        `${CONTRACT_PATH}: caller-stamped exemption ${key} is no longer caller stamped. Delete it; this list only shrinks.`,
      );
    }
  }
}

/** A stored instant is presented in the reader's zone, never in the server's. */
function checkPresentationZone({ repoRoot, contract, errors }) {
  const { module, evidence, forbidden } = contract.readerZone;
  const source = readSource(repoRoot, module);
  if (source === null) {
    errors.push(
      `${CONTRACT_PATH}: the reader's zone is resolved in ${module}, which does not exist.`,
    );
    return;
  }
  for (const marker of evidence) {
    if (!source.includes(marker)) {
      errors.push(
        `${module}: no longer uses ${marker}, so a stored instant is rendered in whatever zone the ` +
          "process happens to be in rather than the reader's.",
      );
    }
  }
  for (const marker of forbidden ?? []) {
    if (source.includes(marker)) {
      errors.push(
        `${module}: pins the presentation zone to ${marker}. A reader is shown the time in their ` +
          'own zone, not in the one the server runs in.',
      );
    }
  }
}

export function checkTimeSemantics(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const columns = readTimeColumns(repoRoot);
  const tables = readTableColumns(repoRoot);

  checkStoredInUtc({ contract, columns, errors });
  checkScheduleZones({ contract, tables, errors });
  checkDaylightSaving({ repoRoot, contract, errors });
  checkServerAuthoritative({ contract, columns, errors });
  checkPresentationZone({ repoRoot, contract, errors });

  return {
    errors,
    report: {
      columns: columns.length,
      tables: tables.size,
      naive: (contract.naiveTimeExemptions ?? []).length,
      callerStamped: (contract.callerStampedExemptions ?? []).length,
    },
  };
}

function main() {
  const { errors, report } = checkTimeSemantics(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Time semantics check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-time-semantics: OK (${report.columns} time columns over ${report.tables} tables, ` +
      `${report.naive} recorded naive, ${report.callerStamped} recorded caller stamped)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
