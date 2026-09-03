import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { AgentEvent } from '@agiworkforce/types/protocol';
import type { HarnessOutcome, HarnessParser } from '../types';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function readFixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), 'utf8');
}

export function feedFixture(
  parser: HarnessParser,
  name: string,
  exitCode = 0,
): { events: AgentEvent[]; outcome: HarnessOutcome } {
  const events: AgentEvent[] = [];
  for (const line of readFixture(name).split('\n')) {
    events.push(...parser.push(line, 'stdout'));
  }
  const flushed = parser.finish(exitCode);
  events.push(...flushed.events);
  return { events, outcome: flushed.outcome };
}
