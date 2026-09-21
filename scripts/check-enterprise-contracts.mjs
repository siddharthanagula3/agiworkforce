#!/usr/bin/env node

// One enterprise commercial domain, enumerated from its own sources. The
// lifecycle table, the commercial models, the columns the store reads and the
// routes that change a contract are each checked against what the code and the
// migrations actually say, because every one of them was a place where the
// domain and the schema drifted apart without anything failing.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const LIFECYCLE_PATH = 'packages/contracts/types/src/enterprise/contract-lifecycle.ts';
export const COMMITMENTS_PATH = 'packages/contracts/types/src/enterprise/commitments.ts';
export const CONTRACT_TEST_PATH =
  'packages/contracts/types/src/__tests__/enterprise-commercial-contract.test.ts';
export const SERVICE_DIR = 'apps/web/lib/services/enterprise-contracts';
export const ROUTE_DIR = 'apps/web/app/api/settings/organization/billing-contract';
export const AGREEMENT_TABLE = 'organization_commercial_agreements';

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const SELF_SERVE_SOURCES = ['billing-catalog', 'product-plan', 'BILLING_PLAN_PRICING'];
const FLOAT_PATTERNS = [
  ['parseFloat', /\bparseFloat\s*\(/],
  ['toFixed', /\.toFixed\s*\(/],
  ['decimal literal', /(?<![\w.])\d+\.\d+(?![\w.])/],
  ['division by 100', /\/\s*100\b/],
];

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function listFiles(repoRoot, relativeDir) {
  const absolute = path.join(repoRoot, relativeDir);
  let entries = [];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(absolute, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listFiles(repoRoot, path.join(relativeDir, entry)));
    } else if (/\.[cm]?tsx?$/.test(entry)) {
      files.push(path.join(relativeDir, entry));
    }
  }
  return files;
}

function stringArray(source, name) {
  const start = source.indexOf(`const ${name}`);
  if (start === -1) return null;
  const open = source.indexOf('[', start);
  const close = source.indexOf(']', open);
  if (open === -1 || close === -1) return null;
  return [...source.slice(open, close).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

/** The states and events the lifecycle declares, and the table it claims to cover. */
export function readLifecycleVocabulary(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, LIFECYCLE_PATH);
  if (source === null) return null;
  const states = stringArray(source, 'CONTRACT_LIFECYCLE_STATES') ?? [];
  const events = stringArray(source, 'CONTRACT_LIFECYCLE_EVENTS') ?? [];
  const table = {};
  const tableStart = source.indexOf('CONTRACT_TRANSITIONS');
  const body = tableStart === -1 ? '' : source.slice(tableStart);
  for (const state of states) {
    const entry = new RegExp(`\\n  ${state}: Object\\.freeze\\(\\{([\\s\\S]*?)\\n  \\}\\)`).exec(
      body,
    );
    if (!entry || entry[1] === undefined) continue;
    table[state] = events.filter((event) => new RegExp(`\\n    ${event}:`).test(entry[1]));
  }
  return { states, events, table };
}

export function readCommercialModels(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, COMMITMENTS_PATH);
  if (source === null) return null;
  return stringArray(source, 'COMMERCIAL_MODELS') ?? [];
}

/** Every column the agreement store reads back out of the table. */
export function readAgreementColumns(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, path.join(SERVICE_DIR, 'agreement-store.ts'));
  if (source === null) return null;
  const block = /const AGREEMENT_COLUMNS = `([\s\S]*?)`/.exec(source);
  if (!block || block[1] === undefined) return null;
  return block[1]
    .split(',')
    .map((column) => column.trim())
    .filter((column) => /^[a-z_]+$/.test(column));
}

function migrationFiles(repoRoot) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  try {
    return readdirSync(dir)
      .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
      .sort();
  } catch {
    return [];
  }
}

/** Columns the migrations create on the agreement table, and the newest status list. */
export function readAgreementSchema(repoRoot = REPO_ROOT) {
  const columns = new Set();
  let statuses = null;
  let statusSource = null;

  for (const name of migrationFiles(repoRoot)) {
    const sql = readFileSync(path.join(repoRoot, MIGRATIONS_DIR, name), 'utf8').replace(
      /--[^\n]*/g,
      ' ',
    );
    if (!sql.includes(AGREEMENT_TABLE)) continue;

    const created = new RegExp(
      `create table if not exists public\\.${AGREEMENT_TABLE} \\(([\\s\\S]*?)\\n\\);`,
    ).exec(sql);
    if (created?.[1]) {
      for (const line of created[1].split('\n')) {
        const column = /^\s{2}([a-z_]+)\s+(uuid|text|integer|bigint|boolean|date|timestamptz)/.exec(
          line,
        );
        if (column?.[1]) columns.add(column[1]);
      }
    }
    for (const match of sql.matchAll(/add column if not exists ([a-z_]+)/g)) {
      if (match[1] && sql.indexOf(AGREEMENT_TABLE) !== -1) columns.add(match[1]);
    }
    for (const match of sql.matchAll(/(?<![a-z_])status = any \(array\[([\s\S]*?)\]\)/g)) {
      statuses = [...(match[1] ?? '').matchAll(/'([a-z_]+)'/g)].map((value) => value[1]);
      statusSource = name;
    }
  }

  return { columns: [...columns].sort(), statuses, statusSource };
}

function routeExports(source) {
  return MUTATING_METHODS.filter((method) => new RegExp(`export const ${method}\\b`).test(source));
}

/** Service functions that write an audit event of their own. */
function auditedServiceFunctions(repoRoot) {
  const audited = new Set();
  for (const file of listFiles(repoRoot, SERVICE_DIR)) {
    if (file.includes('__tests__')) continue;
    const source = read(repoRoot, file) ?? '';
    const chunks = source.split(/\nexport (?:async )?function /).slice(1);
    for (const chunk of chunks) {
      const name = /^([A-Za-z0-9_]+)/.exec(chunk)?.[1];
      if (name && chunk.includes('recordAuditEvent(')) audited.add(name);
    }
  }
  return audited;
}

export function checkEnterpriseContracts(repoRoot = REPO_ROOT) {
  const problems = [];

  const lifecycle = readLifecycleVocabulary(repoRoot);
  if (lifecycle === null) {
    problems.push(`${LIFECYCLE_PATH}: the contract lifecycle is not declared anywhere.`);
  } else {
    if (lifecycle.states.length === 0 || lifecycle.events.length === 0) {
      problems.push(`${LIFECYCLE_PATH}: the lifecycle declares no states or no events.`);
    }
    for (const state of lifecycle.states) {
      const covered = lifecycle.table[state];
      if (!covered) {
        problems.push(`${LIFECYCLE_PATH}: state "${state}" has no row in the transition table.`);
        continue;
      }
      for (const event of lifecycle.events) {
        if (!covered.includes(event)) {
          problems.push(
            `${LIFECYCLE_PATH}: state "${state}" states no outcome for event "${event}".`,
          );
        }
      }
    }
  }

  const models = readCommercialModels(repoRoot);
  const commitments = read(repoRoot, COMMITMENTS_PATH) ?? '';
  const contractTest = read(repoRoot, CONTRACT_TEST_PATH) ?? '';
  if (models === null) {
    problems.push(`${COMMITMENTS_PATH}: the commercial models are not declared anywhere.`);
  } else {
    for (const model of models) {
      if (!new RegExp(`return '${model}'`).test(commitments)) {
        problems.push(
          `${COMMITMENTS_PATH}: model "${model}" is declared but no terms resolve to it.`,
        );
      }
      if (!contractTest.includes(model)) {
        problems.push(`${CONTRACT_TEST_PATH}: model "${model}" has no test.`);
      }
    }
  }

  const columns = readAgreementColumns(repoRoot);
  const schema = readAgreementSchema(repoRoot);
  if (columns === null) {
    problems.push(`${SERVICE_DIR}/agreement-store.ts: the agreement columns are not declared.`);
  } else {
    for (const column of columns) {
      if (!schema.columns.includes(column)) {
        problems.push(
          `${SERVICE_DIR}/agreement-store.ts: column "${column}" is read but no migration creates it on ${AGREEMENT_TABLE}.`,
        );
      }
    }
  }

  const typesSource = read(repoRoot, path.join(SERVICE_DIR, 'types.ts')) ?? '';
  const declaredStatuses = stringArray(typesSource, 'COMMERCIAL_AGREEMENT_STATUSES') ?? [];
  if (schema.statuses !== null) {
    for (const status of schema.statuses) {
      if (!declaredStatuses.includes(status)) {
        problems.push(
          `${SERVICE_DIR}/types.ts: ${schema.statusSource} stores status "${status}", which the domain does not name.`,
        );
      }
    }
    for (const status of declaredStatuses) {
      if (!schema.statuses.includes(status)) {
        problems.push(
          `${MIGRATIONS_DIR}/${schema.statusSource}: the domain names status "${status}", which the table refuses.`,
        );
      }
    }
  }

  const audited = auditedServiceFunctions(repoRoot);
  for (const file of listFiles(repoRoot, ROUTE_DIR)) {
    if (!file.endsWith('route.ts')) continue;
    const source = read(repoRoot, file) ?? '';
    if (!source.includes('requireMemberPermission(')) {
      problems.push(
        `${file}: reads or changes a contract without checking a workspace permission.`,
      );
    }
    for (const method of routeExports(source)) {
      if (!source.includes('requireCsrfToken(')) {
        problems.push(`${file}: ${method} changes a contract with no CSRF check.`);
      }
      const callsAudited = [...audited].some((name) => new RegExp(`\\b${name}\\(`).test(source));
      if (!callsAudited) {
        problems.push(
          `${file}: ${method} changes a contract through nothing that writes an audit event.`,
        );
      }
    }
  }

  for (const file of [...listFiles(repoRoot, SERVICE_DIR), ...listFiles(repoRoot, ROUTE_DIR)]) {
    const source = read(repoRoot, file) ?? '';
    const lines = source.split('\n');
    lines.forEach((line, index) => {
      if (/^\s*(\*|\/\/)/.test(line)) return;
      for (const [label, pattern] of FLOAT_PATTERNS) {
        if (pattern.test(line)) {
          problems.push(`${file}:${index + 1}: money arithmetic uses a ${label}.`);
        }
      }
    });
    for (const source_ of SELF_SERVE_SOURCES) {
      if (source.includes(source_)) {
        problems.push(
          `${file}: the enterprise commercial domain reaches into the self-serve catalog (${source_}).`,
        );
      }
    }
  }

  return problems;
}

function main() {
  const problems = checkEnterpriseContracts(process.cwd());
  if (problems.length > 0) {
    console.error('Enterprise commercial domain check failed:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('Enterprise commercial domain check passed.');
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith('check-enterprise-contracts.mjs')) {
  main();
}
