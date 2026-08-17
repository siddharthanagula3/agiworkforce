import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const recordSettledProviderCostMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/cogs-ledger-service', () => ({
  recordSettledProviderCost: (...args: unknown[]) => recordSettledProviderCostMock(...args),
}));

import {
  claimVideoIncidentAlert,
  claimVideoSettlementIncidentByReservation,
  completeVideoIncidentAlert,
  completeVideoSettlementIncident,
  createVideoGenerationJob,
  countExhaustedVideoIncidentAlerts,
  listPendingVideoIncidentAlertIds,
  listPendingVideoSettlementIncidentIds,
  finalizeVideoGenerationJob,
  nudgeVideoGenerationJobFromProviderEvent,
} from './video-generation-jobs';

function input(db: never, overrides: Partial<Parameters<typeof createVideoGenerationJob>[0]> = {}) {
  return {
    db,
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-1',
    organizationId: null,
    idempotencyKey: 'agi.media.web.video.operation-123',
    requestHash: 'a'.repeat(64),
    billingLeaseToken: 'lease-video',
    provider: 'google' as const,
    model: 'catalog-video-model',
    prompt: 'a sunset',
    durationSecs: 4,
    resolution: '720p' as const,
    aspectRatio: '16:9' as const,
    generateAudio: true,
    sourceSurface: 'web' as const,
    estimatedCostCents: 20,
    estimatedDurationSecs: 150,
    admissionToken: 'admission-token-123',
    workflowRunId: 'wrun-video-1',
    ...overrides,
  };
}

describe('durable video job persistence boundary', () => {
  it('locks the profile and rejects generation once account erasure is fenced', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const db = {
      transaction: (fn: (tx: unknown) => unknown) => fn({ query }),
    } as never;

    await expect(createVideoGenerationJob(input(db))).rejects.toThrow('account erasure is pending');
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/for update/i), [
      'user-1',
      'admission-token-123',
    ]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('holds the same profile-row lock through the job INSERT', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'user-1',
          deletion_requested_at: null,
          deletion_scheduled_for: null,
        },
      ])
      .mockRejectedValueOnce(new Error('insert reached under transaction'));
    const transaction = vi.fn(async (fn: (tx: unknown) => unknown) => fn({ query }));
    const db = { transaction } as never;

    await expect(createVideoGenerationJob(input(db))).rejects.toThrow(
      'insert reached under transaction',
    );
    expect(transaction).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0])).toMatch(/for update/i);
    expect(String(query.mock.calls[0]?.[0])).toMatch(
      /video_generation_erasure_fence_token is null[\s\S]*video_generation_erasure_fence_expires_at <= now\(\)/i,
    );
    expect(String(query.mock.calls[1]?.[0])).toMatch(/insert into public\.video_generation_jobs/i);
  });

  it('denies a cross-tenant chat placeholder before the durable job insert', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ id: 'user-1' }])
      .mockResolvedValueOnce([]);
    const db = {
      transaction: (fn: (tx: unknown) => unknown) => fn({ query }),
    } as never;

    await expect(
      createVideoGenerationJob(
        input(db, {
          conversationId: '22222222-2222-4222-8222-222222222222',
          assistantMessageId: '33333333-3333-4333-8333-333333333333',
        }),
      ),
    ).rejects.toThrow(/missing or belongs to another account/i);

    expect(String(query.mock.calls[1]?.[0])).toMatch(/conversation\.user_id = \$2/i);
    expect(query.mock.calls[1]?.[1]).toEqual([
      '22222222-2222-4222-8222-222222222222',
      'user-1',
      '33333333-3333-4333-8333-333333333333',
    ]);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('deduplicates signed provider events while only nudging active reconciliation', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ disposition: 'nudged' }]);
    const db = { query } as never;

    await expect(
      nudgeVideoGenerationJobFromProviderEvent({
        db,
        provider: 'openrouter',
        providerTaskId: 'synthetic-provider-task',
        eventKey: 'synthetic-provider-task-completed',
      }),
    ).resolves.toBe('nudged');
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toMatch(/last_provider_event_key is distinct from \$3/i);
    expect(sql).toMatch(/status in \('submitting', 'queued', 'processing'\)/i);
    expect(sql).not.toMatch(/finalize|media_assets|actual_cost/i);
  });

  it('claims and completes a billing incident alert under one exact lease token', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const db = { query } as never;

    await claimVideoIncidentAlert({
      db,
      jobId: '11111111-1111-4111-8111-111111111111',
      claimToken: 'claim-token-123',
    });
    expect(String(query.mock.calls[0]?.[0])).toMatch(
      /incident_alert_claim_expires_at is null[\s\S]*incident_alert_claim_expires_at <= now\(\)/i,
    );

    await completeVideoIncidentAlert({
      db,
      jobId: '11111111-1111-4111-8111-111111111111',
      claimToken: 'claim-token-123',
      delivered: true,
    });
    expect(String(query.mock.calls[1]?.[0])).toMatch(
      /incident_alert_claim_token = \$2[\s\S]*incident_alert_claim_expires_at > now\(\)/i,
    );
  });

  it('treats a pre-0105 deployment as an empty incident-alert queue', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ provisioned: false }]);

    await expect(listPendingVideoIncidentAlertIds({ query } as never)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('keeps exhausted alerts out of the delivery limit and orders fresh pending work first', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ provisioned: true }])
      .mockResolvedValueOnce([{ id: 'fresh-alert' }]);

    await expect(listPendingVideoIncidentAlertIds({ query } as never, 1)).resolves.toEqual([
      'fresh-alert',
    ]);
    const sql = String(query.mock.calls[1]?.[0]);
    expect(sql).toMatch(/incident_alert_status = 'pending'/i);
    expect(sql).not.toMatch(/incident_alert_status in \('pending', 'exhausted'\)/i);
    expect(sql).toMatch(/order by incident_alert_attempts, updated_at/i);
  });

  it('reports exhausted alerts through a separate operator-health count', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([{ provisioned: true }])
      .mockResolvedValueOnce([{ count: '21' }]);

    await expect(countExhaustedVideoIncidentAlerts({ query } as never)).resolves.toBe(21);
    expect(String(query.mock.calls[1]?.[0])).toMatch(/incident_alert_status = 'exhausted'/i);
  });

  it('atomically claims a terminal video settlement only when no durable job owns it', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const db = { query } as never;

    await claimVideoSettlementIncidentByReservation({
      db,
      userId: 'user-1',
      idempotencyKey: 'agi.media.web.video.operation-123',
      claimToken: 'claim-token-123',
    });
    expect(String(query.mock.calls[0]?.[0])).toMatch(
      /metadata #>> '\{usage,operation\}' = 'video'[\s\S]*metadata #>> '\{usage,jobId\}' is null[\s\S]*for update of settlement skip locked/i,
    );

    await completeVideoSettlementIncident({
      db,
      incidentId: '22222222-2222-4222-8222-222222222222',
      claimToken: 'claim-token-123',
      delivered: true,
    });
    expect(String(query.mock.calls[1]?.[0])).toMatch(
      /video_incident_alert_claim_token = \$2[\s\S]*video_incident_alert_claim_expires_at > now\(\)/i,
    );
  });

  it('treats a pre-0105 settlement schema as an empty video-incident queue', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ provisioned: false }]);

    await expect(listPendingVideoSettlementIncidentIds({ query } as never)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('video settlement feeds the COGS ledger', () => {
  it('records the completed video per second of output', async () => {
    recordSettledProviderCostMock.mockClear();
    const db = {
      query: vi.fn().mockResolvedValue([
        {
          id: 'job-1',
          user_id: 'user-1',
          idempotency_key: 'k',
          request_hash: 'h',
          billing_lease_token: 't',
          provider: 'runway',
          model: 'fixture-video-model',
          prompt: 'p',
          duration_secs: 6,
          resolution: '720p',
          source_surface: 'web',
          estimated_cost_cents: 100,
          actual_cost_cents: 90,
          estimated_duration_secs: 60,
          status: 'completed',
          billing_outcome: 'completed',
          reconcile_failures: 0,
          next_attempt_at: '2026-08-01T00:00:00.000Z',
          created_at: '2026-08-01T00:00:00.000Z',
          updated_at: '2026-08-01T00:00:00.000Z',
        },
      ]),
    };

    await finalizeVideoGenerationJob({
      db: db as never,
      jobId: 'job-1',
      claimToken: 'claim',
      outcome: 'completed',
      actualCostCents: 90,
    });

    expect(recordSettledProviderCostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        provider: 'runway',
        model: 'fixture-video-model',
        actualCostCents: 90,
        sourceRef: 'video_job:job-1',
        usage: expect.objectContaining({ operation: 'video', durationSecs: 6 }),
      }),
    );
  });
});
