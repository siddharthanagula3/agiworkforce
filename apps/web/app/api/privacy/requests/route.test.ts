import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  createDataRightsRequest: vi.fn(),
  sendSupportEmail: vi.fn(),
  loggerError: vi.fn(),
}));

vi.hoisted(() => {
  process.env['AGI_SUPPORT_FALLBACK_EMAIL'] = 'privacy-ops@agiworkforce.com';
  process.env['AGI_SUPPORT_FROM_EMAIL'] = 'support@agiworkforce.com';
  process.env['RESEND_API_KEY'] = 'test-resend-key';
  process.env['ALLOWED_ORIGINS'] = 'https://agiworkforce.com';
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(async () => ({ userId: null })) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.loggerError, debug: vi.fn() },
}));
vi.mock('@/lib/support/handoff/resend-client', () => ({
  sendSupportEmail: mocks.sendSupportEmail,
}));
vi.mock('@/lib/server/data-rights-requests', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/data-rights-requests')>()),
  createDataRightsRequest: mocks.createDataRightsRequest,
}));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('https://agiworkforce.com/api/privacy/requests', {
    method: 'POST',
    headers: { Origin: 'https://agiworkforce.com', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const payload = {
  requestType: 'erasure',
  contactEmail: 'Requester@Example.com',
  details: 'Delete everything you hold about me.',
};

describe('POST /api/privacy/requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createDataRightsRequest.mockResolvedValue({
      reference: 'DPDP-ABC1234567',
      requestType: 'erasure',
      status: 'received',
      createdAt: '2026-08-15T10:00:00.000Z',
      resolvedAt: null,
    });
    mocks.sendSupportEmail.mockResolvedValue({ delivered: true, providerMessageId: 'msg_1' });
  });

  it('notifies the operator mailbox when a rights request is recorded', async () => {
    const response = await POST(request(payload));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reference: 'DPDP-ABC1234567',
      operatorNotified: true,
    });

    expect(mocks.sendSupportEmail).toHaveBeenCalledTimes(1);
    const sent = mocks.sendSupportEmail.mock.calls[0]?.[0];
    expect(sent.to).toBe('privacy-ops@agiworkforce.com');
    expect(sent.subject).toContain('DPDP-ABC1234567');
    expect(sent.replyTo).toBe('requester@example.com');
    expect(sent.idempotencyKey).toBe('data-rights-request:DPDP-ABC1234567');
    expect(sent.text).toContain('Delete everything you hold about me.');
    expect(sent.text).toContain('requester@example.com');
  });

  it('still returns the reference but records the failure when the alert cannot be delivered', async () => {
    mocks.sendSupportEmail.mockResolvedValue({
      delivered: false,
      reason: 'not_configured',
      detail: 'RESEND_API_KEY missing',
    });

    const response = await POST(request(payload));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reference: 'DPDP-ABC1234567',
      operatorNotified: false,
    });
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'data_rights_request_alert_undeliverable' }),
      expect.any(String),
    );
  });

  it('does not lose a recorded request when the alert throws', async () => {
    mocks.sendSupportEmail.mockRejectedValue(new Error('resend exploded'));

    const response = await POST(request(payload));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ operatorNotified: false });
  });

  it('never alerts when nothing was recorded', async () => {
    mocks.createDataRightsRequest.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(request(payload));

    expect(response.status).toBe(500);
    expect(mocks.sendSupportEmail).not.toHaveBeenCalled();
  });
});
