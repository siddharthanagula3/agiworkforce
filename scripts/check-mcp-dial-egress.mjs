#!/usr/bin/env node
/**
 * Every MCP dial in the hosted app goes out through the managed egress policy.
 *
 * `connectMcpServer` takes its policy optionally and falls back to a pinned
 * public fetch, so a dial that forgets one still compiles and still passes its
 * unit test: nothing in the type system says which fetch reaches the network.
 * The hosted app connects to servers a user named, which is the definition of
 * a request an attacker chooses the destination of, so each dial has to name
 * `MCP_EGRESS_POLICY` and none may ask for the private network. The source of
 * truth is the set of dial sites in the tree, walked here rather than listed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const DIAL_ROOTS = ['apps/web/app', 'apps/web/lib', 'apps/web/features', 'apps/web/shared'];
const DIAL_FUNCTIONS = ['connectMcpServer', 'buildMcpToolCatalog'];
const REQUIRED_POLICY = 'MCP_EGRESS_POLICY';
const PRIVATE_NETWORK_OPT_IN = 'allowPrivateNetwork';
const SKIP_DIR = /^(node_modules|\.next|\.turbo|coverage|dist|out|build)$/u;
const SOURCE_FILE = /\.(?:ts|tsx)$/u;
const TEST_FILE = /(?:\.test\.|\.spec\.|__tests__|__mocks__)/u;

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

/** The argument text of each call to `name`, read by balancing parentheses. */
export function callArguments(source, name) {
  const calls = [];
  const opener = new RegExp(`\\b${name}\\s*\\(`, 'gu');
  let found = opener.exec(source);
  while (found !== null) {
    const start = found.index + found[0].length;
    let depth = 1;
    let index = start;
    while (index < source.length && depth > 0) {
      const char = source[index];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      index += 1;
    }
    calls.push({
      line: source.slice(0, found.index).split('\n').length,
      text: source.slice(start, index - 1),
    });
    found = opener.exec(source);
  }
  return calls;
}

export function dialViolations(relativePath, source) {
  const problems = [];
  for (const name of DIAL_FUNCTIONS) {
    for (const call of callArguments(source, name)) {
      if (!call.text.includes(REQUIRED_POLICY)) {
        problems.push(
          `${relativePath}:${call.line} ${name}() does not go out through ${REQUIRED_POLICY}`,
        );
      }
      if (call.text.includes(PRIVATE_NETWORK_OPT_IN)) {
        problems.push(
          `${relativePath}:${call.line} ${name}() asks for the private network from the hosted app`,
        );
      }
    }
  }
  return problems;
}

const failures = [];
let dialCount = 0;
let fileCount = 0;

for (const root of DIAL_ROOTS) {
  for (const file of walkSources(path.join(scanRoot, root))) {
    const source = fs.readFileSync(file, 'utf8');
    const dials = DIAL_FUNCTIONS.reduce(
      (total, name) => total + callArguments(source, name).length,
      0,
    );
    if (dials === 0) continue;
    fileCount += 1;
    dialCount += dials;
    failures.push(...dialViolations(path.relative(scanRoot, file), source));
  }
}

if (dialCount === 0) {
  console.error('check-mcp-dial-egress: no MCP dial sites found; the walk is measuring nothing.');
  process.exit(1);
}

for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(
  `[mcp dial egress] ${dialCount} dial(s) in ${fileCount} file(s), ${failures.length} failure(s)`,
);
process.exitCode = failures.length === 0 ? 0 : 1;
