import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { JOB_QUEUE_POLICIES } from '../job-queues';

const MIGRATIONS = path.resolve(__dirname, '../../../db/neon');

/**
 * Every column a table has once every migration that touches it has run. Read
 * from the migrations rather than from a fixture, so a column removed or
 * renamed by a later migration takes the promise that rests on it with it.
 */
function columnsOf(table: string): Set<string> {
  const columns = new Set<string>();
  const files = readdirSync(MIGRATIONS)
    .filter((entry) => /^\d{4}_.+\.sql$/.test(entry))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS, file), 'utf8').replace(/--[^\n]*/g, ' ');
    const created = sql.match(
      new RegExp(`create table (?:if not exists )?public\\.${table} \\(([\\s\\S]*?)\\n\\);`, 'i'),
    );
    if (created?.[1]) {
      for (const line of created[1].split('\n')) {
        const column = line.match(/^\s{2}([a-z_][a-z0-9_]*)\s+\S/);
        if (column?.[1] && !['constraint', 'check', 'unique', 'foreign'].includes(column[1])) {
          columns.add(column[1]);
        }
      }
    }
    const altered = sql.matchAll(new RegExp(`alter table public\\.${table}([\\s\\S]*?);`, 'gi'));
    for (const block of altered) {
      for (const added of block[1]!.matchAll(
        /add column (?:if not exists )?([a-z_][a-z0-9_]*)/gi,
      )) {
        columns.add(added[1]!.toLowerCase());
      }
      for (const dropped of block[1]!.matchAll(/drop column (?:if exists )?([a-z_][a-z0-9_]*)/gi)) {
        columns.delete(dropped[1]!.toLowerCase());
      }
    }
  }
  return columns;
}

const backgroundJobs = columnsOf('background_jobs');
const runs = columnsOf('cloud_agent_runs');
const events = columnsOf('cloud_agent_events');
const operations = columnsOf('cloud_agent_execution_operations');

/**
 * The eleven things a background operation has to record for a reader to be
 * told the truth about work they cannot see. Each is claimed by the columns
 * that carry it, so the claim fails with the column rather than outliving it.
 */
const FACETS: ReadonlyArray<[string, ReadonlyArray<[Set<string>, string]>]> = [
  [
    'a durable job id',
    [
      [backgroundJobs, 'id'],
      [runs, 'id'],
    ],
  ],
  [
    'job state',
    [
      [backgroundJobs, 'status'],
      [runs, 'state'],
    ],
  ],
  [
    'worker ownership',
    [
      [backgroundJobs, 'worker_id'],
      [operations, 'lease_token'],
    ],
  ],
  [
    'progress',
    [
      [runs, 'last_event_sequence'],
      [events, 'sequence'],
    ],
  ],
  [
    'cancellation',
    [
      [backgroundJobs, 'cancel_requested_at'],
      [runs, 'cancellation_requested_at'],
    ],
  ],
  [
    'retry',
    [
      [backgroundJobs, 'attempts'],
      [backgroundJobs, 'max_attempts'],
      [backgroundJobs, 'retry_reason'],
    ],
  ],
  [
    'timeout',
    [
      [backgroundJobs, 'lease_expires_at'],
      [operations, 'lease_expires_at'],
    ],
  ],
  [
    'usage',
    [
      [backgroundJobs, 'usage'],
      [runs, 'settled_usage'],
    ],
  ],
  [
    'a result reference',
    [
      [backgroundJobs, 'result'],
      [operations, 'result'],
    ],
  ],
  [
    'a failure reason',
    [
      [backgroundJobs, 'last_error'],
      [backgroundJobs, 'dead_reason'],
    ],
  ],
  [
    'an event stream',
    [
      [events, 'envelope'],
      [events, 'event_type'],
    ],
  ],
];

describe('the durable record behind work a reader cannot watch', () => {
  it('reads real tables out of the migrations rather than an empty set', () => {
    for (const [name, columns] of [
      ['background_jobs', backgroundJobs],
      ['cloud_agent_runs', runs],
      ['cloud_agent_events', events],
      ['cloud_agent_execution_operations', operations],
    ] as const) {
      expect(columns.size, `${name} has no columns`).toBeGreaterThan(4);
    }
  });

  it.each(FACETS)('records %s', (_facet, claims) => {
    for (const [columns, column] of claims) expect([...columns]).toContain(column);
  });

  it('answers all eleven, so none of them rests on prose alone', () => {
    expect(FACETS).toHaveLength(11);
  });

  /**
   * How long a lease lasts and how often a job is retried come from the queue
   * policy, so a queue added without them cannot fall back to a default that
   * never expires.
   */
  it('bounds every queue from its policy rather than from a literal at the call site', () => {
    const queues = Object.entries(JOB_QUEUE_POLICIES);
    expect(queues.length).toBeGreaterThan(4);
    for (const [queue, policy] of queues) {
      expect(policy.maxConcurrency, queue).toBeGreaterThan(0);
      expect(policy.maxAttempts, queue).toBeGreaterThan(0);
      expect(policy.leaseSeconds, queue).toBeGreaterThan(0);
      expect(policy.backoffMaxSeconds, queue).toBeGreaterThanOrEqual(policy.backoffBaseSeconds);
      expect(policy.retainFinishedDays, queue).toBeGreaterThan(0);
    }
  });
});
