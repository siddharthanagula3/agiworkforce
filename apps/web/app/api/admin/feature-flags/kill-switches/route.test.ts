import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/logger')>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csrf')>()),
  requireCsrfToken: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  recordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
  ensureFlagDefinition: vi.fn(),
  getFlagDefinition: vi.fn(),
  updateFlagDefinition: vi.fn(),
  setFlagKillSwitch: vi.fn(),
  listFlagDefinitions: vi.fn(async (..._args: unknown[]) => []),
  listLockedDownTenants: vi.fn(async (..._args: unknown[]) => []),
}));

vi.mock('@/lib/auth-guards', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth-guards')>()),
  requirePlatformAdmin: (...args: unknown[]) => mocks.requirePlatformAdmin(...args),
}));

vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security-audit')>()),
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...args),
}));

vi.mock('@/lib/feature-flags/flag-store', () => ({
  ensureFlagDefinition: (...args: unknown[]) => mocks.ensureFlagDefinition(...args),
  getFlagDefinition: (...args: unknown[]) => mocks.getFlagDefinition(...args),
  updateFlagDefinition: (...args: unknown[]) => mocks.updateFlagDefinition(...args),
  setFlagKillSwitch: (...args: unknown[]) => mocks.setFlagKillSwitch(...args),
  listFlagDefinitions: (...args: unknown[]) => mocks.listFlagDefinitions(...args),
  archiveFlagDefinition: vi.fn(),
  deleteFlagOverride: vi.fn(),
  getActiveFlagDefinitions: vi.fn(async () => []),
  getSubjectOverrides: vi.fn(async () => []),
  insertFlagDefinition: vi.fn(),
  listFlagOverrides: vi.fn(),
  resetFlagDefinitionCache: vi.fn(),
  restoreFlagDefinition: vi.fn(),
  upsertFlagOverride: vi.fn(),
}));

vi.mock('@/lib/feature-flags/tenant-lockdown', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/feature-flags/tenant-lockdown')>()),
  listLockedDownTenants: (...args: unknown[]) => mocks.listLockedDownTenants(...args),
}));

import { createError } from '@/lib/errors';
import { DELETE as clearRange, POST as engage } from './route';

const SUBJECT = 'can_use_voice';
const KEY = 'capability.can_use_voice';
const REASON = 'Voice stops responding on this build and a fix is on its way.';

const STORED = {
  key: KEY,
  description: 'Open unless the voice capability is switched off.',
  killSwitch: false,
  variants: ['on', 'off'],
  defaultVariant: 'on',
  rules: [] as unknown[],
  expiresAt: null,
  archivedAt: null,
  version: 1,
  createdAt: '2026-09-20T00:00:00.000Z',
  updatedAt: '2026-09-20T00:00:00.000Z',
};

function request(method: string, body?: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/admin/feature-flags/kill-switches', {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function versionRule(id: string) {
  return { id, conditions: { clientVersion: { max: '3.2' } }, bucketBy: 'user', variant: 'off' };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'operator_1' });
  mocks.ensureFlagDefinition.mockResolvedValue(STORED);
  mocks.updateFlagDefinition.mockImplementation(async (input: unknown) => ({
    ...STORED,
    ...(input as object),
    version: 2,
  }));
});

describe('closing one capability for one range of builds', () => {
  it('writes the range, the surfaces and the sentence the caller will be shown', async () => {
    const response = await engage(
      request('POST', {
        scope: 'capability',
        subject: SUBJECT,
        engaged: true,
        range: { max: '3.2', surfaces: ['ios'], reason: REASON, incident: 'INC-42' },
      }),
    );

    expect(response.status).toBe(200);
    const [written] = mocks.updateFlagDefinition.mock.calls[0] as [
      { key: string; description: string; rules: { id: string; conditions: unknown }[] },
    ];
    expect(written.key).toBe(KEY);
    expect(written.description).toBe(`${REASON} (incident INC-42)`);
    expect(written.rules).toEqual([
      {
        id: 'disabled-inc-42',
        conditions: { clientVersion: { max: '3.2' }, surfaces: ['ios'] },
        bucketBy: 'user',
        variant: 'off',
      },
    ]);
    expect(mocks.setFlagKillSwitch).not.toHaveBeenCalled();
  });

  it('records the incident on the audit trail', async () => {
    await engage(
      request('POST', {
        scope: 'capability',
        subject: SUBJECT,
        engaged: true,
        range: { min: '3.0', max: '3.2', reason: REASON, incident: 'INC-42' },
      }),
    );

    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'operator_1',
        detail: expect.objectContaining({
          resourceId: KEY,
          status: 'disabled_for_versions:INC-42',
        }),
      }),
    );
  });

  it('leaves a second incident on the same switch closed', async () => {
    mocks.ensureFlagDefinition.mockResolvedValue({
      ...STORED,
      rules: [versionRule('disabled-inc-7')],
    });

    await engage(
      request('POST', {
        scope: 'capability',
        subject: SUBJECT,
        engaged: true,
        range: { max: '3.2', reason: REASON, incident: 'INC-42' },
      }),
    );

    const [written] = mocks.updateFlagDefinition.mock.calls[0] as [{ rules: { id: string }[] }];
    expect(written.rules.map((rule) => rule.id)).toEqual(['disabled-inc-7', 'disabled-inc-42']);
  });

  it('refuses a range on anything but a capability', async () => {
    const response = await engage(
      request('POST', {
        scope: 'model',
        subject: 'some-model',
        engaged: true,
        range: { max: '3.2', reason: REASON, incident: 'INC-42' },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateFlagDefinition).not.toHaveBeenCalled();
  });

  it('refuses a range that says it is opening something', async () => {
    const response = await engage(
      request('POST', {
        scope: 'capability',
        subject: SUBJECT,
        engaged: false,
        range: { max: '3.2', reason: REASON, incident: 'INC-42' },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateFlagDefinition).not.toHaveBeenCalled();
  });

  it('refuses a range with no reason to show the person who hits it', async () => {
    const response = await engage(
      request('POST', {
        scope: 'capability',
        subject: SUBJECT,
        engaged: true,
        range: { max: '3.2', reason: 'broken', incident: 'INC-42' },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateFlagDefinition).not.toHaveBeenCalled();
  });

  it('still throws the whole switch when no range is given', async () => {
    mocks.setFlagKillSwitch.mockResolvedValue({ ...STORED, killSwitch: true, version: 2 });

    const response = await engage(
      request('POST', { scope: 'capability', subject: SUBJECT, engaged: true }),
    );

    expect(response.status).toBe(200);
    expect(mocks.setFlagKillSwitch).toHaveBeenCalledWith(KEY, true);
    expect(mocks.updateFlagDefinition).not.toHaveBeenCalled();
  });

  it('answers not found to anyone who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));

    const response = await engage(
      request('POST', {
        scope: 'capability',
        subject: SUBJECT,
        engaged: true,
        range: { max: '3.2', reason: REASON, incident: 'INC-42' },
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.updateFlagDefinition).not.toHaveBeenCalled();
  });
});

describe('lifting one incident off a capability', () => {
  it('removes that incident and leaves every other range closed', async () => {
    mocks.getFlagDefinition.mockResolvedValue({
      ...STORED,
      rules: [versionRule('disabled-inc-7'), versionRule('disabled-inc-42')],
    });

    const response = await clearRange(request('DELETE', { subject: SUBJECT, incident: 'INC-42' }));

    expect(response.status).toBe(200);
    const [written] = mocks.updateFlagDefinition.mock.calls[0] as [{ rules: { id: string }[] }];
    expect(written.rules.map((rule) => rule.id)).toEqual(['disabled-inc-7']);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ status: 'version_disable_cleared:INC-42' }),
      }),
    );
  });

  it('changes nothing when that incident held nothing off', async () => {
    mocks.getFlagDefinition.mockResolvedValue({
      ...STORED,
      rules: [versionRule('disabled-inc-7')],
    });

    const response = await clearRange(request('DELETE', { subject: SUBJECT, incident: 'INC-42' }));

    expect(response.status).toBe(404);
    expect(mocks.updateFlagDefinition).not.toHaveBeenCalled();
  });

  it('refuses a capability the registry does not name', async () => {
    const response = await clearRange(
      request('DELETE', { subject: 'can_do_anything', incident: 'INC-42' }),
    );

    expect(response.status).toBe(400);
    expect(mocks.getFlagDefinition).not.toHaveBeenCalled();
  });
});
