#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');
const scanRoot = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;

const SCAN_DIRS = ['apps/web/lib', 'apps/web/app/api'];
const CLAIM_PATH = 'apps/web/lib/services/cloud-agent-execution-service.ts';
const OPERATIONS_TABLE = 'public.cloud_agent_execution_operations';

// Anything that runs one external side effect of a Work run. Each has to state
// whether repeating it is safe, because the answer decides what happens when
// the process dies before the outcome is recorded.
const EXECUTORS = ['executeCloudAgentOperation', 'claimCloudAgentExecutionOperation'];

// What the claim path must keep doing: bound the replays, and park an unsafe
// operation whose outcome nobody saw instead of running it again.
const CLAIM_PATH_INVARIANTS = [
  { pattern: /MAX_OPERATION_REPLAY_ATTEMPTS/, why: 'the replay attempt bound' },
  { pattern: /OPERATION_REPLAY_LIMIT/, why: 'the replay limit refusal' },
  { pattern: /'unsafe'/, why: 'the unsafe retry-safety branch' },
  { pattern: /'outcome_unknown'/, why: 'the outcome-unknown parking state' },
];

function sourceFiles() {
  const out = [];
  const step = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('__')) continue;
        step(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
      out.push(path.relative(scanRoot, full).split(path.sep).join('/'));
    }
  };
  for (const dir of SCAN_DIRS) step(path.join(scanRoot, dir));
  return out.sort();
}

function callText(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex, i + 1);
    }
  }
  return source.slice(openIndex);
}

const findings = [];
let calls = 0;
let claimPathSeen = false;

for (const file of sourceFiles()) {
  const source = fs.readFileSync(path.join(scanRoot, file), 'utf8');

  for (const name of EXECUTORS) {
    for (const match of source.matchAll(new RegExp(`\\b${name}\\s*(<[^(]*>)?\\s*\\(`, 'g'))) {
      const openIndex = source.indexOf('(', (match.index ?? 0) + name.length);
      if (openIndex < 0) continue;
      const text = callText(source, openIndex);
      // The declaration itself carries the parameter rather than an argument.
      const before = source.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0);
      if (/\b(function|const|let)\s*$/.test(before)) continue;
      calls += 1;
      if (/\bretrySafety\s*(:|,|\})/.test(text)) continue;
      findings.push(`${file}: ${name} runs an external step without stating its retry safety`);
    }
  }

  if (file === CLAIM_PATH) {
    claimPathSeen = true;
    for (const invariant of CLAIM_PATH_INVARIANTS) {
      if (invariant.pattern.test(source)) continue;
      findings.push(`${file}: lost ${invariant.why}, so an unknown outcome can be replayed`);
    }
    continue;
  }

  // Only the claim path may put an operation back into flight. Anywhere else,
  // a write of 'running' is a second worker starting a step nobody leased.
  if (!source.includes(OPERATIONS_TABLE)) continue;
  for (const sqlMatch of source.matchAll(/`([^`]*)`/g)) {
    const sql = sqlMatch[1];
    if (!sql.includes(OPERATIONS_TABLE)) continue;
    if (!/\bstatus\s*=\s*'running'/.test(sql)) continue;
    if (
      /\bwhere\b[\s\S]*status\s*=\s*'running'/i.test(sql) &&
      !/set[\s\S]*status\s*=\s*'running'/i.test(sql)
    ) {
      continue;
    }
    findings.push(`${file}: re-arms an operation outside the claim path`);
  }
}

if (!claimPathSeen) {
  console.error(`check-unsafe-retry: ${CLAIM_PATH} is missing; the claim path moved`);
  process.exit(1);
}

if (calls === 0) {
  console.error(
    'check-unsafe-retry: found no Work operation executions; the executor list is stale',
  );
  process.exit(1);
}

if (findings.length > 0) {
  console.error('Work steps that could repeat an external side effect:');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(
  `check-unsafe-retry: ${calls} Work operation executions all declare retry safety, and the replay bound holds`,
);
