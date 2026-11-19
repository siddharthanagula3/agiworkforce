import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

type SecurityAuditModule = typeof import('@/lib/security-audit');
type OrganizationPolicyGateModule = typeof import('@/lib/services/organization-policy-gate');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  getSchedule: vi.fn(),
  resolveSecretHandlingPolicy: vi.fn(),
  saveScheduleShare: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock('@/lib/managed-compute-gate', () => ({
  buildExternalSharingGateResponse: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mocks.getUserScopedDb }));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<OrganizationPolicyGateModule>()),
  resolveSecretHandlingPolicy: mocks.resolveSecretHandlingPolicy,
}));
vi.mock('@/lib/services/schedule-service', () => ({
  getSchedule: mocks.getSchedule,
  ScheduleNotFoundError: class ScheduleNotFoundError extends Error {},
}));
vi.mock('@/lib/services/schedule-share-service', () => ({
  saveScheduleShare: mocks.saveScheduleShare,
  scheduleShareSnapshot: (task: { name: string; prompt: string }) => ({
    name: task.name,
    prompt: task.prompt,
  }),
  unshareSchedule: vi.fn(),
}));

import { POST } from '../route';

const SECRET = `sk_live_${'b'.repeat(30)}`;
const db = { query: vi.fn() };

describe('POST /api/schedules/[id]/share secret handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
    mocks.getSchedule.mockResolvedValue({
      id: 'task-1',
      name: 'Weekly digest',
      prompt: `Deploy with ${SECRET} every Monday`,
    });
    mocks.resolveSecretHandlingPolicy.mockResolvedValue({ mode: 'warn', organizationId: null });
    mocks.saveScheduleShare.mockResolvedValue({ token: 'tok-1' });
    mocks.recordAuditEvent.mockResolvedValue(undefined);
    db.query.mockResolvedValue([{ organization_id: null }]);
  });

  it('stores a redacted snapshot when a personal policy only warns', async () => {
    const request = new NextRequest('http://localhost/api/schedules/task-1/share', {
      method: 'POST',
    });

    const response = await POST(request, { params: Promise.resolve({ id: 'task-1' }) });

    expect(response.status).toBe(200);
    const stored = mocks.saveScheduleShare.mock.calls[0]?.[3];
    expect(JSON.stringify(stored)).not.toContain(SECRET);
    expect(stored.prompt).toBe('Deploy with [REDACTED] every Monday');
  });
});
