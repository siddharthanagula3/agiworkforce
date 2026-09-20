#!/usr/bin/env node
/**
 * Every outbound call this server makes reaches a host the repository chose, or
 * a host it resolved and refused before the socket opened.
 *
 * The modules are enumerated from the file tree. A guard that selects its own
 * subjects by searching for the name of the helper it is about to require can
 * only ever see a module that already adopted the helper: the module that never
 * heard of it is the one that reaches an attacker's host, and it is invisible.
 * So the question asked here runs the other way. For every outbound call, where
 * did the target come from? An identifier declared at module scope, imported,
 * or built inside the function out of such identifiers is this repository's own
 * choice of host. Anything else arrived as a parameter, a request body or a
 * stored row, and the host has to be resolved before it is dialled.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  moduleScopeFunctions,
  outboundFetchCalls,
  sourceFilesUnder,
} from './lib/url-fetch-egress.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SCAN_ROOTS = ['apps/web/app', 'apps/web/lib'];

/** The modules that implement the vetting, and so handle an unvetted URL by trade. */
const TRANSPORT = ['apps/web/lib/egress-policy.ts', 'apps/web/lib/url-fetch/guarded-fetch.ts'];

/** Any one of these resolves the host and refuses an address inside the network. */
const VETTING = [
  'assertResolvedPublicHostname',
  'validateEgressUrl',
  'guardedFetch(',
  'credentialedFetch(',
];

/** A module that admits the URL only when its own allowlist recognises it. */
const ALLOWLIST_PREDICATE = /\bis(?:Trusted|Allowed|Permitted)[A-Za-z]*Url\s*\(/;

const SAFE_REDIRECTS = ['manual', 'error'];
const CLIENT_MODULE = /^\s*['"]use client['"]\s*;?\s*$/m;
const IDENTIFIER = /[A-Za-z_$][\w$]*/;
const MAX_BINDING_DEPTH = 4;

function relative(file) {
  return path.relative(scanRoot, file).split(path.sep).join('/');
}

/**
 * The identifiers an expression is built from, reading through a template
 * literal to the root of each interpolation.
 */
export function expressionRoots(expression) {
  const text = expression.trim().replace(/^(?:await|new|typeof|void)\s+/, '');
  if (/^['"]/.test(text)) return [];
  if (text.startsWith('`')) {
    // A literal scheme and host before the first hole fixes the host; what
    // follows it is a path, and a path reaches no other machine.
    if (/^`https?:\/\/[^/`$]+\//.test(text)) return [];
    return [...text.matchAll(/\$\{([^}]*)\}/g)]
      .map(([, inner]) => IDENTIFIER.exec(inner.trim())?.[0])
      .filter(Boolean);
  }
  const root = IDENTIFIER.exec(text);
  return root ? [root[0]] : [];
}

const MODULE_DECLARATION =
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class)\s+(\w+)|^(?:export\s+)?(?:const|let|var)\s+(\w+)/gm;
const IMPORTED = /import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))\s*from\s*['"]/g;

/** Names this module owns: declared at its top level, or imported into it. */
export function moduleScopeNames(source) {
  const names = new Set(['process', 'globalThis', 'URL', 'String', 'Number']);
  MODULE_DECLARATION.lastIndex = 0;
  let match;
  while ((match = MODULE_DECLARATION.exec(source)) !== null) {
    names.add(match[1] ?? match[2]);
  }
  IMPORTED.lastIndex = 0;
  while ((match = IMPORTED.exec(source)) !== null) {
    if (match[2]) {
      names.add(match[2]);
      continue;
    }
    for (const part of match[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function localBinding(name, enclosing) {
  const declaration = new RegExp(`(?:const|let|var)\\s+${name}\\s*(?::[^=\\n]+)?=\\s*([^;\\n]+)`);
  return declaration.exec(enclosing)?.[1] ?? null;
}

/** The parameter names of a function, in the order the call sites fill them. */
export function parameterNames(header) {
  const open = header.indexOf('(');
  if (open === -1) return [];
  let depth = 0;
  let close = open;
  for (; close < header.length; close += 1) {
    if (header[close] === '(') depth += 1;
    else if (header[close] === ')') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return splitArguments(header.slice(open + 1, close)).map(
    (part) => IDENTIFIER.exec(part.trim())?.[0] ?? '',
  );
}

/** Splits on the commas that separate arguments, not the ones nested inside them. */
export function splitArguments(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at];
    if (quote) {
      if (char === '\\') at += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') quote = char;
    else if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, at));
      start = at + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.filter((part) => part.trim().length > 0);
}

/** What every call site inside this module passes for one parameter of one function. */
function argumentsPassedFor(source, functionName, position) {
  const needle = `${functionName}(`;
  const passed = [];
  for (let at = source.indexOf(needle); at !== -1; at = source.indexOf(needle, at + 1)) {
    const before = source[at - 1];
    if (before && /[\w.$]/.test(before)) continue;
    if (/(?:function|const|let|var)\s+$/.test(source.slice(Math.max(0, at - 24), at))) continue;
    let depth = 0;
    let end = at + functionName.length;
    for (; end < source.length; end += 1) {
      if (source[end] === '(') depth += 1;
      else if (source[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const argument = splitArguments(source.slice(at + needle.length, end))[position];
    if (argument === undefined) return null;
    passed.push(argument);
  }
  return passed.length > 0 ? passed : null;
}

/**
 * True when every identifier the target is built from is one this module owns,
 * following a local binding to what it was assigned and a parameter back to
 * what this module's own call sites pass for it.
 */
export function targetIsRepoChosen(expression, context, depth = 0) {
  if (depth > MAX_BINDING_DEPTH) return false;
  const roots = expressionRoots(expression);
  if (roots.length === 0) return true;
  return roots.every((name) => {
    if (context.moduleNames.has(name)) return true;
    const bound = localBinding(name, context.enclosing);
    if (bound !== null) return targetIsRepoChosen(bound, context, depth + 1);
    const position = context.parameters.indexOf(name);
    if (position === -1 || !context.functionName) return false;
    const passed = argumentsPassedFor(context.source, context.functionName, position);
    if (passed === null) return false;
    return passed.every((argument) =>
      targetIsRepoChosen(argument, { ...context, enclosing: context.source }, depth + 1),
    );
  });
}

function main() {
  const failures = [];
  let callCount = 0;
  let outsideCount = 0;

  const files = SCAN_ROOTS.map((root) => path.join(scanRoot, root))
    .filter((dir) => fs.existsSync(dir))
    .flatMap((dir) => sourceFilesUnder(dir));

  if (files.length === 0) {
    console.error(
      'check-security-egress-inventory: no source file was found, which cannot be right.',
    );
    process.exit(1);
  }

  for (const file of files) {
    const rel = relative(file);
    if (TRANSPORT.includes(rel)) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (CLIENT_MODULE.test(source)) continue;

    const calls = outboundFetchCalls(source);
    if (calls.length === 0) continue;

    const functions = moduleScopeFunctions(source);
    const moduleNames = moduleScopeNames(source);

    for (const call of calls) {
      if (!call.target) continue;
      callCount += 1;

      const holder = functions.find((fn) => call.index >= fn.start && call.index < fn.end);
      const enclosing = holder ? source.slice(holder.start, holder.end) : source;
      const context = {
        source,
        moduleNames,
        enclosing,
        functionName: holder?.name ?? null,
        parameters: holder ? parameterNames(source.slice(holder.start, holder.end)) : [],
      };
      if (targetIsRepoChosen(call.target, context)) continue;

      outsideCount += 1;
      const site = `${rel}::${holder ? holder.name : '<module scope>'}`;
      const target = call.target.trim().split('\n')[0];

      // The allowlist is often applied where the URL is selected rather than
      // where it is dialled, so the module is the scope that answers for it.
      if (ALLOWLIST_PREDICATE.test(source)) continue;
      if (!VETTING.some((name) => enclosing.includes(name))) {
        failures.push(
          `${site} fetches ${target}, a target that arrived from outside this module, without ` +
            `resolving the host first. An address inside the deployment's own network reaches ` +
            `services no caller is authenticated against. Call assertResolvedPublicHostname from ` +
            `apps/web/lib/egress-policy.ts before the call, or fetch through guardedFetch.`,
        );
        continue;
      }
      if (
        !SAFE_REDIRECTS.includes(call.redirect ?? '') &&
        !enclosing.includes('guardedFetch(') &&
        !enclosing.includes('credentialedFetch(')
      ) {
        failures.push(
          `${site} vets its first hop and then follows redirects with ` +
            `'${call.redirect ?? 'follow (unset)'}', so the host it reaches is not the host it ` +
            `vetted. Use redirect: 'manual' and vet each hop, or fetch through guardedFetch.`,
        );
      }
    }
  }

  if (failures.length === 0) {
    console.log(
      `check-security-egress-inventory: ${files.length} server modules, ${callCount} outbound ` +
        `call(s), ${outsideCount} to a target from outside the module, all vetted.`,
    );
    process.exit(0);
  }

  console.error('Outbound calls reaching a host nothing in this process resolved:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`\n${failures.length} finding(s).`);
  process.exit(1);
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
