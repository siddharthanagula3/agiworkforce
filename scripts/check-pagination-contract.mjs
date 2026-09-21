#!/usr/bin/env node

// Offset paging repeats a row and skips another the moment anything is written.
// This guard enumerates every route that takes a page parameter and fails on one
// that is neither keyset paginated nor recorded, with the fix named.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { repositoryFiles } from './check-lifecycle-semantics.mjs';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const CONTRACT_PATH = 'packages/contracts/types/src/pagination-contract.json';

export const CHECKLIST_COLLECTIONS = Object.freeze([
  'conversations',
  'projects',
  'library',
  'notifications',
  'audit',
  'tasks',
  'members',
  'usage',
  'search',
]);

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1 ');
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

/** A route the caller can ask for a page of. */
export function findPagedRoutes({ repoRoot = REPO_ROOT, files, contract }) {
  const param = new RegExp(
    `(?:searchParams|params|query)\\.get\\(\\s*['"](?:${contract.pageParams.join('|')})['"]`,
  );
  const helper = new RegExp(contract.cursorHelpers.symbols.join('|'));
  const routes = [];

  for (const relativePath of files) {
    if (!relativePath.startsWith(`${contract.routeRoot}/`)) continue;
    if (!/route\.ts$/.test(relativePath)) continue;
    if (/\.(test|spec)\./.test(relativePath)) continue;
    const raw = readSource(repoRoot, relativePath);
    if (raw === null) continue;
    const source = stripComments(raw);
    if (!param.test(source)) continue;
    routes.push({
      route: relativePath,
      keyset: helper.test(source),
      offset: /\boffset\b/i.test(source),
    });
  }

  return routes.sort((left, right) => left.route.localeCompare(right.route));
}

/** The canonical implementation has to be real before anything can cite it. */
function checkCursorHelpers({ repoRoot, contract, errors }) {
  const { module, symbols } = contract.cursorHelpers;
  const source = readSource(repoRoot, module);
  if (source === null) {
    errors.push(`${CONTRACT_PATH}: the cursor helpers live in ${module}, which does not exist.`);
    return;
  }
  for (const symbol of symbols) {
    if (!new RegExp(`export\\s+(?:function|const|interface|type)\\s+${symbol}\\b`).test(source)) {
      errors.push(`${module}: no longer exports ${symbol}, which the pagination contract names.`);
    }
  }
  const orderBy = /const orderBy = `order by \$\{([^}]*)\}([^`]*)`/.exec(source);
  if (orderBy === null || !/\$\{idColumn\}/.test(orderBy[2])) {
    errors.push(
      `${module}: the ordering no longer carries a tiebreaker, so two rows with the same sort ` +
        'value come back in whatever order the database chooses and a page can repeat or skip one.',
    );
  }
  if (!/base64url/.test(source)) {
    errors.push(
      `${module}: the cursor is no longer encoded, so a caller can read it, edit it, and page ` +
        'through rows the query never meant to expose.',
    );
  }
}

function checkCollections({ repoRoot, contract, paged, errors }) {
  const recorded = new Set([
    ...(contract.offsetPagination ?? []).map((entry) => entry.route),
    ...(contract.unpagedReads ?? []).map((entry) => entry.route),
  ]);
  for (const name of CHECKLIST_COLLECTIONS) {
    const collection = contract.collections[name];
    if (collection === undefined) {
      errors.push(`${CONTRACT_PATH}: "${name}" is a listed collection and declares no route.`);
      continue;
    }
    if (readSource(repoRoot, collection.route) === null) {
      errors.push(`${CONTRACT_PATH}: "${name}" names ${collection.route}, which does not exist.`);
      continue;
    }
    if (typeof collection.why !== 'string' || collection.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: "${name}" carries no reason for how it is paged.`);
    }
    const entry = paged.find((route) => route.route === collection.route);
    if (entry === undefined) continue;
    if (!entry.keyset && !recorded.has(entry.route)) {
      errors.push(
        `${collection.route}: "${name}" takes a page parameter and does not use the cursor helpers.`,
      );
    }
  }

  for (const name of Object.keys(contract.collections)) {
    if (!CHECKLIST_COLLECTIONS.includes(name)) {
      errors.push(
        `${CONTRACT_PATH}: "${name}" is not one of the collections the product paginates: ` +
          `${CHECKLIST_COLLECTIONS.join(', ')}.`,
      );
    }
  }
}

function checkPagedRoutes({ contract, paged, errors }) {
  const offset = new Map((contract.offsetPagination ?? []).map((entry) => [entry.route, entry]));
  const unpaged = new Map((contract.unpagedReads ?? []).map((entry) => [entry.route, entry]));
  const seenOffset = new Set();
  const seenUnpaged = new Set();

  for (const entry of paged) {
    if (entry.keyset && !entry.offset) continue;
    if (entry.offset) {
      const record = offset.get(entry.route);
      if (record === undefined) {
        errors.push(
          `${entry.route}: pages by offset. A row deleted above the window drops a row nobody ` +
            'sees and a row inserted above it repeats one. Use the cursor helpers, or record why not.',
        );
        continue;
      }
      seenOffset.add(entry.route);
      continue;
    }
    const record = unpaged.get(entry.route);
    if (record === undefined) {
      errors.push(
        `${entry.route}: takes a page parameter and pages by nothing, so a caller asking for more ` +
          'gets the same rows. Page it with the cursor helpers, or record why the answer is bounded.',
      );
      continue;
    }
    seenUnpaged.add(entry.route);
  }

  for (const [route, record] of offset) {
    if (typeof record.why !== 'string' || record.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: offset route ${route} carries no reason.`);
    }
    if (typeof record.fix !== 'string' || record.fix.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: offset route ${route} does not say what would close it.`);
    }
    if (!seenOffset.has(route)) {
      errors.push(
        `${CONTRACT_PATH}: offset route ${route} no longer pages by offset. Delete it; this list only shrinks.`,
      );
    }
  }

  for (const [route, record] of unpaged) {
    if (typeof record.why !== 'string' || record.why.trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: unpaged read ${route} carries no reason.`);
    }
    if (!seenUnpaged.has(route)) {
      errors.push(
        `${CONTRACT_PATH}: unpaged read ${route} is no longer one. Delete it; this list only shrinks.`,
      );
    }
  }
}

/** One loading-more affordance, or every surface invents its own. */
function checkLoadingMore({ repoRoot, contract, files, errors }) {
  const { module, symbol, gap } = contract.loadingMore;
  const source = readSource(repoRoot, module);
  if (source === null) {
    errors.push(
      `${CONTRACT_PATH}: the loading-more primitive lives in ${module}, which does not exist.`,
    );
    return;
  }
  if (!new RegExp(`\\b${symbol}\\b`).test(source)) {
    errors.push(`${module}: no longer defines ${symbol}.`);
  }

  const owner = path.dirname(path.dirname(module));
  const consumers = files.filter((file) => {
    if (file.startsWith(owner)) return false;
    if (/\.(test|spec)\./.test(file) || /(^|\/)__tests__\//.test(file)) return false;
    if (!/\.tsx?$/.test(file)) return false;
    const contents = readSource(repoRoot, file);
    return contents !== null && new RegExp(`<${symbol}\\b`).test(stripComments(contents));
  });

  if (consumers.length > 0) {
    if (gap !== undefined) {
      errors.push(
        `${CONTRACT_PATH}: the loading-more primitive is recorded as unused and ${consumers[0]} now ` +
          'renders it. Delete the gap.',
      );
    }
    return;
  }
  if (gap === undefined) {
    errors.push(
      `${module}: ${symbol} is exported and nothing renders it, so "loading-more state is ` +
        'standardized" is a claim about a component no surface uses.',
    );
    return;
  }
  for (const field of ['why', 'fix']) {
    if (typeof gap[field] !== 'string' || gap[field].trim().length === 0) {
      errors.push(`${CONTRACT_PATH}: the loading-more gap has no ${field}.`);
    }
  }
}

export function checkPaginationContract(repoRoot = REPO_ROOT) {
  const errors = [];
  const contract = loadContract(repoRoot);
  const files = repositoryFiles(repoRoot);
  const paged = findPagedRoutes({ repoRoot, files, contract });

  checkCursorHelpers({ repoRoot, contract, errors });
  checkCollections({ repoRoot, contract, paged, errors });
  checkPagedRoutes({ contract, paged, errors });
  checkLoadingMore({ repoRoot, contract, files, errors });

  return {
    errors,
    report: {
      paged: paged.length,
      keyset: paged.filter((entry) => entry.keyset).length,
      collections: Object.keys(contract.collections).length,
      offset: (contract.offsetPagination ?? []).length,
      unpaged: (contract.unpagedReads ?? []).length,
    },
  };
}

function main() {
  const { errors, report } = checkPaginationContract(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Pagination contract check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-pagination-contract: OK (${report.paged} paged routes, ${report.keyset} on the cursor ` +
      `helpers, ${report.collections} collections, ${report.offset} recorded offset, ` +
      `${report.unpaged} recorded unpaged)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
