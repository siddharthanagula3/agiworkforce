// A research run spends a user's money and reads the open web, so its stop
// rules must come from configuration and every terminal path must leave a row.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export const LOOP_PATH = 'apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts';
export const CONTRACT_PATH = 'packages/contracts/types/src/research.ts';

/** Terminal statuses a run may end on; the rest are in-flight. */
export const TERMINAL_STATUSES = Object.freeze(['completed', 'interrupted', 'failed']);

/**
 * Tool executions inside the loop that open a network connection. Each must be
 * handed the run's AbortSignal or a cancel leaves the connection open.
 */
export const NETWORK_TOOL_CALLS = Object.freeze(['executeWebSearch', 'executeUrlFetch']);

function read(repoRoot, relative) {
  return readFileSync(path.join(repoRoot, relative), 'utf8');
}

/** Every status the contract declares, in the order it declares them. */
export function contractStatuses(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, CONTRACT_PATH);
  const block = /RESEARCH_REPORT_STATUSES[^=]*=\s*\[([\s\S]*?)\]/.exec(source);
  if (!block) return [];
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

/** The numeric run bounds the loop accepts, read from its options interface. */
export function declaredBounds(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, LOOP_PATH);
  const block = /interface ResearchLoopOptions \{([\s\S]*?)\n\}/.exec(source);
  if (!block) return [];
  return [...block[1].matchAll(/^\s{2}([a-zA-Z]+)\?:\s*number;/gm)].map((match) => match[1]);
}

/** Statuses the loop actually persists, from its persistReport call sites. */
export function persistedStatuses(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, LOOP_PATH);
  return [...source.matchAll(/persistRun\(\s*'([a-z_]+)'/g)].map((match) => match[1]);
}

export function boundResolutions(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, LOOP_PATH);
  const resolutions = new Map();
  for (const match of source.matchAll(
    /const\s+([a-zA-Z]+)\s*=\s*\n?\s*options\.([a-zA-Z]+)\s*\?\?\s*\n?\s*envInt\(\s*'([A-Z0-9_]+)'/g,
  )) {
    resolutions.set(match[2], { local: match[1], envVar: match[3] });
  }
  return resolutions;
}

export function unsignalledNetworkCalls(repoRoot = REPO_ROOT) {
  const source = read(repoRoot, LOOP_PATH);
  const missing = [];
  for (const name of NETWORK_TOOL_CALLS) {
    const pattern = new RegExp(`await\\s+${name}\\(([\\s\\S]*?)\\n\\s*\\);`, 'g');
    let seen = 0;
    for (const match of source.matchAll(pattern)) {
      seen += 1;
      if (!/options\.signal/.test(match[1])) {
        missing.push({
          call: name,
          line: source.slice(0, match.index).split('\n').length,
        });
      }
    }
    if (seen === 0) missing.push({ call: name, line: 0, absent: true });
  }
  return missing;
}

export function findings(repoRoot = REPO_ROOT) {
  const problems = [];

  const statuses = new Set(contractStatuses(repoRoot));
  if (statuses.size === 0) problems.push('RESEARCH_REPORT_STATUSES could not be read');

  const persisted = persistedStatuses(repoRoot);
  for (const status of persisted) {
    if (!statuses.has(status)) {
      problems.push(`the loop persists "${status}", which the research contract does not declare`);
    }
  }
  for (const status of TERMINAL_STATUSES) {
    if (!statuses.has(status)) {
      problems.push(`the contract no longer declares the terminal status "${status}"`);
      continue;
    }
    if (!persisted.includes(status)) {
      problems.push(`no terminal path of the loop persists a "${status}" run`);
    }
  }

  const resolutions = boundResolutions(repoRoot);
  for (const bound of declaredBounds(repoRoot)) {
    if (!resolutions.has(bound)) {
      problems.push(
        `the bound "${bound}" is not resolved as options.${bound} ?? envInt(...), so it cannot be configured`,
      );
    }
  }

  for (const call of unsignalledNetworkCalls(repoRoot)) {
    problems.push(
      call.absent
        ? `${call.call} is no longer called from the research loop; update this guard`
        : `${call.call} at line ${call.line} does not receive the run's cancellation signal`,
    );
  }

  return problems;
}
