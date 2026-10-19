import { describe, expect, it, vi } from 'vitest';
import { DEVELOPER_REQUEST_LOGS_PAGE_SIZE } from '@agiworkforce/cloud-contracts';
import type { DatabaseAdapter } from '@agiworkforce/data-layer';

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

  it('reads only the caller’s API-key requests and pages by time', async () => {
    const rows = Array.from({ length: DEVELOPER_REQUEST_LOGS_PAGE_SIZE + 1 }, (_, i) => row(i));
    const query = vi.fn(async () => rows);
    const page = await listDeveloperRequestLogs(
      { query } as unknown as DatabaseAdapter,
      'user_1',
      null,
    );
    expect(page.logs).toHaveLength(DEVELOPER_REQUEST_LOGS_PAGE_SIZE);
    expect(page.nextBefore).toBe(page.logs.at(-1)?.createdAt);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('r.user_id = $1');
    expect(sql).toContain('r.api_key_id is not null');
    expect(params[0]).toBe('user_1');
  });
});
