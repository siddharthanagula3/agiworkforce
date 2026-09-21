#!/usr/bin/env node

// The routes that decide who somebody is. This guard enumerates them from the
// route tree rather than from a list, and fails on one that throttles nothing,
// records nothing, resolves an identity its own way, sets a session cookie a
// script can read, or stores a bearer token a backup can be read for.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readTableColumns } from './check-resource-metadata.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/auth-surface-contract.json';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

export function loadContract(repoRoot = REPO_ROOT) {
  return JSON.parse(readFileSync(path.join(repoRoot, CONTRACT_PATH), 'utf8'));
}

function readSource(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function isTestPath(relativePath) {
  return (
    /\.(test|spec)\.[cm]?tsx?$/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__|e2e)\//.test(relativePath)
  );
}

/** Every route handler under the auth roots, found by walking the tree. */
export function findAuthRoutes(repoRoot, roots) {
  const found = [];
  const walk = (relativeDir) => {
    let entries;
    try {
      entries = readdirSync(path.join(repoRoot, relativeDir));
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries.sort()) {
      const relativePath = `${relativeDir}/${entry}`;
      if (statSync(path.join(repoRoot, relativePath)).isDirectory()) {
        walk(relativePath);
        continue;
      }
      if (entry === 'route.ts') found.push(relativePath);
    }
  };
  for (const root of roots) walk(root);
  return found;
}

function repositoryFiles(repoRoot) {
  const output = execFileSync(
    'git',
    ['-C', repoRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return [...new Set(output.split('\0').filter(Boolean))].sort();
}

/** The options object of a cookie write, so a clearing write is not judged as a session. */
export function cookieWrites(source) {
  const writes = [];
  for (const match of source.matchAll(/(?:cookieStore|cookies\(\)|\.cookies)\s*\.set\s*\(/g)) {
    const start = match.index + match[0].length - 1;
    let depth = 0;
    let end = start;
    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1;
      if (source[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    writes.push(source.slice(start, end + 1));
  }
  return writes;
}

function checkRoutes({ contract, repoRoot, errors, report }) {
  const routes = findAuthRoutes(repoRoot, contract.routeRoots);
  report.routes = routes.length;

  if (routes.length === 0) {
    errors.push(`${CONTRACT_PATH}: no route handler under ${contract.routeRoots.join(', ')}.`);
    return;
  }

  const rateLimitSource = readSource(repoRoot, contract.rateLimit.declaredIn);
  for (const helper of contract.rateLimit.helpers) {
    if (
      rateLimitSource === null ||
      !new RegExp(`export (?:async )?function ${helper}\\b`).test(rateLimitSource)
    ) {
      errors.push(
        `${contract.rateLimit.declaredIn}: no longer exports ${helper}, so the contract names a limiter ` +
          'nothing provides.',
      );
    }
  }

  const decisions = readSource(repoRoot, contract.audit.decisionRegistry);
  if (decisions === null) {
    errors.push(
      `${CONTRACT_PATH}: the audit decision registry ${contract.audit.decisionRegistry} does not exist.`,
    );
  }

  const auditDefects = new Map((contract.audit.defects ?? []).map((entry) => [entry.route, entry]));
  const auditDefectsSeen = new Set();

  for (const route of routes) {
    const source = readSource(repoRoot, route);
    if (source === null) continue;

    if (!contract.rateLimit.helpers.some((helper) => new RegExp(`\\b${helper}\\b`).test(source))) {
      errors.push(
        `${route}: decides an identity and throttles nothing. ${contract.rateLimit.why}.`,
      );
    }

    const emits = contract.audit.emitters.some((emitter) =>
      new RegExp(`\\b${emitter}\\b`).test(source),
    );
    const suffix = route.replace(/^apps\/web\/app\/api\//, '');
    const decided = decisions !== null && decisions.includes(`'${suffix}'`);
    const defect = auditDefects.get(route);
    if (!emits && !decided) {
      if (defect === undefined) {
        errors.push(
          `${route}: records nothing and ${contract.audit.decisionRegistry} carries no decision for it. ` +
            `${contract.audit.why}.`,
        );
      } else {
        auditDefectsSeen.add(route);
        report.auditDefects += 1;
        for (const field of ['why', 'fix']) {
          if (typeof defect[field] !== 'string' || defect[field].trim().length === 0) {
            errors.push(`${CONTRACT_PATH}: the audit defect for ${route} carries no ${field}.`);
          }
        }
      }
    } else if (defect !== undefined) {
      errors.push(
        `${CONTRACT_PATH}: the audit defect for ${route} is stale, the route now records or is decided. ` +
          'Delete it; this list only shrinks.',
      );
      auditDefectsSeen.add(route);
    }

    for (const forbidden of contract.session.forbiddenImports) {
      if (source.includes(`from '${forbidden}'`)) {
        errors.push(
          `${route}: resolves an identity through ${forbidden} rather than ${contract.session.module}. ` +
            `${contract.session.why}.`,
        );
      }
    }
  }

  for (const route of auditDefects.keys()) {
    if (auditDefectsSeen.has(route)) continue;
    errors.push(
      `${CONTRACT_PATH}: the audit defect for ${route} names a route the auth tree no longer has.`,
    );
  }
}

function checkCookies({ contract, repoRoot, files, errors, report }) {
  for (const relativePath of files) {
    if (!contract.cookies.roots.some((root) => relativePath.startsWith(`${root}/`))) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(relativePath))) continue;
    if (isTestPath(relativePath)) continue;
    const source = readSource(repoRoot, relativePath);
    if (source === null) continue;

    for (const write of cookieWrites(source)) {
      if (/maxAge\s*:\s*0\b/.test(write)) continue;
      report.cookies += 1;
      const missing = contract.cookies.required.filter(
        (flag) =>
          !new RegExp(`\\b${flag}\\b`).test(write) && !new RegExp(`\\b${flag}\\b`).test(source),
      );
      if (missing.length === 0) continue;
      errors.push(
        `${relativePath}: writes a cookie without ${missing.join(', ')}. ${contract.cookies.why}.`,
      );
    }
  }
}

function checkTokenColumns({ contract, repoRoot, errors, report }) {
  const tables = readTableColumns(repoRoot);
  const matcher = new RegExp(contract.tokenColumns.match);
  const safe = new RegExp(contract.tokenColumns.safe);
  const recorded = new Map(
    (contract.tokenColumns.defects ?? []).map((entry) => [entry.column, entry]),
  );
  const seen = new Set();

  for (const table of contract.tokenColumns.tables) {
    const columns = tables.get(table);
    if (columns === undefined) {
      errors.push(`${CONTRACT_PATH}: names table ${table}, which no migration creates.`);
      continue;
    }
    for (const column of [...columns].sort()) {
      if (!matcher.test(column) || safe.test(column)) continue;
      report.tokenColumns += 1;
      const key = `${table}.${column}`;
      const defect = recorded.get(key);
      if (defect === undefined) {
        errors.push(
          `apps/web/db/neon: ${key} holds a bearer value in clear text. Hash it, encrypt it, or ` +
            `record it in ${CONTRACT_PATH} with the change that removes it.`,
        );
        continue;
      }
      seen.add(key);
      for (const field of ['why', 'fix']) {
        if (typeof defect[field] !== 'string' || defect[field].trim().length === 0) {
          errors.push(`${CONTRACT_PATH}: the ${key} defect carries no ${field}.`);
        }
      }
    }
  }

  for (const key of recorded.keys()) {
    if (seen.has(key)) continue;
    errors.push(
      `${CONTRACT_PATH}: the ${key} defect no longer matches a column. Delete it; this list only shrinks.`,
    );
  }
}

function checkAnalytics({ contract, repoRoot, errors, report }) {
  const source = readSource(repoRoot, contract.analytics.vocabulary);
  if (source === null) {
    errors.push(
      `${CONTRACT_PATH}: the analytics vocabulary ${contract.analytics.vocabulary} does not exist.`,
    );
    return;
  }
  const block = new RegExp(`export const ${contract.analytics.symbol} = \\[([\\s\\S]*?)\\]`).exec(
    source,
  );
  if (block === null) {
    errors.push(
      `${contract.analytics.vocabulary}: no longer declares ${contract.analytics.symbol}.`,
    );
    return;
  }
  const forbidden = new RegExp(contract.analytics.forbidden, 'i');
  for (const match of block[1].matchAll(/'([^']+)'/g)) {
    report.analyticsKeys += 1;
    if (forbidden.test(match[1])) {
      errors.push(
        `${contract.analytics.vocabulary}: ${contract.analytics.symbol} carries "${match[1]}". ` +
          `${contract.analytics.why}.`,
      );
    }
  }
}

export function checkAuthSurface(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const files = repositoryFiles(repoRoot);
  const report = { routes: 0, cookies: 0, tokenColumns: 0, analyticsKeys: 0, auditDefects: 0 };

  checkRoutes({ contract, repoRoot, errors, report });
  checkCookies({ contract, repoRoot, files, errors, report });
  checkTokenColumns({ contract, repoRoot, errors, report });
  checkAnalytics({ contract, repoRoot, errors, report });

  return { errors, report };
}

function main() {
  const { errors, report } = checkAuthSurface(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Auth surface check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-auth-surface: OK (${report.routes} auth routes, ${report.cookies} cookie writes, ` +
      `${report.tokenColumns} bearer columns, ${report.analyticsKeys} analytics properties, ` +
      `${report.auditDefects} recorded audit gap(s))`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
