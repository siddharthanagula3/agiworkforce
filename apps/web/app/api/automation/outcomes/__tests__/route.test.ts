import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { mockGetUserScopedDb, mockLogger, mockRecord } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockLogger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  mockRecord: vi.fn((outcomes: unknown[]) => outcomes.length),
}));

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: (...a: unknown[]) => mockGetUserScopedDb(...a),
}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

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
  mockGetUserScopedDb.mockResolvedValue({ userId: 'user-1', organizationId: null });
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
