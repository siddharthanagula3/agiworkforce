import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { AUTO_RELOAD_CONSENT_VERSION, type AutoReloadSettings } from '@agiworkforce/types';
type ScanModule0 = typeof import('@/lib/server/rls-db');
type ScanModule1 = typeof import('@/lib/csrf');
type ScanModule2 = typeof import('@/lib/rate-limit');
type ScanModule3 = typeof import('@/lib/security-audit');
type ScanModule4 = typeof import('@/lib/services/auto-reload-service');

const mocks = vi.hoisted(() => ({
  getUserScopedDb: vi.fn(),
  requireCsrfToken: vi.fn(),
  withRateLimit: vi.fn(),
  recordAuditEvent: vi.fn(),
  readAutoReloadSettings: vi.fn(),
  saveAutoReloadSettings: vi.fn(),
  maybeTriggerAutoReload: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getUserScopedDb: mocks.getUserScopedDb,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  requireCsrfToken: mocks.requireCsrfToken,
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  withRateLimit: mocks.withRateLimit,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  recordAuditEvent: mocks.recordAuditEvent,
}));
vi.mock('@/lib/services/auto-reload-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  readAutoReloadSettings: mocks.readAutoReloadSettings,
  saveAutoReloadSettings: mocks.saveAutoReloadSettings,
  maybeTriggerAutoReload: mocks.maybeTriggerAutoReload,
}));

import { GET, PUT } from './route';
import { createError } from '@/lib/errors';

const USER_ID = 'user_reload';
const DB = { query: vi.fn(), execute: vi.fn() };

const SETTINGS: AutoReloadSettings = {
  enabled: true,
  thresholdCredits: 500,
  amountUsd: 50,
  paymentMethod: { brand: 'visa', last4: '4242' },
  lastFailure: null,
  consent: { version: AUTO_RELOAD_CONSENT_VERSION, acceptedAt: '2026-09-27T10:00:00.000Z' },
};

function request(method: 'GET' | 'PUT', body?: unknown) {
  return new NextRequest('https://agiworkforce.com/api/billing/auto-reload', {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUserScopedDb.mockResolvedValue({ db: DB, userId: USER_ID, organizationId: null });
  mocks.requireCsrfToken.mockResolvedValue(null);
  mocks.withRateLimit.mockResolvedValue(null);
  mocks.recordAuditEvent.mockResolvedValue(undefined);
  mocks.readAutoReloadSettings.mockResolvedValue(SETTINGS);
  mocks.saveAutoReloadSettings.mockResolvedValue({ status: 'saved', settings: SETTINGS });
});

describe('GET /api/billing/auto-reload', () => {
  it('returns the caller settings read through the caller-scoped connection', async () => {
    const response = await GET(request('GET'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SETTINGS);
    expect(mocks.getUserScopedDb).toHaveBeenCalledWith(expect.anything(), {
      resolveOrganization: false,
    });
    expect(mocks.readAutoReloadSettings).toHaveBeenCalledWith(DB, USER_ID);
  });

  it('refuses a caller with no session', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await GET(request('GET'));

    expect(response.status).toBe(401);
    expect(mocks.readAutoReloadSettings).not.toHaveBeenCalled();
  });

  it('answers with the rate limiter when the caller is over it', async () => {
    mocks.withRateLimit.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    );

    const response = await GET(request('GET'));

    expect(response.status).toBe(429);
    expect(mocks.readAutoReloadSettings).not.toHaveBeenCalled();
  });
});

describe('PUT /api/billing/auto-reload', () => {
  const enable = {
    enabled: true,
    thresholdCredits: 500,
    amountUsd: 50,
    consentVersion: AUTO_RELOAD_CONSENT_VERSION,
  };

  it('saves the settings, audits the consent and checks the balance straight away', async () => {
    const response = await PUT(request('PUT', enable));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(SETTINGS);
    expect(mocks.saveAutoReloadSettings).toHaveBeenCalledWith(DB, USER_ID, enable);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        eventType: 'auto_reload_changed',
        detail: expect.objectContaining({
          resourceType: 'auto_reload',
          enabled: true,
          amountUsd: 50,
          thresholdCredits: 500,
          version: AUTO_RELOAD_CONSENT_VERSION,
        }),
      }),
    );
    expect(mocks.maybeTriggerAutoReload).toHaveBeenCalledWith(USER_ID);
  });

  it('turns auto-reload off without starting a charge', async () => {
    const off = { enabled: false, thresholdCredits: 500, amountUsd: 50 };
    mocks.saveAutoReloadSettings.mockResolvedValueOnce({
      status: 'saved',
      settings: { ...SETTINGS, enabled: false },
    });

    const response = await PUT(request('PUT', off));

    expect(response.status).toBe(200);
    expect(mocks.saveAutoReloadSettings).toHaveBeenCalledWith(DB, USER_ID, off);
    expect(mocks.recordAuditEvent.mock.calls[0]?.[0].detail).not.toHaveProperty('version');
    expect(mocks.maybeTriggerAutoReload).not.toHaveBeenCalled();
  });

  it.each([
    ['a threshold under 100 credits', { thresholdCredits: 99 }],
    ['a threshold over 100,000 credits', { thresholdCredits: 100_001 }],
    ['a fractional threshold', { thresholdCredits: 500.5 }],
    ['an amount under $20', { amountUsd: 19 }],
    ['an amount over $1,000', { amountUsd: 1_001 }],
    ['a fractional amount', { amountUsd: 25.5 }],
    ['an enabled flag that is not a boolean', { enabled: 'yes' }],
    ['a consent version that is not a string', { consentVersion: 7 }],
  ])('rejects %s before saving anything', async (_label, override) => {
    const response = await PUT(request('PUT', { ...enable, ...override }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    expect(mocks.saveAutoReloadSettings).not.toHaveBeenCalled();
  });

  it('rejects a body that is not JSON', async () => {
    const response = await PUT(
      new NextRequest('https://agiworkforce.com/api/billing/auto-reload', {
        method: 'PUT',
        body: 'enabled=true',
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.saveAutoReloadSettings).not.toHaveBeenCalled();
  });

  it('answers 409 payment_method_required when no card is on file', async () => {
    mocks.saveAutoReloadSettings.mockResolvedValueOnce({ status: 'payment_method_required' });

    const response = await PUT(request('PUT', enable));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'payment_method_required' },
    });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
    expect(mocks.maybeTriggerAutoReload).not.toHaveBeenCalled();
  });

  it('answers 409 consent_outdated when the terms changed since the page loaded', async () => {
    mocks.saveAutoReloadSettings.mockResolvedValueOnce({ status: 'consent_outdated' });

    const response = await PUT(request('PUT', { ...enable, consentVersion: '2025-01-01' }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'consent_outdated' } });
    expect(mocks.maybeTriggerAutoReload).not.toHaveBeenCalled();
  });

  it('refuses a write that fails the CSRF check', async () => {
    mocks.requireCsrfToken.mockResolvedValueOnce(
      NextResponse.json({ error: { code: 'CSRF_REQUIRED' } }, { status: 403 }),
    );

    const response = await PUT(request('PUT', enable));

    expect(response.status).toBe(403);
    expect(mocks.saveAutoReloadSettings).not.toHaveBeenCalled();
  });

  it('refuses a caller with no session', async () => {
    mocks.getUserScopedDb.mockRejectedValueOnce(createError.unauthorized());

    const response = await PUT(request('PUT', enable));

    expect(response.status).toBe(401);
    expect(mocks.saveAutoReloadSettings).not.toHaveBeenCalled();
  });

  it('maps an unexpected storage failure to a generic 500', async () => {
    mocks.saveAutoReloadSettings.mockRejectedValueOnce(new Error('connection reset by peer'));

    const response = await PUT(request('PUT', enable));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('connection reset');
    expect(mocks.maybeTriggerAutoReload).not.toHaveBeenCalled();
  });
});
