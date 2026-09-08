import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/e2b/runtime', () => ({ getE2BExecutor: vi.fn(), killE2BSession: vi.fn() }));

import { CLOUD_CODE_RUN_LEASE_SECONDS } from '../cloud-code-session-service';
import { CLOUD_CODE_ROUTE_FUNCTION_LIMIT_MS } from '../cloud-code-agent-service';
import {
  CLOUD_CODE_STUCK_TURN_AGE_SECONDS,
  reapStuckCloudCodeTurns,
} from '../cloud-code-turn-reaper';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

let queries: { sql: string; params: unknown[] }[] = [];

/**
 * A fake that answers the two statements the sweep makes, and applies the
 * sweep's own age predicate to a fixture of rows, so a boundary case is decided
 * by the SQL's interval rather than by the test restating it.
 */
function db(rows: { id: string; ageSeconds: number; cancelRequested?: boolean }[]) {
  return {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      if (/update cloud_code_agent_turns/.test(sql)) {
        const [ageSeconds, limit] = params as [number, number];
        return rows
          .filter((row) => row.ageSeconds > ageSeconds)
          .slice(0, limit)
          .map((row) => ({
            session_id: SESSION_ID,
            user_id: `user-${row.id}`,
            stop_reason: row.cancelRequested ? 'cancelled' : 'timeout',
          }));
      }
      if (/update cloud_code_sessions/.test(sql)) return [{ id: SESSION_ID }];
      return [];
    }),
  };
}

beforeEach(() => {
  queries = [];
});

describe('the stuck-turn threshold', () => {
  it('is the route ceiling plus the run lease, in seconds', () => {
    expect(CLOUD_CODE_STUCK_TURN_AGE_SECONDS).toBe(
      CLOUD_CODE_ROUTE_FUNCTION_LIMIT_MS / 1_000 + CLOUD_CODE_RUN_LEASE_SECONDS,
    );
    expect(CLOUD_CODE_STUCK_TURN_AGE_SECONDS).toBe(720);
  });

  it('leaves a turn that is still inside the window alone', async () => {
    const report = await reapStuckCloudCodeTurns(
      db([
        { id: 'a', ageSeconds: CLOUD_CODE_STUCK_TURN_AGE_SECONDS - 1 },
        { id: 'b', ageSeconds: 60 },
      ]) as never,
    );

    expect(report.reaped).toBe(0);
    expect(queries.some((call) => /update cloud_code_sessions/.test(call.sql))).toBe(false);
  });

  it('reaps a turn once it is past the window', async () => {
    const report = await reapStuckCloudCodeTurns(
      db([
        { id: 'a', ageSeconds: CLOUD_CODE_STUCK_TURN_AGE_SECONDS - 1 },
        { id: 'b', ageSeconds: CLOUD_CODE_STUCK_TURN_AGE_SECONDS + 1 },
      ]) as never,
    );

    expect(report.reaped).toBe(1);
    expect(queries[0]?.params?.[0]).toBe(CLOUD_CODE_STUCK_TURN_AGE_SECONDS);
    expect(queries[0]?.sql).toContain("state = 'running'");
    expect(queries[0]?.sql).toContain('updated_at < now() - make_interval(secs => $1)');
  });
});

describe('what the sweep writes', () => {
  it('records a turn nobody stopped as a timeout, and one the reader stopped as stopped', async () => {
    const report = await reapStuckCloudCodeTurns(
      db([
        { id: 'a', ageSeconds: 5_000 },
        { id: 'b', ageSeconds: 5_000, cancelRequested: true },
      ]) as never,
    );

    expect(report.reaped).toBe(2);
    expect(report.stoppedByUser).toBe(1);
    expect(queries[0]?.sql).toContain(
      "state = case when cancel_requested_at is null then 'failed' else 'cancelled' end",
    );
    expect(queries[0]?.sql).toContain(
      "stop_reason = case when cancel_requested_at is null then 'timeout' else 'cancelled' end",
    );
  });

  it('keeps an error message the dying turn already managed to write', async () => {
    await reapStuckCloudCodeTurns(db([{ id: 'a', ageSeconds: 5_000 }]) as never);
    expect(queries[0]?.sql).toContain('error_message = coalesce(');
  });

  it('releases only the sessions it reaped, and only when their lease has expired', async () => {
    await reapStuckCloudCodeTurns(db([{ id: 'a', ageSeconds: 5_000 }]) as never);
    const release = queries.find((call) => /update cloud_code_sessions/.test(call.sql));

    expect(release?.sql).toContain("state = 'running'");
    expect(release?.sql).toContain('run_lease_expires_at is null or run_lease_expires_at <= now()');
    expect(release?.params?.[0]).toEqual([SESSION_ID]);
    expect(release?.params?.[1]).toEqual(['user-a']);
  });

  it('never touches a managed usage reservation', async () => {
    await reapStuckCloudCodeTurns(db([{ id: 'a', ageSeconds: 5_000 }]) as never);
    // recover_stale_managed_usage_requests (0056) is the exactly-once owner of
    // that refund, drained by the reconcile-credits cron. A second writer here
    // could double-refund or race its `for update skip locked`.
    expect(queries.some((call) => /managed_usage_requests/.test(call.sql))).toBe(false);
    expect(queries.some((call) => /credit_settlement/.test(call.sql))).toBe(false);
  });
});

describe('the sweep stays inside its own budget', () => {
  it('stops and says work remains when the time ceiling is reached', async () => {
    let nowMs = 0;
    const report = await reapStuckCloudCodeTurns(
      db(
        Array.from({ length: 400 }, (_, index) => ({ id: `t${index}`, ageSeconds: 5_000 })),
      ) as never,
      {
        now: () => {
          nowMs += 200_000;
          return nowMs;
        },
      },
    );

    expect(report.remaining).toBe(true);
  });

  it('stops as soon as a batch comes back short', async () => {
    const report = await reapStuckCloudCodeTurns(db([{ id: 'a', ageSeconds: 5_000 }]) as never);
    expect(report.remaining).toBe(false);
    expect(queries.filter((call) => /update cloud_code_agent_turns/.test(call.sql))).toHaveLength(
      1,
    );
  });
});
