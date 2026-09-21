#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CONTRACT = 'packages/contracts/types/src/provider-adapter.ts';
const ENVELOPE = 'packages/ai/provider-protocol/src/agent-event-envelope.ts';
const PROVIDERS_DIR = 'packages/ai/providers';
const CONFORMANCE_TEST = 'stream-terminal-discipline.test.ts';
const EMITTER_ROOT = 'apps/web';
const EMITTER_FACTORY = 'createAgentEventStreamEmitter({';
const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', 'e2e']);

// A provider package reaches the canonical vocabulary through one of these.
// Anything else is a second vocabulary nobody downstream knows how to read.
const CANONICAL_ENTRY_POINTS = Object.freeze([
  'translateOpenAIStream',
  'translateOpenAIResponsesStream',
  'translateAnthropicStream',
  'translateGeminiStream',
  'translateOllamaStream',
  'createOpenAICompatAdapter',
]);

function read(root, relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

function directories(root, relative) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** The StreamChunk union members and the `type` literal each one declares. */
export function canonicalChunkTypes(source) {
  const union = /export type StreamChunk\s*=\s*\(([^)]*)\)/.exec(source);
  if (!union) throw new Error(`${CONTRACT} declares no StreamChunk union`);
  const members = [...union[1].matchAll(/\|\s*([A-Za-z0-9_]+)/g)].map((match) => match[1]);
  if (members.length === 0) throw new Error(`${CONTRACT} declares an empty StreamChunk union`);

  const byInterface = new Map();
  for (const match of source.matchAll(/export interface ([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\}/g)) {
    const literal = /\btype:\s*'([^']+)'/.exec(match[2]);
    if (literal) byInterface.set(match[1], literal[1]);
  }

  const missing = members.filter((member) => !byInterface.has(member));
  if (missing.length > 0) {
    throw new Error(`StreamChunk members declare no type literal: ${missing.join(', ')}`);
  }
  return members.map((member) => ({ member, literal: byInterface.get(member) }));
}

function terminalLiteral(types) {
  const stop = types.find((entry) => entry.member === 'StreamChunkStop');
  if (!stop) throw new Error(`${CONTRACT} declares no StreamChunkStop member`);
  return stop.literal;
}

// Only object literals handed straight to `yield`. A vendor payload nested
// inside one carries its own `type` and is not a canonical chunk.
function yieldedLiterals(source) {
  return new Set([...source.matchAll(/yield\s*\{\s*type:\s*'([^']+)'/g)].map((match) => match[1]));
}

function* sourceFiles(root, relative) {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute) || !statSync(absolute).isDirectory()) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIPPED_DIRS.has(entry.name)) continue;
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) yield* sourceFiles(root, child);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) yield child;
  }
}

// A turn's events are keyed on the conversation they belong to. A call site
// that invents another session id splits one turn's ledger in two.
function emitterSessionFindings(root) {
  const findings = [];
  let callSites = 0;
  for (const relative of sourceFiles(root, EMITTER_ROOT)) {
    const source = read(root, relative);
    let index = source.indexOf(EMITTER_FACTORY);
    while (index !== -1) {
      callSites += 1;
      const argument = source.slice(index, index + 400);
      const property = /sessionId\s*(?::\s*([^,\n]+))?\s*,/.exec(argument);
      const shorthand = /\bconst sessionId\s*=\s*([^;\n]+)/.exec(source);
      const expression = property?.[1] ?? shorthand?.[1];
      if (!property) {
        findings.push(`${relative}: an agent event emitter is built with no sessionId`);
      } else if (!expression || !expression.includes('conversationId')) {
        findings.push(
          `${relative}: the agent event emitter's sessionId (${(expression ?? 'shorthand').trim()}) is not derived from the conversation id`,
        );
      }
      index = source.indexOf(EMITTER_FACTORY, index + 1);
    }
  }
  if (callSites === 0) findings.push(`${EMITTER_ROOT}: found no agent event emitter call site`);
  return { findings, callSites };
}

export function runStreamProtocolGuard(root = process.cwd()) {
  const findings = [];
  const types = canonicalChunkTypes(read(root, CONTRACT));
  const literals = new Set(types.map((entry) => entry.literal));
  const terminal = terminalLiteral(types);

  const envelope = read(root, ENVELOPE);
  const mapper = /export function streamChunkToAgentEvent[\s\S]*?\n\}/.exec(envelope);
  if (!mapper) {
    findings.push(`${ENVELOPE}: streamChunkToAgentEvent is missing`);
  } else {
    const handled = new Set([...mapper[0].matchAll(/case '([^']+)':/g)].map((match) => match[1]));
    for (const { member, literal } of types) {
      if (!handled.has(literal)) {
        findings.push(
          `${ENVELOPE}: streamChunkToAgentEvent never handles '${literal}' (${member}), so it reaches no client`,
        );
      }
    }
  }

  let translators = 0;
  for (const name of directories(root, PROVIDERS_DIR)) {
    const packageDir = `${PROVIDERS_DIR}/${name}`;
    const translator = `${packageDir}/src/stream.ts`;
    const index = `${packageDir}/src/index.ts`;

    if (existsSync(path.join(root, translator))) {
      translators += 1;
      const source = read(root, translator);
      for (const literal of yieldedLiterals(source)) {
        if (!literals.has(literal)) {
          findings.push(
            `${translator}: emits '${literal}', which the StreamChunk union does not declare`,
          );
        }
      }
      if (!source.includes(`type: '${terminal}'`)) {
        findings.push(`${translator}: never emits the terminal '${terminal}' chunk`);
      }
      const conformance = `${packageDir}/src/__tests__/${CONFORMANCE_TEST}`;
      if (!existsSync(path.join(root, conformance))) {
        findings.push(
          `${translator}: has no ${CONFORMANCE_TEST}, so its terminal ordering is unproven`,
        );
      }
    }

    if (!existsSync(path.join(root, index))) continue;
    const indexSource = read(root, index);
    if (!CANONICAL_ENTRY_POINTS.some((entry) => indexSource.includes(entry))) {
      findings.push(
        `${index}: reaches no canonical stream translator (${CANONICAL_ENTRY_POINTS.join(', ')})`,
      );
    }
  }

  if (translators === 0) findings.push(`${PROVIDERS_DIR}: found no stream translator to check`);

  const emitters = emitterSessionFindings(root);
  findings.push(...emitters.findings);

  const summary =
    findings.length === 0
      ? `stream protocol: ${types.length} canonical chunk types, ${translators} translators, ${emitters.callSites} emitter call sites, all mapped and covered`
      : findings.join('\n');
  return { findings, summary };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = runStreamProtocolGuard();
    const stream = result.findings.length === 0 ? process.stdout : process.stderr;
    stream.write(`${result.summary}\n`);
    if (result.findings.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`Stream protocol guard could not run: ${error.message}\n`);
    process.exitCode = 2;
  }
}
