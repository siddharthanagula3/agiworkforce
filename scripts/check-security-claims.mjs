#!/usr/bin/env node
// Every falsifiable sentence in docs/security/security.md carries an executable
// proof, and the document cannot drift from the index that names it.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DOCUMENT = 'docs/security/security.md';
export const INDEX = 'docs/security/security-claims.json';
export const SCOPE_MANIFEST = 'apps/web/lib/connectors/oauth-scope-allowlist.ts';

// A product claim with no executable proof is allowed only while it names why,
// and the set may shrink but never grow.
export const UNPROVEN_CEILING = 5;

// A sentence that states how this document is maintained, what an operator has
// to do by hand, or a risk the owner accepted, rather than product behaviour.
export const NARRATIVE_KINDS = new Set([
  'maintenance-rule',
  'operator-procedure',
  'accepted-risk',
  'blocked-by-human',
  'historical-record',
  'external-fact',
]);

const ASSERTION =
  /\b(never|always|every|cannot|refuses?|fails? closed|fail-closed|enforced|no [a-z-]+ (?:is|are|may|can|exists|enters|reaches)|must (?:never|not|be|say|have|stay|reinstall)|is not|does not|are not|only|excludes)\b/i;

const ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalise(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export function extractClaimUnits(source) {
  const units = [];
  let inFence = false;
  let started = false;
  let section = '';
  let paragraph = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    for (const sentence of text.split(/(?<=\.)\s+(?=[A-Z`*_(~])/)) {
      const candidate = normalise(sentence);
      if (candidate && ASSERTION.test(candidate)) {
        units.push({ section, kind: 'prose', text: candidate });
      }
    }
    paragraph = [];
  };

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^#{2,4}\s/.test(line)) {
      flush();
      section = line.replace(/^#+\s+/, '');
      started = true;
      continue;
    }
    if (!started) continue;
    if (line === '' || line === '---') {
      flush();
      continue;
    }
    if (line.startsWith('|')) {
      flush();
      if (/^\|[\s|:-]+\|$/.test(line)) {
        const previous = units[units.length - 1];
        if (previous && previous.kind === 'row') previous.isHeader = true;
        continue;
      }
      units.push({ section, kind: 'row', text: normalise(line) });
      continue;
    }
    if (/^(?:[-*]|\d+\.)\s/.test(line)) {
      flush();
      paragraph.push(line.replace(/^(?:[-*]|\d+\.)\s+/, ''));
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return units.filter((unit) => !unit.isHeader);
}

function readCeilingIds(source) {
  const start = source.indexOf('CONNECTOR_OAUTH_SCOPE_CEILINGS');
  if (start < 0) return null;
  const end = source.indexOf('\n};', start);
  if (end < 0) return null;
  const body = source.slice(start, end);
  return new Set([...body.matchAll(/^ {2}'?([a-z0-9-]+)'?:/gm)].map((match) => match[1]));
}

function readDocumentedCeilingIds(source) {
  const start = source.indexOf('### Ceiling table');
  if (start < 0) return null;
  const rest = source.slice(start + 1);
  const next = rest.indexOf('\n### ');
  const section = next < 0 ? rest : rest.slice(0, next);
  return new Set([...section.matchAll(/^\| `([a-z0-9-]+)`\s*\|/gm)].map((match) => match[1]));
}

function fileExists(root, relative) {
  const target = path.join(root, relative);
  return fs.existsSync(target) && fs.statSync(target).isFile();
}

function checkReference(root, reference, label, failures, where) {
  const [relative, symbol] = reference.split('#');
  if (!fileExists(root, relative)) {
    failures.push(`${where}: ${label} "${relative}" does not exist`);
    return;
  }
  if (!symbol) return;
  const contents = fs.readFileSync(path.join(root, relative), 'utf8');
  if (!contents.includes(symbol)) {
    failures.push(`${where}: ${label} "${relative}" no longer contains "${symbol}"`);
  }
}

function checkProof(root, proof, failures, where) {
  if (!proof || typeof proof !== 'object') {
    failures.push(`${where}: a proof entry is not an object`);
    return;
  }
  const { kind, file, name } = proof;
  if (kind !== 'guard' && kind !== 'test') {
    failures.push(`${where}: proof kind "${kind}" is neither "guard" nor "test"`);
    return;
  }
  if (!fileExists(root, file)) {
    failures.push(`${where}: proof file "${file}" does not exist`);
    return;
  }
  if (kind === 'guard') {
    if (!/^scripts\/check-[a-z0-9-]+\.mjs$/.test(file)) {
      failures.push(`${where}: guard proof "${file}" is not a scripts/check-*.mjs guard`);
      return;
    }
    const selfTest = file.replace(/\.mjs$/, '.test.mjs');
    if (!fileExists(root, selfTest)) {
      failures.push(`${where}: guard "${file}" has no self-test at "${selfTest}"`);
    }
    return;
  }
  if (typeof name !== 'string' || name.trim() === '') {
    failures.push(`${where}: test proof "${file}" names no test`);
    return;
  }
  const contents = fs.readFileSync(path.join(root, file), 'utf8');
  if (!contents.includes(name)) {
    failures.push(`${where}: test "${name}" no longer exists in "${file}"`);
  }
}

function checkEntryShape(entry, position, seenIds, failures) {
  const where = `claim ${entry?.id ?? `#${position}`}`;
  if (!entry || typeof entry !== 'object') {
    failures.push(`claim #${position}: entry is not an object`);
    return false;
  }
  if (typeof entry.id !== 'string' || !ID_SHAPE.test(entry.id)) {
    failures.push(`${where}: id is not kebab-case`);
    return false;
  }
  if (seenIds.has(entry.id)) {
    failures.push(`${where}: id is used more than once`);
    return false;
  }
  seenIds.add(entry.id);
  if (typeof entry.section !== 'string' || entry.section.trim() === '') {
    failures.push(`${where}: no section`);
    return false;
  }
  if (entry.kind !== 'prose' && entry.kind !== 'rows') {
    failures.push(`${where}: kind "${entry.kind}" is neither "prose" nor "rows"`);
    return false;
  }
  if (entry.kind === 'prose' && (typeof entry.sentence !== 'string' || !entry.sentence.trim())) {
    failures.push(`${where}: no sentence`);
    return false;
  }
  if (entry.kind === 'rows' && (!Number.isInteger(entry.rows) || entry.rows < 1)) {
    failures.push(`${where}: rows is not a positive integer`);
    return false;
  }
  if (!Array.isArray(entry.implementation) || entry.implementation.length === 0) {
    failures.push(`${where}: names no implementing file`);
    return false;
  }
  return true;
}

export function runSecurityClaimsCheck(root) {
  const failures = [];
  const documentPath = path.join(root, DOCUMENT);
  const indexPath = path.join(root, INDEX);

  if (!fs.existsSync(documentPath)) return [`${DOCUMENT} does not exist`];
  if (!fs.existsSync(indexPath)) return [`${INDEX} does not exist`];

  const source = fs.readFileSync(documentPath, 'utf8');
  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (error) {
    return [`${INDEX} is not valid JSON: ${error.message}`];
  }

  if (index.document !== DOCUMENT) {
    failures.push(`${INDEX}: "document" is "${index.document}", expected "${DOCUMENT}"`);
  }
  const claims = Array.isArray(index.claims) ? index.claims : [];
  const unproven = Array.isArray(index.unproven) ? index.unproven : [];
  const narrative = Array.isArray(index.narrative) ? index.narrative : [];
  if (!Array.isArray(index.claims)) failures.push(`${INDEX}: "claims" is not an array`);
  if (!Array.isArray(index.unproven)) failures.push(`${INDEX}: "unproven" is not an array`);
  if (!Array.isArray(index.narrative)) failures.push(`${INDEX}: "narrative" is not an array`);

  if (unproven.length > UNPROVEN_CEILING) {
    failures.push(
      `${INDEX}: ${unproven.length} unproven claims exceeds the ceiling of ${UNPROVEN_CEILING}; a claim without a proof may only leave this list`,
    );
  }

  const units = extractClaimUnits(source);
  const proseUnits = units.filter((unit) => unit.kind === 'prose');
  const rowSections = new Map();
  for (const unit of units) {
    if (unit.kind !== 'row') continue;
    rowSections.set(unit.section, (rowSections.get(unit.section) ?? 0) + 1);
  }

  const claimedSentences = new Map();
  const claimedRowSections = new Map();
  const seenIds = new Set();

  const allEntries = [
    ...claims.map((entry) => ({ entry, list: 'claims' })),
    ...unproven.map((entry) => ({ entry, list: 'unproven' })),
    ...narrative.map((entry) => ({ entry, list: 'narrative' })),
  ];

  for (const [position, { entry, list }] of allEntries.entries()) {
    if (!checkEntryShape(entry, position, seenIds, failures)) continue;
    const where = `claim ${entry.id}`;

    if (list === 'claims') {
      if (!Array.isArray(entry.proof) || entry.proof.length === 0) {
        failures.push(`${where}: names no proof`);
      } else {
        for (const proof of entry.proof) checkProof(root, proof, failures, where);
      }
    } else {
      if (Array.isArray(entry.proof) && entry.proof.length > 0) {
        failures.push(`${where}: has a proof and belongs in "claims"`);
      }
      if (
        list === 'unproven' &&
        (typeof entry.reason !== 'string' || entry.reason.trim().length < 20)
      ) {
        failures.push(`${where}: is unproven and states no reason`);
      }
      if (list === 'narrative' && !NARRATIVE_KINDS.has(entry.why)) {
        failures.push(
          `${where}: narrative "why" is "${entry.why}", expected one of ${[...NARRATIVE_KINDS].join(', ')}`,
        );
      }
    }

    for (const reference of entry.implementation) {
      checkReference(root, reference, 'implementing file', failures, where);
    }

    if (entry.kind === 'prose') {
      const sentence = normalise(entry.sentence);
      const matches = proseUnits.filter((unit) => unit.text === sentence);
      if (matches.length === 0) {
        failures.push(
          `${where}: its sentence is no longer in ${DOCUMENT}; the document changed without the index: "${sentence.slice(0, 120)}"`,
        );
        continue;
      }
      if (matches.length > 1) {
        failures.push(
          `${where}: its sentence appears ${matches.length} times, so it cannot pin one claim`,
        );
      }
      if (matches[0].section !== entry.section) {
        failures.push(
          `${where}: indexed under section "${entry.section}" but the sentence is in "${matches[0].section}"`,
        );
      }
      const owner = claimedSentences.get(sentence);
      if (owner) failures.push(`${where}: duplicates claim ${owner}`);
      else claimedSentences.set(sentence, entry.id);
      continue;
    }

    const actual = rowSections.get(entry.section);
    if (actual === undefined) {
      failures.push(`${where}: section "${entry.section}" holds no table rows`);
      continue;
    }
    if (actual !== entry.rows) {
      failures.push(
        `${where}: section "${entry.section}" now holds ${actual} table rows, the index says ${entry.rows}`,
      );
    }
    const owner = claimedRowSections.get(entry.section);
    if (owner)
      failures.push(`${where}: section "${entry.section}" is already covered by claim ${owner}`);
    else claimedRowSections.set(entry.section, entry.id);
  }

  for (const unit of proseUnits) {
    if (!claimedSentences.has(unit.text)) {
      failures.push(
        `${DOCUMENT} <${unit.section}>: this claim has no entry in ${INDEX}: "${unit.text.slice(0, 140)}"`,
      );
    }
  }
  for (const section of rowSections.keys()) {
    if (!claimedRowSections.has(section)) {
      failures.push(`${DOCUMENT} <${section}>: this table has no entry in ${INDEX}`);
    }
  }

  const manifestPath = path.join(root, SCOPE_MANIFEST);
  if (!fs.existsSync(manifestPath)) {
    failures.push(`${SCOPE_MANIFEST} does not exist, so the ceiling table cannot be checked`);
  } else {
    const declared = readCeilingIds(fs.readFileSync(manifestPath, 'utf8'));
    const documented = readDocumentedCeilingIds(source);
    if (!declared)
      failures.push(`${SCOPE_MANIFEST}: CONNECTOR_OAUTH_SCOPE_CEILINGS could not be read`);
    else if (!documented) failures.push(`${DOCUMENT}: the ceiling table could not be read`);
    else {
      const missing = [...declared].filter((id) => !documented.has(id)).sort();
      const extra = [...documented].filter((id) => !declared.has(id)).sort();
      if (missing.length > 0) {
        failures.push(
          `${DOCUMENT}: the ceiling table omits connector(s) the manifest enforces: ${missing.join(', ')}`,
        );
      }
      if (extra.length > 0) {
        failures.push(
          `${DOCUMENT}: the ceiling table lists connector(s) the manifest does not enforce: ${extra.join(', ')}`,
        );
      }
    }
  }

  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runSecurityClaimsCheck(root);
  if (failures.length > 0) {
    console.error('Security claims are not backed by the index:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  console.log(
    'check-security-claims: every claim in docs/security/security.md is indexed and proved.',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
