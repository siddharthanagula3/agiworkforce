#!/usr/bin/env node

// One vocabulary for a Managed Cloud run, and one owner for every state that is
// not an ending. The database, the shared contract and the service that sweeps
// stalled runs each carry their own copy of the list, and when the list grew by
// five states only two of the three copies were updated: runs sat in the new
// states with nothing to end them. This guard enumerates all three from source
// and refuses any state that is declared without being classified.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

export const MIGRATIONS_DIR = 'apps/web/db/neon';
export const CONTRACT_PATH = 'packages/contracts/types/src/cross-device.ts';
export const SERVICE_PATH = 'apps/web/lib/services/cloud-agent-run-service.ts';
export const REAPER_PATH = 'apps/web/lib/services/cloud-agent-run-reaper.ts';

const STATE_COLUMN_TABLE = 'cloud_agent_runs';

function read(repoRoot, relativePath) {
  try {
    return readFileSync(path.join(repoRoot, relativePath), 'utf8');
  } catch {
    return null;
  }
}

function quotedValues(fragment) {
  return [...fragment.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

/**
 * The states the database will store, taken from the newest migration that
 * defines the check constraint rather than from the one that created it.
 */
export function readSqlStates(repoRoot = REPO_ROOT) {
  const dir = path.join(repoRoot, MIGRATIONS_DIR);
  let states = null;
  let source = null;
  for (const name of readdirSync(dir)
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .sort()) {
    const sql = readFileSync(path.join(dir, name), 'utf8').replace(/--[^\n]*/g, ' ');
    if (!sql.includes(STATE_COLUMN_TABLE)) continue;
    for (const match of sql.matchAll(
      /state\s+(?:text\s+not\s+null\s+default\s+'[a-z_]+'\s+)?check\s*\(\s*\n?\s*state\s+in\s*\(([^)]*)\)/gi,
    )) {
      states = quotedValues(match[1]);
      source = name;
    }
    for (const match of sql.matchAll(
      /add\s+constraint\s+cloud_agent_runs_state_check\s+check\s*\(\s*state\s+in\s*\(([^)]*)\)/gi,
    )) {
      states = quotedValues(match[1]);
      source = name;
    }
  }
  return { states, source };
}

function objectKeys(source, name) {
  const start = source.indexOf(`const ${name}`);
  if (start === -1) return null;
  const open = source.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  let end = open;
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1;
    else if (source[end] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = source.slice(open + 1, end);
  return [...body.matchAll(/(?:^|\n)\s*([a-z_]+)\s*:/g)].map((match) => match[1]);
}

function arrayValues(source, name) {
  const declaration = source.indexOf(`const ${name}`);
  if (declaration === -1) return null;
  const assigned = source.indexOf('=', declaration);
  if (assigned === -1) return null;
  const open = source.indexOf('[', assigned);
  if (open === -1) return null;
  const close = source.indexOf(']', open);
  if (close === -1) return null;
  return quotedValues(source.slice(open + 1, close));
}

/**
 * Every statement that writes `cloud_agent_runs.state`, with the state it
 * writes and whether it refuses a run that has already ended. Five of them did
 * not, so an executor that lost a race to the stall sweep put a finished run
 * back into live work by recording its own checkpoint.
 */
export function runStateWrites(source) {
  const writes = [];
  for (const match of source.matchAll(/update public\.cloud_agent_runs[\s\S]*?`/g)) {
    const statement = match[0];
    if (!/\bset\b[\s\S]*?\bstate\b\s*=/.test(statement)) continue;
    const literal = statement.match(/set\s+state\s*=\s*'([a-z_]+)'/);
    writes.push({
      target: literal ? literal[1] : null,
      guarded:
        statement.includes('RUN_HAS_NOT_ENDED') ||
        /state\s*=\s*any\(\$\d+::text\[\]\)/.test(statement) ||
        /runs\.state\s*=\s*any\(\$\d+::text\[\]\)/.test(statement) ||
        /and\s+state\s*=\s*'[a-z_]+'/.test(statement),
      excerpt: statement.split('\n').slice(0, 2).join(' ').replace(/\s+/g, ' ').slice(0, 120),
    });
  }
  return writes;
}

export function readVocabulary(repoRoot = REPO_ROOT) {
  const contract = read(repoRoot, CONTRACT_PATH);
  const service = read(repoRoot, SERVICE_PATH);
  return {
    declared: contract ? objectKeys(contract, 'AGENT_TASK_STATE_LABELS') : null,
    terminal: contract ? arrayValues(contract, 'TERMINAL_AGENT_TASK_STATES') : null,
    executorHeld: service ? arrayValues(service, 'EXECUTOR_HELD_TASK_STATES') : null,
    humanHeld: service ? arrayValues(service, 'HUMAN_HELD_TASK_STATES') : null,
  };
}

function missing(from, against) {
  return from.filter((value) => !against.includes(value));
}

export function checkAgentRunStateMachine(repoRoot = REPO_ROOT) {
  const errors = [];
  const { states: sqlStates, source } = readSqlStates(repoRoot);
  const { declared, terminal, executorHeld, humanHeld } = readVocabulary(repoRoot);

  for (const [label, value, where] of [
    ['the state check constraint', sqlStates, MIGRATIONS_DIR],
    ['AGENT_TASK_STATE_LABELS', declared, CONTRACT_PATH],
    ['TERMINAL_AGENT_TASK_STATES', terminal, CONTRACT_PATH],
    ['EXECUTOR_HELD_TASK_STATES', executorHeld, SERVICE_PATH],
    ['HUMAN_HELD_TASK_STATES', humanHeld, SERVICE_PATH],
  ]) {
    if (!value || value.length === 0) errors.push(`${label} could not be read from ${where}`);
  }
  if (errors.length > 0) return { errors, report: { states: 0, source } };

  for (const state of missing(sqlStates, declared)) {
    errors.push(`${state} is stored by the database but is not in AGENT_TASK_STATE_LABELS`);
  }
  for (const state of missing(declared, sqlStates)) {
    errors.push(`${state} is a declared task state the database will refuse to store`);
  }

  const classified = [...terminal, ...executorHeld, ...humanHeld];
  for (const state of missing(declared, classified)) {
    errors.push(
      `${state} is neither an ending, executor held nor human held, so nothing ever ends a run in it`,
    );
  }
  for (const state of classified) {
    if (!declared.includes(state)) errors.push(`${state} is classified but is not a task state`);
    if (classified.filter((entry) => entry === state).length > 1) {
      errors.push(`${state} is classified twice, so who holds the run is ambiguous`);
    }
  }

  const service = read(repoRoot, SERVICE_PATH);
  if (!service) errors.push(`${SERVICE_PATH} could not be read`);
  else {
    for (const statement of runStateWrites(service)) {
      if (statement.target && terminal.includes(statement.target)) continue;
      if (statement.guarded) continue;
      errors.push(
        `a statement setting cloud_agent_runs.state to ${statement.target ?? 'a computed state'} ` +
          `does not refuse a run that has already ended: ${statement.excerpt}`,
      );
    }
  }

  const reaper = read(repoRoot, REAPER_PATH);
  if (!reaper) errors.push(`${REAPER_PATH} could not be read`);
  else {
    const live = declared.filter((state) => !terminal.includes(state));
    for (const state of live) {
      if (reaper.includes(`'${state}'`)) {
        errors.push(
          `${REAPER_PATH} names ${state} directly; the sweep reads EXECUTOR_HELD_TASK_STATES so a new state cannot be forgotten`,
        );
      }
    }
    if (!reaper.includes('EXECUTOR_HELD_TASK_STATES')) {
      errors.push(`${REAPER_PATH} does not sweep from EXECUTOR_HELD_TASK_STATES`);
    }
  }

  return {
    errors,
    report: {
      states: declared.length,
      source,
      terminal: terminal.length,
      executorHeld: executorHeld.length,
      humanHeld: humanHeld.length,
    },
  };
}

function main() {
  const { errors, report } = checkAgentRunStateMachine(REPO_ROOT);

  if (errors.length > 0) {
    console.error('Agent run state machine check failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    `check-agent-run-state-machine: OK (${report.states} states from ${report.source}, ` +
      `${report.terminal} endings, ${report.executorHeld} executor held, ${report.humanHeld} human held)`,
  );
}

if (path.resolve(process.argv[1] ?? '') === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
