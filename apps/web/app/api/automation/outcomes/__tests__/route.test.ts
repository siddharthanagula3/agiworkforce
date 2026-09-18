import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetUserScopedDb, mockLogger, mockRecord, mockQuery, mockAudit } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockRecord: vi.fn((outcomes: unknown[]) => outcomes.length),
  mockQuery: vi.fn(async () => []),
  mockAudit: vi.fn(async () => undefined),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...a: unknown[]) => mockGetUserScopedDb(...a),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mockAudit }));

vi.mock('@/lib/observability/automation-telemetry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/observability/automation-telemetry')>(
    '@/lib/observability/automation-telemetry',
  );
  return { ...actual, recordAutomationOutcomes: mockRecord };
});

import { POST } from '../route';

function report(overrides: Record<string, unknown> = {}) {
  return {
    runId: 'run_1',
    action: 'browser.click',
    surface: 'extension',
    deviceId: 'device_1',
    sessionKind: 'user-chrome',
    startedAtMs: 1_000,
    settledAtMs: 1_400,
    claim: 'succeeded',
    verification: { check: 'the cart shows one item', passed: true },
    ...overrides,
  };
}

function post(body: unknown) {
  return new Request('http://localhost:3000/api/automation/outcomes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRecord.mockImplementation((outcomes: unknown[]) => outcomes.length);
  mockQuery.mockResolvedValue([]);
  mockGetUserScopedDb.mockResolvedValue({
    db: { query: mockQuery },
    userId: 'user-1',
    organizationId: null,
  });
});

describe('automation outcome ingest', () => {
  it('records a verified success and reports the rate', async () => {
    const response = await POST(post({ outcomes: [report()] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      accepted: 1,
      summary: { succeeded: 1, failed: 0, successRate: 1 },
    });
  });

  it('refuses to call a success a success when no check was reported', async () => {
    const response = await POST(post({ outcomes: [report({ verification: undefined })] }));

    await expect(response.json()).resolves.toMatchObject({
      summary: { succeeded: 0, failed: 1, unverified: 1, successRate: 0 },
    });
  });

  it('refuses to call a success a success when the check failed', async () => {
    const response = await POST(
      post({ outcomes: [report({ verification: { check: 'cart is empty', passed: false } })] }),
    );

    await expect(response.json()).resolves.toMatchObject({ summary: { failed: 1 } });
  });

  it('keeps a refusal out of the success rate', async () => {
    const response = await POST(
      post({
        outcomes: [
          report(),
          report({ claim: 'refused', reason: 'site not approved', verification: undefined }),
        ],
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      summary: { succeeded: 1, refused: 1, successRate: 1 },
    });
  });

  it('logs one diagnostics line per run and never the page content', async () => {
    await POST(
      post({
        outcomes: [
          report(),
          report({ runId: 'run_2', claim: 'failed', reason: 'timeout', verification: undefined }),
        ],
      }),
    );

    const diagnostics = mockLogger.info.mock.calls.filter(
      (call) => call[1] === 'Automation run outcomes recorded',
    );
    expect(diagnostics).toHaveLength(2);
    const logged = JSON.stringify(diagnostics);
    expect(logged).toContain('run_2');
    expect(logged).toContain('successRate');
  });

  it('rejects an oversized or malformed batch', async () => {
    expect((await POST(post({ outcomes: [] }))).status).toBe(400);
    expect((await POST(post({ outcomes: [report({ surface: 'toaster' })] }))).status).toBe(400);
    expect(
      (await POST(post({ outcomes: Array.from({ length: 201 }, () => report()) }))).status,
    ).toBe(400);
  });

  it('caps the free text a client can attach to a receipt', async () => {
    const response = await POST(
      post({
        outcomes: [report({ claim: 'failed', reason: 'x'.repeat(1_000), verification: undefined })],
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe('automation receipts and the audit stream', () => {
  function receiptRows(): Record<string, unknown>[] {
    const call = mockQuery.mock.calls.at(-1) as unknown as [string, unknown[]];
    return JSON.parse(call[1][2] as string) as Record<string, unknown>[];
  }

  it('writes one durable receipt per action, scoped to the caller', async () => {
    await POST(post({ outcomes: [report({ target: 'https://shop.example/cart?token=abc' })] }));

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('insert into automation_audit_events');
    expect(params[0]).toBe('user-1');
    expect(params[1]).toBeNull();

    expect(receiptRows()).toEqual([
      expect.objectContaining({
        run_id: 'run_1',
        device_id: 'device_1',
        surface: 'extension',
        action: 'browser.click',
        session_kind: 'user-chrome',
        status: 'succeeded',
        verified: true,
        verification_check: 'the cart shows one item',
        verification_passed: true,
        duration_ms: 400,
      }),
    ]);
  });

  /** A receipt records where the run went, never what was on the page. */
  it('keeps the path and query out of the recorded target', async () => {
    await POST(post({ outcomes: [report({ target: 'https://shop.example/cart?token=abc' })] }));
    expect(receiptRows()[0]?.['target']).toBe('https://shop.example');

    await POST(post({ outcomes: [report({ target: 'com.example.notes' })] }));
    expect(receiptRows()[0]?.['target']).toBe('com.example.notes');
  });

  it('records an unverified success as failed in the trail as well as in the summary', async () => {
    await POST(post({ outcomes: [report({ verification: undefined })] }));

    expect(receiptRows()[0]).toMatchObject({
      status: 'failed',
      verified: false,
      verification_passed: false,
    });
  });

  it('refuses the batch when the trail cannot be written', async () => {
    mockQuery.mockRejectedValueOnce(new Error('relation does not exist'));

    expect((await POST(post({ outcomes: [report()] }))).status).toBe(500);
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  /** L73624: the SIEM stream gets one event per run, not one per pointer move. */
  it('streams one audit event per run into the enterprise pipeline', async () => {
    mockGetUserScopedDb.mockResolvedValue({
      db: { query: mockQuery },
      userId: 'user-1',
      organizationId: 'f1f2f3f4-1111-4222-8333-444455556666',
    });

    await POST(
      post({
        outcomes: [
          report(),
          report(),
          report({ runId: 'run_2', claim: 'failed', reason: 'timeout', verification: undefined }),
        ],
      }),
    );

    expect(mockAudit).toHaveBeenCalledTimes(2);
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'browser_action',
        organizationId: 'f1f2f3f4-1111-4222-8333-444455556666',
        outcome: 'success',
        detail: expect.objectContaining({ resourceType: 'automation_run', resourceId: 'run_1' }),
      }),
    );
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failure',
        severity: 'warning',
        detail: expect.objectContaining({ resourceId: 'run_2', reason: 'timeout' }),
      }),
    );
  });

  it('names a desktop run as computer use and a refusal as denied', async () => {
    await POST(
      post({
        outcomes: [
          report({
            surface: 'desktop',
            runId: 'run_3',
            claim: 'refused',
            reason: 'the kill switch is engaged',
            verification: undefined,
          }),
        ],
      }),
    );

    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'computer_use_action', outcome: 'denied' }),
    );
  });
});
