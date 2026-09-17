import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  getRequestIdentity: vi.fn(),
  isProductAnalyticsAllowed: vi.fn(),
  recordProductAnalyticsEvents: vi.fn(),
  resolveActiveOrganizationId: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mocks.requireCsrfToken }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mocks.withRateLimit }));
vi.mock('@/lib/server/identity', () => ({ getRequestIdentity: mocks.getRequestIdentity }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: () => ({}) }));
vi.mock('@/lib/server/product-analytics', () => ({
  isProductAnalyticsAllowed: mocks.isProductAnalyticsAllowed,
  recordProductAnalyticsEvents: mocks.recordProductAnalyticsEvents,
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mocks.resolveActiveOrganizationId,
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NextRequest } from 'next/server';

import { POST } from './route';

const OCCURRED_AT = '2026-09-17T00:00:00.000Z';

function request(body: unknown): NextRequest {
  return new NextRequest('https://agiworkforce.com/api/analytics/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.getRequestIdentity.mockResolvedValue({ subject: 'user_1' });
  mocks.isProductAnalyticsAllowed.mockResolvedValue(true);
  mocks.recordProductAnalyticsEvents.mockResolvedValue(1);
  mocks.resolveActiveOrganizationId.mockResolvedValue(null);
});

describe('POST /api/analytics/events', () => {
  it('refuses a signed-out caller', async () => {
    mocks.getRequestIdentity.mockResolvedValue({ subject: null });

    const response = await POST(request({ events: [] }));

    expect(response.status).toBe(401);
    expect(mocks.recordProductAnalyticsEvents).not.toHaveBeenCalled();
  });

  it('collects nothing when the account has not granted the purpose', async () => {
    mocks.isProductAnalyticsAllowed.mockResolvedValue(false);

    const response = await POST(
      request({ events: [{ name: 'signup', surface: 'cli', occurredAt: OCCURRED_AT }] }),
    );

    await expect(response.json()).resolves.toEqual({ accepted: 0, consent: 'withheld' });
    expect(mocks.recordProductAnalyticsEvents).not.toHaveBeenCalled();
  });

  it('accepts a batch from any surface the contract names', async () => {
    mocks.recordProductAnalyticsEvents.mockResolvedValue(2);

    const response = await POST(
      request({
        events: [
          { name: 'first_chat', surface: 'chrome', occurredAt: OCCURRED_AT },
          { name: 'work_started', surface: 'cli', occurredAt: OCCURRED_AT },
        ],
      }),
    );

    await expect(response.json()).resolves.toEqual({
      accepted: 2,
      rejected: 0,
      consent: 'granted',
    });
    const [, events] = mocks.recordProductAnalyticsEvents.mock.calls[0] as [unknown, unknown[]];
    expect(events).toHaveLength(2);
  });

  it('drops an event the contract refuses instead of storing it', async () => {
    mocks.recordProductAnalyticsEvents.mockResolvedValue(1);

    const response = await POST(
      request({
        events: [
          { name: 'signup', surface: 'web', occurredAt: OCCURRED_AT },
          { name: 'not_an_event', surface: 'web', occurredAt: OCCURRED_AT },
          { name: 'tool_call', surface: 'web', occurredAt: OCCURRED_AT },
        ],
      }),
    );

    await expect(response.json()).resolves.toMatchObject({ rejected: 2 });
  });

  it('rejects a batch larger than the contract allows', async () => {
    const events = Array.from({ length: 200 }, () => ({
      name: 'signup',
      surface: 'web',
      occurredAt: OCCURRED_AT,
    }));

    const response = await POST(request({ events }));

    expect(response.status).toBe(400);
    expect(mocks.recordProductAnalyticsEvents).not.toHaveBeenCalled();
  });
});
