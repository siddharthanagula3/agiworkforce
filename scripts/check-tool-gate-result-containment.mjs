#!/usr/bin/env node
/**
 * A tool result is untrusted data: bounded, and never promoted into a layer
 * the model reads as instruction.
 *
 * The loop appends every result to the same message array the system prompt
 * lives in, so a result written with `role: 'system'` would read to the model
 * as policy rather than as data. The message writes are enumerated here rather
 * than listed, and every connector or MCP result has to pass through the
 * output cap on its way in.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const LOOP_MODULE = 'apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts';
const CAP = 'capOutput';
const DATA_ROLES = new Set(['tool', 'assistant', 'user']);

/** Every `role:` a message write in the loop can carry. */
export function messageRoles(source) {
  const roles = [];
  const pattern = /messages\.push\(\s*\{/gu;
  let found = pattern.exec(source);
  while (found !== null) {
    const start = found.index;
    const role = /role:\s*'([a-z]+)'/u.exec(source.slice(start, start + 400));
    roles.push({
      line: source.slice(0, start).split('\n').length,
      role: role ? role[1] : null,
    });
    found = pattern.exec(source);
  }
  return roles;
}

export function containmentFailures(root) {
  const failures = [];
  const loopPath = path.join(root, LOOP_MODULE);
  if (!fs.existsSync(loopPath)) return { failures: [`${LOOP_MODULE} is missing`], writes: 0 };
  const source = fs.readFileSync(loopPath, 'utf8');
  const roles = messageRoles(source);
  for (const write of roles) {
    if (write.role === null) {
      failures.push(
        `${LOOP_MODULE}:${write.line} appends a message with no literal role, so its layer cannot be read here`,
      );
      continue;
    }
    if (!DATA_ROLES.has(write.role)) {
      failures.push(
        `${LOOP_MODULE}:${write.line} appends a tool result as "${write.role}", which the model reads as instruction`,
      );
    }
  }
  if (!new RegExp(`\\b${CAP}\\s*\\(`, 'u').test(source)) {
    failures.push(`${LOOP_MODULE} no longer bounds tool output through ${CAP}`);
  }
  return { failures, writes: roles.length };
}

function main() {
  const { failures, writes } = containmentFailures(scanRoot);
  if (writes === 0) {
    console.error(
      'check-tool-gate-result-containment: no message write found; the walk is measuring nothing.',
    );
    process.exit(1);
  }
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.log(
    `[tool result containment] ${writes} message write(s) in the loop, ${failures.length} failure(s)`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
