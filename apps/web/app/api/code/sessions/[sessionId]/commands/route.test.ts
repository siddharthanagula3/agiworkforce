import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockRateLimit,
  mockCsrf,
  mockE2bReady,
  mockBetaEnabled,
  mockRunCommand,
  mockGetSubscription,
  mockEvaluateAccess,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockRateLimit: vi.fn(),
  mockCsrf: vi.fn(),
  mockE2bReady: vi.fn(),
  mockBetaEnabled: vi.fn(),
  mockRunCommand: vi.fn(),
  mockGetSubscription: vi.fn(),
  mockEvaluateAccess: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/e2b/gate', () => ({
  e2bProvisioningReady: mockE2bReady,
  E2B_API_KEY_ENV: 'E2B_API_KEY',
  e2bExecutionEnabled: vi.fn(),
}));
vi.mock('@/lib/managed-compute-gate', () => ({
  isManagedComputePrivateBetaEnabled: mockBetaEnabled,
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: mockGetSubscription },
}));
vi.mock('@/lib/services/managed-compute-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/managed-compute-access')>();
  return { ...actual, evaluateManagedComputeAccess: mockEvaluateAccess };
});
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, runCloudCodeCommand: mockRunCommand };
});

import {
  CloudCodeConflictError,
  CloudCodeNotFoundError,
  CloudCodeValidationError,
} from '@/lib/services/cloud-code-session-service';
import { POST } from './route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };

function commandRequest(body: unknown = { command: 'ls' }): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/commands`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockCsrf.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockBetaEnabled.mockReturnValue(true);
  mockGetSubscription.mockResolvedValue({ plan_tier: 'pro', status: 'active' });
  mockEvaluateAccess.mockResolvedValue({ allowed: true });
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockRunCommand.mockResolvedValue({
    session: { id: SESSION_ID, state: 'ready' },
    terminalEntry: { id: '1', command: 'ls', stdout: 'README.md\n', stderr: '', exitCode: 0 },
  });
});

describe('POST /api/code/sessions/[sessionId]/commands', () => {
  it('runs the command and answers with the terminal entry it produced', async () => {
    const response = await POST(commandRequest(), context);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      terminalEntry: { command: 'ls', exitCode: 0 },
    });
    expect(mockRunCommand).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'ls',
      'pro',
      expect.anything(),
    );
  });

  it('refuses when managed Code is not enabled for this deployment', async () => {
    mockE2bReady.mockReturnValue(false);
    const response = await POST(commandRequest(), context);
    expect(response.status).toBe(503);
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('refuses while managed compute is switched off', async () => {
    mockBetaEnabled.mockReturnValue(false);
    const response = await POST(commandRequest(), context);
    expect(response.status).toBe(503);
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('refuses when the plan does not reach managed compute, in the gate own words', async () => {
    mockEvaluateAccess.mockResolvedValue({
      allowed: false,
      reason: 'Your plan does not include managed compute.',
      code: 'managed_compute_not_entitled',
    });
    const response = await POST(commandRequest(), context);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'managed_compute_not_entitled' },
    });
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('refuses without a csrf token', async () => {
    mockCsrf.mockResolvedValue(new Response(null, { status: 403 }));
    const response = await POST(commandRequest(), context);
    expect(response.status).toBe(403);
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('refuses a body that is not an object', async () => {
    const response = await POST(commandRequest(['ls']), context);
    expect(response.status).toBe(400);
    expect(mockRunCommand).not.toHaveBeenCalled();
  });

  it('passes an archived refusal through as a 409 that names unarchive', async () => {
    mockRunCommand.mockRejectedValue(
      new CloudCodeConflictError(
        'This Code session is archived. Unarchive it to run commands in this session.',
      ),
    );
    const response = await POST(commandRequest(), context);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: expect.stringMatching(/unarchive/i) },
    });
  });

  it('passes a closed refusal through as a 409', async () => {
    mockRunCommand.mockRejectedValue(
      new CloudCodeConflictError('Closed Code sessions cannot run commands'),
    );
    const response = await POST(commandRequest(), context);
    expect(response.status).toBe(409);
  });

  it('answers 404 for a session this account does not own', async () => {
    mockRunCommand.mockRejectedValue(new CloudCodeNotFoundError());
    const response = await POST(commandRequest(), context);
    expect(response.status).toBe(404);
  });

  it('passes an empty command through as a validation refusal', async () => {
    mockRunCommand.mockRejectedValue(new CloudCodeValidationError('Command must be 1-2000'));
    const response = await POST(commandRequest({ command: '  ' }), context);
    expect(response.status).toBe(400);
  });
});
