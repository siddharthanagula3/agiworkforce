import { describe, expect, it, vi } from 'vitest';
import { DEVELOPER_REQUEST_LOGS_PAGE_SIZE } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

import { decodeKeysetCursor, encodeKeysetCursor } from '@/lib/identity/pagination';
import { listDeveloperRequestLogs, toDeveloperRequestLog } from '../developer-request-log-service';

function row(index: number) {
  return {
    id: `0190a000-0000-7000-8000-${String(index).padStart(12, '0')}`,
    created_at: new Date(Date.UTC(2026, 9, 19, 10, 0, 0) - index * 1000),
    status: 'completed',
    model: 'auto',
    final_error_code: null,
    actual_cost_microusd: '25000',
    usage: {
      inputTokens: 10,
      outputTokens: 4,
      servedModel: 'served',
      hostedCodeExecution: { requests: 2 },
    },
    provider_started_at: null,
    provider_succeeded_at: null,
    client_delivered_at: null,
    finalized_at: null,
    key_name: 'CI key',
    key_prefix: 'sk_live_ab',
    page_sort_key: new Date(Date.UTC(2026, 9, 19, 10, 0, 0) - index * 1000)
      .toISOString()
      .replace(/\.(\d{3})Z$/, '.$1000Z'),
  };
}

describe('developer request logs', () => {
  it('maps usage, served model, code runs and only the steps that happened', () => {
    const mapped = toDeveloperRequestLog({
      ...row(1),
      provider_started_at: '2026-10-19T10:00:00.100Z',
    });
    expect(mapped).toMatchObject({
      servedModel: 'served',
      inputTokens: 10,
      outputTokens: 4,
      codeExecutionRuns: 2,
      webSearchRequests: null,
      apiKeyName: 'CI key',
    });
    expect(mapped.steps.map((step) => step.name)).toEqual(['received', 'provider_started']);
  });

  it('records a billed milestone only for completed requests', () => {
    const finalized = {
      ...row(1),
      actual_cost_microusd: '0',
      finalized_at: '2026-10-19T10:00:01.300Z',
    };
    const stepNames = (status: string) =>
      toDeveloperRequestLog({ ...finalized, status }).steps.map((step) => step.name);

    expect(stepNames('completed')).toContain('settled');
    expect(stepNames('released')).not.toContain('settled');
    expect(stepNames('declined')).not.toContain('settled');
    expect(stepNames('outcome_unknown')).not.toContain('settled');
  });

  it('reads only the caller’s API-key requests and pages by time', async () => {
    const rows = Array.from({ length: DEVELOPER_REQUEST_LOGS_PAGE_SIZE + 1 }, (_, i) => row(i));
    const query = vi.fn(async () => rows);
    const page = await listDeveloperRequestLogs(
      { query } as unknown as DatabaseAdapter,
      'user_1',
      null,
    );
    expect(page.logs).toHaveLength(DEVELOPER_REQUEST_LOGS_PAGE_SIZE);
    const last = rows[DEVELOPER_REQUEST_LOGS_PAGE_SIZE - 1]!;
    expect(decodeKeysetCursor(page.nextBefore)).toEqual({
      sortValue: last.page_sort_key,
      id: last.id,
    });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('r.user_id = $1');
    expect(sql).toContain('r.api_key_id is not null');
    expect(params[0]).toBe('user_1');
    expect(sql).toContain('order by created_at desc, id desc');
  });

  it('continues after the cursor row, not after its timestamp, so tied rows are not skipped', async () => {
    const query = vi.fn(async () => []);
    const sortValue = '2026-10-19T10:00:00.123456Z';
    const id = '0190a000-0000-7000-8000-000000000004';
    const before = encodeKeysetCursor({ sortValue, id });
    await listDeveloperRequestLogs({ query } as unknown as DatabaseAdapter, 'user_1', before);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('(created_at, id) < ($2, $3)');
    expect(params).toEqual(['user_1', sortValue, id, DEVELOPER_REQUEST_LOGS_PAGE_SIZE + 1]);
  });

  it('re-reads the whole millisecond for an old timestamp-only cursor', async () => {
    const query = vi.fn(async () => []);
    await listDeveloperRequestLogs(
      { query } as unknown as DatabaseAdapter,
      'user_1',
      '2026-10-19T10:00:00.123Z',
    );
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("created_at < $2::timestamptz + interval '1 millisecond'");
    expect(params).toEqual([
      'user_1',
      '2026-10-19T10:00:00.123Z',
      DEVELOPER_REQUEST_LOGS_PAGE_SIZE + 1,
    ]);
  });
});
