#!/usr/bin/env node
// Every falsifiable sentence a help-centre article states about the product
// carries an executable proof, and an article cannot change without the index
// that names those proofs changing with it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CONTENT_DIR = 'apps/web/content/support';
export const INDEX = 'apps/web/content/support/support-claims.json';
export const METADATA = 'apps/web/lib/support/doc-metadata.ts';

// An article whose sentences are not yet indexed is pinned by its hash: the
// first edit to it fails this guard until its claims are indexed. The set may
// shrink and never grow.
export const UNINDEXED_CEILING = 26;

// A claim with no executable proof is allowed only while it names why.
export const UNPROVEN_CEILING = 6;

// A sentence that describes navigation, an external party, or something the
// reader does, rather than behaviour this repository decides.
export const NARRATIVE_KINDS = new Set([
  'reader-instruction',
  'external-fact',
  'roadmap-statement',
  'editorial-rule',
]);

// What makes a support sentence falsifiable: a universal, a negation, a
// modality, or a statement about availability, retention, limits or billing.
const ASSERTION = new RegExp(
  [
    String.raw`\b(?:never|always|every|all of|nothing|nobody|none of|only|cannot|can't)\b`,
    String.raw`\b(?:does not|do not|is not|are not|will not|has not|have not|no longer)\b`,
    String.raw`\bthere (?:is|are) no\b`,
    String.raw`\bno [a-z][a-z-]* (?:is|are|can|may|will|has|have|appears|reaches|leaves|enters)\b`,
    String.raw`\b(?:must|refuses?|refused|requires?|enforced|clears?|revokes?|suspends?|stops?|overrides?)\b`,
    String.raw`\btakes precedence\b|\bmost restrictive\b|\bwins\b|\bfails? closed\b`,
    String.raw`\bdefaults?\b|\b(?:ends?|ended|expires?|times? out)\b`,
    String.raw`\b\d+ (?:days?|hours?|minutes?)\b`,
    String.raw`\b(?:is|are) free\b|\bbilled by\b|\bno markup\b|\bmetered\b|\bprepaid\b`,
    String.raw`\bnot published\b|\bnot available\b|\bcoming soon\b|\bon the roadmap\b|\bnot offered\b`,
    String.raw`\bdepends on your plan\b|\bper[- ]plan\b|\bpart of the higher paid tiers\b`,
    String.raw`\b(?:stored|encrypted|retained|erased|purged|removed|restorable|uploaded|synced)\b`,
    String.raw`\b(?:is|are) held\b|\bkeeps? (?:that |held )?material\b|\bup to \d+ days?\b`,
    String.raw`\bstays? (?:on|out of|in)\b|\bleaves? your device\b|\bnever leaves?\b`,
    String.raw`\bwaits? for\b|\basks? (?:first|before|every)\b|\bwaitlist\b|\binvite code\b`,
  ].join('|'),
  'i',
);

const ID_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalise(text) {
  return text.replace(/\s+/g, ' ').trim();
}

export function stripFrontmatter(source) {
  const normalized = source.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return normalized;
  const end = normalized.indexOf('\n---\n', 3);
  return end === -1 ? normalized : normalized.slice(end + 5);
}

export function articleDigest(source) {
  return crypto.createHash('sha256').update(stripFrontmatter(source).trim()).digest('hex');
}

/**
 * Help articles quote product copy, and that copy ends in a full stop inside
 * the quotation marks, so a naive split cuts a sentence in half. A fragment
 * left holding an unclosed quotation mark is rejoined with the next one.
 */
export function splitSentences(text) {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z`*_("'“~\d])/);
  const sentences = [];
  let pending = '';
  for (const part of parts) {
    pending = pending ? `${pending} ${part}` : part;
    const quotes = (pending.match(/"/g) ?? []).length;
    if (quotes % 2 === 0) {
      sentences.push(pending);
      pending = '';
    }
  }
  if (pending) sentences.push(pending);
  return sentences;
}

/**
 * Sentence units an article asserts. A bullet is its own unit, a table row is
 * a row unit counted per section, and fenced code is not prose at all.
 */
export function extractClaimUnits(source) {
  const units = [];
  let inFence = false;
  let section = '';
  let paragraph = [];

  const flush = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ');
    for (const sentence of splitSentences(text)) {
      const candidate = normalise(sentence);
      if (candidate && ASSERTION.test(candidate)) {
        units.push({ section, kind: 'prose', text: candidate });
      }
    }
    paragraph = [];
  };

  for (const raw of stripFrontmatter(source).split('\n')) {
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
      continue;
    }
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

export function readArticles(root) {
  const dir = path.join(root, CONTENT_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => ({
      docId: name.replace(/\.md$/, ''),
      file: `${CONTENT_DIR}/${name}`,
      source: fs.readFileSync(path.join(dir, name), 'utf8'),
    }));
}

/** The document ids `SUPPORT_DOC_METADATA` registers, in source order. */
export function readRegisteredDocIds(source) {
  const start = source.indexOf('SUPPORT_DOC_METADATA');
  if (start < 0) return null;
  const open = source.indexOf('({', start);
  if (open < 0) return null;
  const end = source.indexOf('\n});', open);
  if (end < 0) return null;
  const body = source.slice(open, end);
  return [...body.matchAll(/^ {2}'?([a-z0-9][a-z0-9-]*)'?:\s*metadata\(/gm)].map((m) => m[1]);
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
  const { kind, file, name, text } = proof;
  if (kind !== 'guard' && kind !== 'test' && kind !== 'copy') {
    failures.push(`${where}: proof kind "${kind}" is not one of guard, test, copy`);
    return;
  }
  if (!fileExists(root, file)) {
    failures.push(`${where}: proof file "${file}" does not exist`);
    return;
  }
  if (kind === 'guard') {
    if (!/^(?:scripts|apps\/web\/scripts)\/[a-z0-9-]+\.mjs$/.test(file)) {
      failures.push(`${where}: guard proof "${file}" is not a scripts/*.mjs guard`);
      return;
    }
    const selfTest = file.replace(/\.mjs$/, '.test.mjs');
    if (!fileExists(root, selfTest)) {
      failures.push(`${where}: guard "${file}" has no self-test at "${selfTest}"`);
    }
    return;
  }
  const needle = kind === 'test' ? name : text;
  if (typeof needle !== 'string' || needle.trim() === '') {
    failures.push(`${where}: ${kind} proof "${file}" names nothing to look for`);
    return;
  }
  const contents = fs.readFileSync(path.join(root, file), 'utf8');
  if (!contents.includes(needle)) {
    failures.push(
      `${where}: ${kind === 'test' ? 'test' : 'product copy'} "${needle.slice(0, 80)}" is no longer in "${file}"`,
    );
  }
}

function checkEntryShape(entry, position, seenIds, docIds, failures) {
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
  if (typeof entry.doc !== 'string' || !docIds.has(entry.doc)) {
    failures.push(`${where}: "doc" is "${entry.doc}", which is not an article`);
    return false;
  }
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
  return true;
}

export function runSupportClaimsCheck(root) {
  const failures = [];
  const indexPath = path.join(root, INDEX);
  const metadataPath = path.join(root, METADATA);

  const articles = readArticles(root);
  if (articles.length === 0) return [`${CONTENT_DIR} holds no articles`];
  if (!fs.existsSync(indexPath)) return [`${INDEX} does not exist`];

  let index;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (error) {
    return [`${INDEX} is not valid JSON: ${error.message}`];
  }

  const docIds = new Set(articles.map((article) => article.docId));

  if (!fs.existsSync(metadataPath)) {
    failures.push(`${METADATA} does not exist, so registration cannot be checked`);
  } else {
    const registered = readRegisteredDocIds(fs.readFileSync(metadataPath, 'utf8'));
    if (!registered) {
      failures.push(`${METADATA}: SUPPORT_DOC_METADATA could not be read`);
    } else {
      const counts = new Map();
      for (const docId of registered) counts.set(docId, (counts.get(docId) ?? 0) + 1);
      for (const [docId, count] of counts) {
        if (count > 1) failures.push(`${METADATA}: "${docId}" is registered ${count} times`);
        if (!docIds.has(docId)) {
          failures.push(`${METADATA}: "${docId}" is registered but ${CONTENT_DIR} has no article`);
        }
      }
      for (const docId of docIds) {
        if (!counts.has(docId)) {
          failures.push(`${CONTENT_DIR}/${docId}.md: no entry in SUPPORT_DOC_METADATA`);
        }
      }
    }
  }

  const declared = Array.isArray(index.articles) ? index.articles : [];
  if (!Array.isArray(index.articles)) failures.push(`${INDEX}: "articles" is not an array`);
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

  const declaredById = new Map();
  for (const entry of declared) {
    if (!entry || typeof entry.doc !== 'string') {
      failures.push(`${INDEX}: an "articles" entry names no doc`);
      continue;
    }
    if (declaredById.has(entry.doc)) {
      failures.push(`${INDEX}: "${entry.doc}" is listed twice in "articles"`);
      continue;
    }
    declaredById.set(entry.doc, entry);
    if (!docIds.has(entry.doc)) {
      failures.push(`${INDEX}: "${entry.doc}" is listed but ${CONTENT_DIR} has no such article`);
    }
  }
  for (const docId of docIds) {
    if (!declaredById.has(docId)) {
      failures.push(`${INDEX}: ${docId} is an article but has no "articles" entry`);
    }
  }

  const indexedDocs = new Set();
  let unindexed = 0;
  for (const article of articles) {
    const entry = declaredById.get(article.docId);
    if (!entry) continue;
    if (entry.indexed === true) {
      indexedDocs.add(article.docId);
      continue;
    }
    unindexed += 1;
    const digest = articleDigest(article.source);
    if (entry.sha256 !== digest) {
      failures.push(
        `${article.file} changed, so every factual sentence in it must be indexed in ${INDEX} (set "indexed": true and add its claims); the pinned digest no longer matches`,
      );
    }
  }
  if (unindexed > UNINDEXED_CEILING) {
    failures.push(
      `${INDEX}: ${unindexed} articles are pinned rather than indexed, above the ceiling of ${UNINDEXED_CEILING}; an article may only leave that list`,
    );
  }

  const unitsByDoc = new Map();
  for (const article of articles) {
    unitsByDoc.set(article.docId, extractClaimUnits(article.source));
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
    if (!checkEntryShape(entry, position, seenIds, docIds, failures)) continue;
    const where = `claim ${entry.id}`;

    if (list === 'claims') {
      if (!Array.isArray(entry.proof) || entry.proof.length === 0) {
        failures.push(`${where}: names no proof`);
      } else {
        for (const proof of entry.proof) checkProof(root, proof, failures, where);
      }
      if (!Array.isArray(entry.implementation) || entry.implementation.length === 0) {
        failures.push(`${where}: names no implementing file`);
      } else {
        for (const reference of entry.implementation) {
          checkReference(root, reference, 'implementing file', failures, where);
        }
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

    const units = unitsByDoc.get(entry.doc) ?? [];

    if (entry.kind === 'prose') {
      const sentence = normalise(entry.sentence);
      const matches = units.filter((unit) => unit.kind === 'prose' && unit.text === sentence);
      if (matches.length === 0) {
        failures.push(
          `${where}: its sentence is no longer in ${CONTENT_DIR}/${entry.doc}.md; the article changed without the index: "${sentence.slice(0, 120)}"`,
        );
        continue;
      }
      if (matches.length > 1) {
        failures.push(
          `${where}: its sentence appears ${matches.length} times in ${entry.doc}, so it cannot pin one claim`,
        );
      }
      if (matches[0].section !== entry.section) {
        failures.push(
          `${where}: indexed under section "${entry.section}" but the sentence is in "${matches[0].section}"`,
        );
      }
      const key = `${entry.doc}::${sentence}`;
      const owner = claimedSentences.get(key);
      if (owner) failures.push(`${where}: duplicates claim ${owner}`);
      else claimedSentences.set(key, entry.id);
      continue;
    }

    const actual = units.filter(
      (unit) => unit.kind === 'row' && unit.section === entry.section,
    ).length;
    if (actual === 0) {
      failures.push(`${where}: section "${entry.section}" of ${entry.doc} holds no table rows`);
      continue;
    }
    if (actual !== entry.rows) {
      failures.push(
        `${where}: section "${entry.section}" of ${entry.doc} now holds ${actual} table rows, the index says ${entry.rows}`,
      );
    }
    const key = `${entry.doc}::${entry.section}`;
    const owner = claimedRowSections.get(key);
    if (owner) failures.push(`${where}: that table is already covered by claim ${owner}`);
    else claimedRowSections.set(key, entry.id);
  }

  for (const docId of indexedDocs) {
    for (const unit of unitsByDoc.get(docId) ?? []) {
      if (unit.kind === 'prose') {
        if (!claimedSentences.has(`${docId}::${unit.text}`)) {
          failures.push(
            `${CONTENT_DIR}/${docId}.md <${unit.section}>: this claim has no entry in ${INDEX}: "${unit.text.slice(0, 140)}"`,
          );
        }
        continue;
      }
      if (!claimedRowSections.has(`${docId}::${unit.section}`)) {
        failures.push(
          `${CONTENT_DIR}/${docId}.md <${unit.section}>: this table has no entry in ${INDEX}`,
        );
      }
    }
  }

  return failures;
}

function main() {
  const flag = process.argv.indexOf('--root');
  const root = flag >= 0 ? path.resolve(process.argv[flag + 1]) : repoRoot;
  const failures = runSupportClaimsCheck(root);
  if (failures.length > 0) {
    console.error('Help-centre claims are not backed by the index:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} problem(s).`);
    process.exit(1);
  }
  console.log(`check-support-claims: every indexed claim in ${CONTENT_DIR} is proved.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
