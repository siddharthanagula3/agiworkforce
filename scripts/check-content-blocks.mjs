#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const VOCABULARY = 'packages/contracts/types/src/conversation.ts';
const AGENT_EVENT_UNION = 'packages/contracts/types/src/generated/protocol/AgentEvent.ts';
const KIND_MAPPING = 'packages/contracts/types/src/message-block-kinds.ts';
const KIND_MAPPING_READ =
  /\b(?:messageKindForAgentEvent|AGENT_EVENT_MESSAGE_KINDS|messageKindForDeveloperSessionEvent)\b/;
const CLIENT_ROOTS = Object.freeze([
  'apps/web/app',
  'apps/web/features',
  'apps/web/shared',
  'apps/web/components',
  'apps/web/lib',
  'apps/mobile',
  'apps/extension/src',
  'apps/extension-vscode/src',
  'apps/desktop/src',
  'apps/desktop/electron',
  'packages/ui',
]);
const SERVER_PREFIXES = Object.freeze([
  'apps/web/app/api/',
  'apps/web/lib/services/',
  'apps/web/lib/e2b/',
  'apps/web/lib/workflows/',
  'apps/web/lib/server/',
]);
const MIN_EVENT_TYPES_DECIDED = 3;
const COMPATIBILITY = 'packages/contracts/types/src/client-capability-manifest.ts';
const DEGRADATION_TEST =
  'packages/ui/unified-chat/src/lib/__tests__/contentBlockDegradation.test.ts';
const SCANNED_ROOTS = Object.freeze([
  'packages',
  'apps/web/app',
  'apps/web/features',
  'apps/web/shared',
  'apps/web/components',
  'apps/web/lib',
  'apps/mobile',
  'apps/extension/src',
  'apps/extension-vscode/src',
  'apps/desktop/src',
  'apps/desktop/electron',
]);
const SKIPPED_DIRS = new Set([
  'node_modules',
  'dist',
  '.turbo',
  '.next',
  'build',
  'coverage',
  '__tests__',
  '__mocks__',
  '__fixtures__',
]);
const TEST_FILE = /\.(?:test|spec)\.tsx?$/;

export const BLOCK_KIND_READERS_PENDING = Object.freeze({});

export const NOT_BLOCK_KIND_READERS = Object.freeze({
  'apps/desktop/electron/runtime/localInferenceService.ts':
    'Reads provider-adapter stream chunks (text-delta, thinking-delta, error, stop), a separate vocabulary from agent events.',
  'apps/desktop/src/runtime/CloudRuntime.ts':
    "Matches only text-delta and stop on agent events; the third match is a stop event's reason.reason === 'error'.",
  'apps/extension/src/features/side-panel/chat-state.ts':
    'An exhaustive switch deciding which events are safe to persist, not which block to render.',
});

export const SEPARATE_VOCABULARIES = Object.freeze({
  'packages/contracts/cloud-contracts/src/library.ts':
    'Library item kinds (image, video, file) name what a stored file is, not a block in a message, and happen to share three words with MESSAGE_KINDS.',
});

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
    else if (/\.tsx?$/.test(entry.name) && !TEST_FILE.test(entry.name)) yield child;
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

/** The event types the Rust-generated union declares, in order. */
export function agentEventTypes(source) {
  return [...source.matchAll(/\{ type: '([a-z][a-z-]*)' \}/g)].map((match) => match[1]);
}

export function eventTypesDecided(source, eventTypes) {
  return eventTypes.filter((type) =>
    new RegExp(`(?:case\\s+|[!=]==\\s*)['"\`]${type}['"\`]`).test(source),
  );
}

function findBlockKindReaders(root, eventTypes, pending, notReaders, findings) {
  const pendingSeen = new Set();
  const notReadersSeen = new Set();
  let readers = 0;
  for (const rootDir of CLIENT_ROOTS) {
    for (const relative of sourceFiles(root, rootDir)) {
      if (SERVER_PREFIXES.some((prefix) => relative.startsWith(prefix))) continue;
      const source = read(root, relative);
      const decided = eventTypesDecided(source, eventTypes);
      if (decided.length < MIN_EVENT_TYPES_DECIDED) continue;
      if (notReaders[relative] !== undefined) {
        notReadersSeen.add(relative);
        continue;
      }
      if (KIND_MAPPING_READ.test(source)) {
        readers += 1;
        continue;
      }
      if (pending[relative] !== undefined) {
        pendingSeen.add(relative);
        continue;
      }
      findings.push(
        `${relative}: decides blocks from agent event types (${decided.slice(0, 5).join(', ')}) without reading the kind through messageKindForAgentEvent in ${KIND_MAPPING}`,
      );
    }
  }
  for (const [relative, reason] of Object.entries(notReaders)) {
    if (typeof reason !== 'string' || reason.trim().length < 20) {
      findings.push(`${relative}: recorded as not a block-kind reader without a reason`);
    }
    if (!notReadersSeen.has(relative)) {
      findings.push(
        `${relative}: no longer matches the event-type scan. Delete its not-a-reader entry; the list only shrinks.`,
      );
    }
  }
  for (const [relative, fix] of Object.entries(pending)) {
    if (typeof fix !== 'string' || fix.trim().length < 20) {
      findings.push(`${relative}: recorded as pending without an owner and a fix`);
    }
    if (!pendingSeen.has(relative)) {
      findings.push(
        `${relative}: now reads block kinds through the mapping or no longer decides them. Delete its pending entry; the list only shrinks.`,
      );
    }
  }
  return readers;
}

export function runContentBlocksGuard(
  root = process.cwd(),
  { pending = BLOCK_KIND_READERS_PENDING, notReaders = NOT_BLOCK_KIND_READERS } = {},
) {
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
  const separateSeen = new Set();
  for (const rootDir of SCANNED_ROOTS) {
    for (const relative of sourceFiles(root, rootDir)) {
      if (relative === VOCABULARY) continue;
      scanned += 1;
      const restatements = arrayLiteralsRestatingTheVocabulary(read(root, relative), kinds);
      if (restatements.length > 0 && SEPARATE_VOCABULARIES[relative] !== undefined) {
        separateSeen.add(relative);
        continue;
      }
      for (const restatement of restatements) {
        findings.push(
          `${relative}: restates the block vocabulary (${restatement}) instead of reading MESSAGE_KINDS`,
        );
      }
    }
  }
  for (const relative of Object.keys(SEPARATE_VOCABULARIES)) {
    if (!separateSeen.has(relative)) {
      findings.push(
        `${relative}: no longer shares block kinds with MESSAGE_KINDS. Delete its entry from SEPARATE_VOCABULARIES; the list only shrinks.`,
      );
    }
  }

  let readers = 0;
  if (existsSync(path.join(root, AGENT_EVENT_UNION))) {
    const eventTypes = agentEventTypes(read(root, AGENT_EVENT_UNION));
    if (eventTypes.length === 0) {
      findings.push(`${AGENT_EVENT_UNION}: declares no event types this guard can read`);
    } else if (!existsSync(path.join(root, KIND_MAPPING))) {
      findings.push(`${KIND_MAPPING} is missing, so no client can read a block kind from an event`);
    } else {
      const mapping = read(root, KIND_MAPPING);
      for (const type of eventTypes) {
        if (!new RegExp(`['"\`]?${type}['"\`]?\\s*:`).test(mapping)) {
          findings.push(`${KIND_MAPPING}: maps no block kind for the event type '${type}'`);
        }
      }
      readers = findBlockKindReaders(root, eventTypes, pending, notReaders, findings);
    }
  }

  const summary =
    findings.length === 0
      ? `content blocks: ${kinds.length} kinds declared once and degraded under test, ${scanned} files carry no second copy, ${readers} client module(s) read block kinds through the mapping, ${Object.keys(pending).length} pending, ${Object.keys(notReaders).length} recorded as not block-kind readers`
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
