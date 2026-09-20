#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const VOCABULARY = 'packages/contracts/types/src/conversation.ts';
const COMPATIBILITY = 'packages/contracts/types/src/client-capability-manifest.ts';
const DEGRADATION_TEST =
  'packages/ui/unified-chat/src/lib/__tests__/contentBlockDegradation.test.ts';
const SCANNED_ROOTS = Object.freeze([
  'packages/contracts/types/src',
  'packages/ui/unified-chat/src',
]);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.turbo']);

// Reading a kind out of the vocabulary and acting on it, rather than restating
// the list, is what keeps a newly declared block from reaching a build blind.
const REQUIRED_COMPATIBILITY_READS = Object.freeze([
  'MESSAGE_KINDS',
  'renderableBlocks',
  'unknownBlocks',
]);

function read(root, relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

function* sourceFiles(root, relative) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) continue;
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) yield* sourceFiles(root, child);
    else if (/\.tsx?$/.test(entry.name)) yield child;
  }
}

/** The block kinds the conversation contract declares, in order. */
export function messageKinds(source) {
  const declaration = /export const MESSAGE_KINDS = \[([\s\S]*?)\] as const;/.exec(source);
  if (!declaration) throw new Error(`${VOCABULARY} declares no MESSAGE_KINDS`);
  const kinds = [...declaration[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (kinds.length === 0) throw new Error(`${VOCABULARY} declares an empty MESSAGE_KINDS`);
  return kinds;
}

function arrayLiteralsRestatingTheVocabulary(source, kinds) {
  const found = [];
  for (const literal of source.matchAll(/\[[^[\]]*\]/g)) {
    const members = new Set([...literal[0].matchAll(/'([^']+)'/g)].map((match) => match[1]));
    const overlap = kinds.filter((kind) => members.has(kind));
    if (overlap.length >= 3 && overlap.length === members.size) found.push(overlap.join(', '));
  }
  return found;
}

export function runContentBlocksGuard(root = process.cwd()) {
  const findings = [];
  const kinds = messageKinds(read(root, VOCABULARY));

  for (const kind of kinds) {
    if (!/^[a-z][a-z0-9_]*$/.test(kind)) {
      findings.push(`${VOCABULARY}: block kind '${kind}' is not a stable lowercase identifier`);
    }
  }
  if (new Set(kinds).size !== kinds.length) {
    findings.push(`${VOCABULARY}: MESSAGE_KINDS declares the same kind twice`);
  }

  const compatibility = read(root, COMPATIBILITY);
  for (const symbol of REQUIRED_COMPATIBILITY_READS) {
    if (!compatibility.includes(symbol)) {
      findings.push(
        `${COMPATIBILITY}: does not read '${symbol}', so a block kind can reach a client that never declared it`,
      );
    }
  }

  if (!existsSync(path.join(root, DEGRADATION_TEST))) {
    findings.push(`${DEGRADATION_TEST} is missing, so no kind's degradation is proven`);
  } else {
    const test = read(root, DEGRADATION_TEST);
    if (!test.includes('MESSAGE_KINDS')) {
      findings.push(
        `${DEGRADATION_TEST}: names kinds by hand instead of enumerating MESSAGE_KINDS`,
      );
    }
    for (const kind of kinds) {
      if (test.includes(`'${kind}'`)) {
        findings.push(
          `${DEGRADATION_TEST}: hard-codes the kind '${kind}', which stops it covering a kind added later`,
        );
      }
    }
  }

  let scanned = 0;
  for (const rootDir of SCANNED_ROOTS) {
    for (const relative of sourceFiles(root, rootDir)) {
      if (relative.endsWith(VOCABULARY.slice(VOCABULARY.lastIndexOf('/') + 1))) continue;
      scanned += 1;
      for (const restatement of arrayLiteralsRestatingTheVocabulary(read(root, relative), kinds)) {
        findings.push(
          `${relative}: restates the block vocabulary (${restatement}) instead of reading MESSAGE_KINDS`,
        );
      }
    }
  }

  const summary =
    findings.length === 0
      ? `content blocks: ${kinds.length} kinds declared once and degraded under test, ${scanned} files carry no second copy`
      : findings.join('\n');
  return { findings, summary };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = runContentBlocksGuard();
    const stream = result.findings.length === 0 ? process.stdout : process.stderr;
    stream.write(`${result.summary}\n`);
    if (result.findings.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Content block guard could not run: ${error.message}\n`);
    process.exitCode = 2;
  }
}
