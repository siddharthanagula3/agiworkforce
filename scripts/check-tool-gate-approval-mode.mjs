#!/usr/bin/env node
/**
 * Every turn hands the gate an approval mode the account's policy decided.
 *
 * `approvalMode` selects between ranks 6 and 7 of the tool-call gate and rank
 * 9. Passing the literal 'auto' skips both policy ranks, so the account's Tool
 * Approvals setting is never consulted and any tool with no saved verdict is
 * allowed. 'manual' is always safe: it can only add an ask. A caller must
 * therefore derive the mode from `classifyToolLoopInputs`, which reads the
 * policy, or pin 'manual'.
 *
 * The call sites are walked rather than listed, so a new entry point is checked
 * by existing.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { callArguments, walkSources } from './check-connector-tool-gate.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const LOOP_MODULE = 'apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts';
const LOOP_ENTRY_POINTS = ['runToolLoop', 'runCloudAgentTurn'];
const OPTION = 'approvalMode';
const SCAN_ROOTS = ['apps/web'];

/**
 * Call sites that pass the literal 'auto' today. Each entry states why, and the
 * guard fails on any call site not named here, so the list can only shrink.
 */
export const AUTO_MODE_BASELINE = new Map([
  [
    'apps/web/lib/services/scheduled-agent-executor.ts',
    "a scheduled run pins 'auto' instead of asking classifyToolLoopInputs, which it already imports, so the account's Tool Approvals policy does not reach the gate on the one path that runs unattended",
  ],
]);

export function approvalModeArgument(callText) {
  const found = new RegExp(`\\b${OPTION}\\s*:\\s*([^,}\\n]+)`, 'u').exec(callText);
  return found ? found[1].trim() : null;
}

export function unsafeCalls(relativePath, source) {
  const problems = [];
  for (const entry of LOOP_ENTRY_POINTS) {
    // The module that declares an entry point matches its own signature.
    if (new RegExp(`function\\s*\\*?\\s*${entry}\\s*\\(`, 'u').test(source)) continue;
    for (const call of callArguments(source, entry)) {
      const argument = approvalModeArgument(call.text);
      if (argument === null) {
        problems.push({
          where: `${relativePath}:${call.line}`,
          message: `${entry}() passes no ${OPTION}, so the loop falls back to its own default`,
        });
        continue;
      }
      if (argument === "'manual'") continue;
      if (/classifyToolLoopInputs|loopInputs|approvalMode|input\.approvalMode/u.test(argument)) {
        continue;
      }
      problems.push({
        where: `${relativePath}:${call.line}`,
        message: `${entry}() pins ${OPTION}: ${argument}, which never consults the account policy`,
      });
    }
  }
  return problems;
}

export function approvalModeFailures(root, baseline = AUTO_MODE_BASELINE) {
  const failures = [];
  let callCount = 0;
  const seen = new Set();
  for (const scanned of SCAN_ROOTS) {
    for (const file of walkSources(path.join(root, scanned))) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      if (relative === LOOP_MODULE) continue;
      const source = fs.readFileSync(file, 'utf8');
      const problems = unsafeCalls(relative, source);
      callCount += LOOP_ENTRY_POINTS.reduce(
        (total, entry) => total + callArguments(source, entry).length,
        0,
      );
      for (const problem of problems) {
        seen.add(relative);
        if (baseline.has(relative)) continue;
        failures.push(`${problem.where} ${problem.message}`);
      }
    }
  }
  for (const relative of baseline.keys()) {
    if (!seen.has(relative)) {
      failures.push(`${relative} no longer pins an unsafe ${OPTION}; remove it from the baseline`);
    }
  }
  return { failures, callCount, baselined: seen.size };
}

function main() {
  const { failures, callCount, baselined } = approvalModeFailures(scanRoot);
  if (callCount === 0) {
    console.error(
      'check-tool-gate-approval-mode: no tool-loop entry point found; the walk is measuring nothing.',
    );
    process.exit(1);
  }
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.log(
    `[tool gate approval mode] ${callCount} loop entry call(s), ${baselined} baselined caller(s), ` +
      `${failures.length} failure(s)`,
  );
  process.exitCode = failures.length === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
