#!/usr/bin/env node
// Every row of a public trust ledger names an owner, the evidence that would
// fail if the row stopped being true, and the day someone last checked it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const INDEX = 'docs/compliance/trust-claims.json';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const DIGEST_SHAPE = /^[0-9a-f]{16}$/;
const LEDGER_DECLARATION = /const ([A-Z][A-Z0-9_]*): \{ label: string; value: string \}\[\] = \[/g;
const STRING_LITERAL = String.raw`('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")`;
const ROW = new RegExp(
  String.raw`label:\s*${STRING_LITERAL}\s*,\s*value:\s*${STRING_LITERAL}`,
  'g',
);
const MIN_REASON_LENGTH = 20;

function unquote(literal) {
  return literal
    .slice(1, -1)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\(.)/g, '$1');
}

export function normalise(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export function digestOf(text) {
  return crypto.createHash('sha256').update(normalise(text)).digest('hex').slice(0, 16);
}

export function asOfDate(text) {
  const dates = [...text.matchAll(/As of (\d{4}-\d{2}-\d{2})/g)];
  return dates.length > 0 ? dates[dates.length - 1][1] : null;
}

/**
 * Each `{ label: string; value: string }[]` array a page declares, read as the
 * rows it renders. A row whose value is not a plain string cannot be pinned,
 * so it is counted and reported rather than skipped.
 */
export function ledgerRows(source) {
  const rows = [];
  const unreadable = [];
  for (const declaration of source.matchAll(LEDGER_DECLARATION)) {
    const ledger = declaration[1];
    const start = declaration.index + declaration[0].length;
    const end = source.indexOf('\n];', start);
    const body = end < 0 ? source.slice(start) : source.slice(start, end);
    let parsed = 0;
    for (const match of body.matchAll(ROW)) {
      parsed += 1;
      rows.push({ ledger, label: unquote(match[1]), value: normalise(unquote(match[2])) });
    }
    const declared = [...body.matchAll(/\blabel:/g)].length;
    if (declared !== parsed) unreadable.push({ ledger, declared, parsed });
  }
  rows.unreadable = unreadable;
  return rows;
}

function exists(root, relative) {
  return fs.existsSync(path.join(root, relative));
}

function checkReference(root, reference, where, failures) {
  const [relative, symbol] = reference.split('#');
  if (!exists(root, relative)) {
    failures.push(`${where}: implementing path "${relative}" does not exist`);
    return;
  }
  if (!symbol) return;
  const target = path.join(root, relative);
  if (!fs.statSync(target).isFile() || !fs.readFileSync(target, 'utf8').includes(symbol)) {
    failures.push(`${where}: "${relative}" no longer contains "${symbol}"`);
  }
}

function checkProof(root, proof, where, failures) {
  const { kind, file, name } = proof ?? {};
  if (kind !== 'guard' && kind !== 'test') {
    failures.push(`${where}: proof kind "${kind}" is neither "guard" nor "test"`);
    return;
  }
  if (
    typeof file !== 'string' ||
    !exists(root, file) ||
    !fs.statSync(path.join(root, file)).isFile()
  ) {
    failures.push(`${where}: proof file "${file}" does not exist`);
    return;
  }
  if (kind === 'guard') {
    if (!/^scripts\/check-[a-z0-9-]+\.mjs$/.test(file)) {
      failures.push(`${where}: guard proof "${file}" is not a scripts/check-*.mjs guard`);
    } else if (!exists(root, file.replace(/\.mjs$/, '.test.mjs'))) {
      failures.push(`${where}: guard "${file}" has no self-test`);
    }
    return;
  }
  if (typeof name !== 'string' || name.trim() === '') {
    failures.push(`${where}: test proof "${file}" names no test`);
    return;
  }
  if (!fs.readFileSync(path.join(root, file), 'utf8').includes(name)) {
    failures.push(`${where}: test "${name}" no longer exists in "${file}"`);
  }
}

function daysBetween(earlier, later) {
  return (later.getTime() - earlier.getTime()) / DAY_MS;
}

function checkClaim(root, index, claim, row, today, where, failures) {
  const owners = new Set(index.owners ?? []);
  if (!owners.has(claim.owner)) {
    failures.push(`${where}: owner "${claim.owner}" is not one of ${[...owners].join(', ')}`);
  }
  if (!Array.isArray(claim.implementation) || claim.implementation.length === 0) {
    failures.push(`${where}: names no implementing path`);
  } else {
    for (const reference of claim.implementation) checkReference(root, reference, where, failures);
  }
  const proofs = Array.isArray(claim.proof) ? claim.proof : [];
  for (const proof of proofs) checkProof(root, proof, where, failures);
  if (
    proofs.length === 0 &&
    (typeof claim.reason !== 'string' || claim.reason.trim().length < MIN_REASON_LENGTH)
  ) {
    failures.push(`${where}: has no executable proof and states no reason why`);
  }
  if (
    claim.external !== undefined &&
    (typeof claim.external !== 'string' || claim.external.trim().length < MIN_REASON_LENGTH)
  ) {
    failures.push(`${where}: "external" must say what the repository cannot prove`);
  }
  const scoped = (index.jurisdictionRequired ?? []).includes(`${claim.page}#${claim.ledger}`);
  if (scoped) {
    for (const field of ['jurisdiction', 'scope']) {
      if (typeof claim[field] !== 'string' || claim[field].trim() === '') {
        failures.push(`${where}: a compliance row must name its ${field}`);
      }
    }
  }

  const published = asOfDate(row.value);
  if ((claim.asOf ?? null) !== published) {
    failures.push(
      `${where}: the page says "As of ${published ?? 'nothing'}" and the index says ${claim.asOf ?? 'nothing'}; re-check the row and record the date it was measured`,
    );
  }
  if (!DATE_SHAPE.test(claim.reviewedOn ?? '')) {
    failures.push(`${where}: reviewedOn is not a date`);
    return;
  }
  const reviewed = new Date(`${claim.reviewedOn}T00:00:00Z`);
  if (published && claim.reviewedOn < published) {
    failures.push(
      `${where}: reviewed on ${claim.reviewedOn}, before the ${published} fact it reviews`,
    );
  }
  if (daysBetween(today, reviewed) > 1) {
    failures.push(`${where}: reviewed on ${claim.reviewedOn}, which has not happened yet`);
  }
  const cadence = index.reviewCadenceDays;
  if (!Number.isInteger(cadence) || cadence < 1) {
    failures.push(`${INDEX}: reviewCadenceDays is not a positive integer`);
  } else if (daysBetween(reviewed, today) > cadence) {
    failures.push(
      `${where}: last reviewed ${claim.reviewedOn}, more than ${cadence} days ago; re-check it against its evidence before it stays published`,
    );
  }

  if (!DIGEST_SHAPE.test(claim.digest ?? '')) {
    failures.push(`${where}: digest is not 16 hex characters`);
  } else if (claim.digest !== digestOf(row.value)) {
    failures.push(
      `${where}: the published text changed without a review; check it against its evidence, then record digest ${digestOf(row.value)} and the review date`,
    );
  }
}

export function runTrustClaimsCheck(root, today = new Date()) {
  const failures = [];
  const indexPath = path.join(root, INDEX);
  if (!fs.existsSync(indexPath)) return [`${INDEX} does not exist`];
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (error) {
    return [`${INDEX} is not valid JSON: ${error.message}`];
  }
  const pages = Array.isArray(index.pages) ? index.pages : [];
  const claims = Array.isArray(index.claims) ? index.claims : [];
  if (pages.length === 0) failures.push(`${INDEX}: names no page`);

  const rowsByKey = new Map();
  for (const page of pages) {
    if (!exists(root, page)) {
      failures.push(`${INDEX}: page "${page}" does not exist`);
      continue;
    }
    const rows = ledgerRows(fs.readFileSync(path.join(root, page), 'utf8'));
    if (rows.length === 0) failures.push(`${page}: declares no ledger this check can read`);
    for (const { ledger, declared, parsed } of rows.unreadable) {
      failures.push(
        `${page} ${ledger}: ${declared} rows declared, ${parsed} readable; a row value must be a plain string to be pinned`,
      );
    }
    for (const row of rows) {
      const key = `${page}#${row.ledger}#${row.label}`;
      if (rowsByKey.has(key)) failures.push(`${page} ${row.ledger}: "${row.label}" appears twice`);
      rowsByKey.set(key, row);
    }
  }

  const indexed = new Set();
  let unproven = 0;
  for (const [position, claim] of claims.entries()) {
    const key = `${claim?.page}#${claim?.ledger}#${claim?.label}`;
    const where = `${INDEX} #${position} (${claim?.ledger ?? '?'} "${claim?.label ?? '?'}")`;
    if (indexed.has(key)) {
      failures.push(`${where}: indexed twice`);
      continue;
    }
    indexed.add(key);
    const row = rowsByKey.get(key);
    if (!row) {
      failures.push(
        `${where}: no such row is published any more; remove the entry or restore the row`,
      );
      continue;
    }
    if (!Array.isArray(claim.proof) || claim.proof.length === 0) unproven += 1;
    checkClaim(root, index, claim, row, today, where, failures);
  }

  for (const [key, row] of rowsByKey) {
    if (!indexed.has(key)) {
      failures.push(
        `${key.split('#')[0]} ${row.ledger}: "${row.label}" is published with no owner, evidence or review in ${INDEX}`,
      );
    }
  }

  if (!Number.isInteger(index.unprovenCeiling) || index.unprovenCeiling < 0) {
    failures.push(`${INDEX}: unprovenCeiling is not a non-negative integer`);
  } else if (unproven > index.unprovenCeiling) {
    failures.push(
      `${INDEX}: ${unproven} rows have no executable proof, above the ceiling of ${index.unprovenCeiling}; a row may leave that set but not join it`,
    );
  }

  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runTrustClaimsCheck(root);
  if (failures.length > 0) {
    console.error('Published trust rows are not backed by a current review:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  const index = JSON.parse(fs.readFileSync(path.join(root, INDEX), 'utf8'));
  console.log(
    `check-trust-claims: ${index.claims.length} published trust rows each carry an owner, evidence and a review inside ${index.reviewCadenceDays} days.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
