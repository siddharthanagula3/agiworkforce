#!/usr/bin/env node

// The deep research loop's stop rules, its terminal report statuses and its
// cancellation reach, checked against the research contract rather than prose.

import process from 'node:process';
import {
  contractStatuses,
  declaredBounds,
  findings,
  NETWORK_TOOL_CALLS,
  TERMINAL_STATUSES,
} from './lib/research-run-bounds.mjs';

function main() {
  const problems = findings();

  if (problems.length > 0) {
    console.error('Research run bounds and terminal paths:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      '\nEvery bound comes from options or AGI_RESEARCH_* configuration, every terminal path\n' +
        'writes a typed report, and every network tool call takes the run’s cancellation signal.',
    );
    process.exit(1);
  }

  console.log(
    `check-research-run-bounds: ${declaredBounds().length} configured bounds, ` +
      `${TERMINAL_STATUSES.length} of ${contractStatuses().length} contract statuses are terminal, ` +
      `${NETWORK_TOOL_CALLS.length} network tools carry the cancellation signal.`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
