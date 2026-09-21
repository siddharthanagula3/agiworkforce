#!/usr/bin/env node
/**
 * Every first-party tool the model can be offered is declared once.
 *
 * `resolveToolMetadata` falls back to `UNKNOWN_TOOL_METADATA` for a name it
 * does not know, so a tool added without a declaration silently becomes an
 * irreversible write that accepts untrusted content and creates an egress
 * path. That is safe for approval and wrong for the trifecta: an undeclared
 * read raises the untrusted-content leg and escalates calls that follow it.
 *
 * The offerable names are read from the modules that declare them rather than
 * listed here, so a new tool constant joins the check by existing.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const METADATA_MODULE = 'apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts';
const NAME_ROOTS = ['apps/web/lib', 'packages/contracts', 'packages/tools'];
const LIST_CONSTANTS = ['DEVICE_STEP_TOOLS', 'EXECUTION_TOOLS', 'BROWSER_COMMANDS'];

const REQUIRED_FACETS = [
  'actionClass',
  'reversible',
  'acceptsUntrustedContent',
  'createsEgressPath',
  'declared',
];

const SKIP_DIR = /^(node_modules|\.next|\.turbo|coverage|dist|out|build)$/u;
const SOURCE_FILE = /\.ts$/u;
const TEST_FILE = /(?:\.test\.|\.spec\.|__tests__|__mocks__)/u;
const TOOL_NAME_VALUE = /^[a-z][a-z0-9_]*$/u;

/**
 * Tools offered today with no declaration. Each entry states why it is here;
 * the list may only shrink, and a name not on it fails the guard.
 */
const DEVICE_STEP_REASON =
  "a device step runs on the user's own machine under the desktop runtime's own permission prompt, and the gate allows it at rank 2 before any metadata is read; declaring one changes the approval surface";

const BROWSER_COMMAND_REASON =
  "a browser command runs in the user's own paired browser through the extension bridge, which holds its own allowlist and consent gate; declaring one here changes which policy auto-approves it";

export const UNDECLARED_BASELINE = new Map([
  [
    'search_places',
    'offered whenever the places backend is configured; declaring it changes which policy auto-approves it, which is a founder-frozen decision',
  ],
  [
    'ask_clarifying_questions',
    'asks the user a question and returns their answer; declaring it read-class changes which policy auto-approves it, which is a founder-frozen decision',
  ],
  ['device_read_file', DEVICE_STEP_REASON],
  ['device_list_folder', DEVICE_STEP_REASON],
  ['device_write_file', DEVICE_STEP_REASON],
  ['device_run_command', DEVICE_STEP_REASON],
  ['device_screenshot', DEVICE_STEP_REASON],
  ['device_zoom', DEVICE_STEP_REASON],
  ['device_move', DEVICE_STEP_REASON],
  ['device_click', DEVICE_STEP_REASON],
  ['device_drag', DEVICE_STEP_REASON],
  ['device_scroll', DEVICE_STEP_REASON],
  ['device_type', DEVICE_STEP_REASON],
  ['device_key', DEVICE_STEP_REASON],
  ['device_wait', DEVICE_STEP_REASON],
  ['browser_read_page', BROWSER_COMMAND_REASON],
  ['browser_click', BROWSER_COMMAND_REASON],
  ['browser_type', BROWSER_COMMAND_REASON],
  ['browser_navigate', BROWSER_COMMAND_REASON],
  ['browser_screenshot', BROWSER_COMMAND_REASON],
  ['browser_console', BROWSER_COMMAND_REASON],
  ['browser_network', BROWSER_COMMAND_REASON],
  ['browser_download', BROWSER_COMMAND_REASON],
  [
    'run_command',
    'belongs to the Cloud Code agent loop, which has its own tool definitions and its own approval store (cloud_code_agent_approvals), not this registry; one of the two surfaces has to move before it can be declared once',
  ],
]);

export function walkSources(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.test(entry.name)) continue;
      found.push(...walkSources(full));
      continue;
    }
    if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(full)) found.push(full);
  }
  return found;
}

/** `export const X_TOOL = 'name'` and `export const X_TOOL_NAME = 'name'`. */
export function toolNameConstants(source) {
  const names = [];
  const pattern = /export const ([A-Z][A-Z0-9_]*_TOOL(?:_NAME)?)\s*=\s*'([^']+)'/gu;
  let found = pattern.exec(source);
  while (found !== null) {
    if (TOOL_NAME_VALUE.test(found[2])) names.push(found[2]);
    found = pattern.exec(source);
  }
  return names;
}

/** The string members of a named array or set literal, wherever it is declared. */
export function toolNameList(source, constant) {
  const anchor = new RegExp(`\\b${constant}\\b[^=]*=\\s*(?:new Set<[^>]*>\\()?\\[`, 'u');
  const found = anchor.exec(source);
  if (!found) return [];
  const start = found.index + found[0].length;
  const end = source.indexOf(']', start);
  if (end < 0) return [];
  return [...source.slice(start, end).matchAll(/'([^']+)'/gu)]
    .map((match) => match[1])
    .filter((value) => TOOL_NAME_VALUE.test(value));
}

export function declaredTools(metadataSource) {
  const start = metadataSource.indexOf('PLATFORM_TOOL_METADATA');
  if (start < 0) return new Map();
  const open = metadataSource.indexOf('({', start);
  const close = metadataSource.indexOf('\n});', open);
  if (open < 0 || close < 0) return new Map();
  const body = metadataSource.slice(open + 2, close);
  const entries = new Map();
  const pattern = /^ {2}([a-z][a-z0-9_]*):\s*\{/gmu;
  let found = pattern.exec(body);
  while (found !== null) {
    const entryStart = found.index + found[0].length;
    const entryEnd = body.indexOf('\n  },', entryStart);
    entries.set(found[1], body.slice(entryStart, entryEnd < 0 ? body.length : entryEnd));
    found = pattern.exec(body);
  }
  return entries;
}

export function offerableToolNames(root) {
  const names = new Set();
  for (const relative of NAME_ROOTS) {
    for (const file of walkSources(path.join(root, relative))) {
      const source = fs.readFileSync(file, 'utf8');
      for (const name of toolNameConstants(source)) names.add(name);
      for (const constant of LIST_CONSTANTS) {
        for (const name of toolNameList(source, constant)) names.add(name);
      }
    }
  }
  return names;
}

export function registryFailures(root, baseline = UNDECLARED_BASELINE) {
  const failures = [];
  const metadataPath = path.join(root, METADATA_MODULE);
  if (!fs.existsSync(metadataPath)) {
    return { failures: [`${METADATA_MODULE} is missing`], offered: 0, declared: 0 };
  }
  const declarations = declaredTools(fs.readFileSync(metadataPath, 'utf8'));
  if (declarations.size === 0) {
    return {
      failures: [`${METADATA_MODULE} declares no tools; the read is broken`],
      offered: 0,
      declared: 0,
    };
  }
  for (const [name, body] of declarations) {
    for (const facet of REQUIRED_FACETS) {
      if (!new RegExp(`\\b${facet}:`, 'u').test(body)) {
        failures.push(`${METADATA_MODULE}: "${name}" declares no ${facet}`);
      }
    }
  }
  const offered = offerableToolNames(root);
  for (const name of offered) {
    if (declarations.has(name)) continue;
    if (baseline.has(name)) continue;
    failures.push(
      `"${name}" can be offered to the model but has no PLATFORM_TOOL_METADATA entry, ` +
        `so it resolves to UNKNOWN_TOOL_METADATA`,
    );
  }
  for (const name of baseline.keys()) {
    if (declarations.has(name)) {
      failures.push(
        `"${name}" is declared now; remove it from UNDECLARED_BASELINE so the list keeps shrinking`,
      );
    } else if (!offered.has(name)) {
      failures.push(
        `"${name}" is in UNDECLARED_BASELINE but nothing offers it any more; remove the entry`,
      );
    }
  }
  return { failures, offered: offered.size, declared: declarations.size };
}

function main() {
  const { failures, offered, declared } = registryFailures(scanRoot);
  if (offered === 0) {
    console.error(
      'check-tool-registry: no tool name constant found; the walk is measuring nothing.',
    );
    process.exit(1);
  }
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.log(
    `[tool registry] ${offered} offerable tool name(s), ${declared} declared, ` +
      `${UNDECLARED_BASELINE.size} baselined, ${failures.length} failure(s)`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
