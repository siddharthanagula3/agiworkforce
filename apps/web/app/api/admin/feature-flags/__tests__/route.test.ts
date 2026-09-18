import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn(async () => null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn(async () => null),
}));

const mocks = vi.hoisted(() => ({
  requirePlatformAdmin: vi.fn(),
  recordAuditEvent: vi.fn(async (..._args: unknown[]) => undefined),
  listFlagDefinitions: vi.fn(),
  getFlagDefinition: vi.fn(),
  insertFlagDefinition: vi.fn(),
  updateFlagDefinition: vi.fn(),
  setFlagKillSwitch: vi.fn(),
  archiveFlagDefinition: vi.fn(),
  listFlagOverrides: vi.fn(),
  upsertFlagOverride: vi.fn(),
  deleteFlagOverride: vi.fn(),
}));

vi.mock('@/lib/auth-guards', () => ({
  requirePlatformAdmin: (...args: unknown[]) => mocks.requirePlatformAdmin(...args),
}));

vi.mock('@/lib/security-audit', () => ({
  BLOCK_APPEAL_PATH: '/support',
  logRateLimitExceeded: vi.fn(async () => undefined),
  recordAuditEvent: (...args: unknown[]) => mocks.recordAuditEvent(...args),
}));

vi.mock('@/lib/feature-flags/flag-store', () => ({
  listFlagDefinitions: (...args: unknown[]) => mocks.listFlagDefinitions(...args),
  getFlagDefinition: (...args: unknown[]) => mocks.getFlagDefinition(...args),
  insertFlagDefinition: (...args: unknown[]) => mocks.insertFlagDefinition(...args),
  updateFlagDefinition: (...args: unknown[]) => mocks.updateFlagDefinition(...args),
  setFlagKillSwitch: (...args: unknown[]) => mocks.setFlagKillSwitch(...args),
  archiveFlagDefinition: (...args: unknown[]) => mocks.archiveFlagDefinition(...args),
  listFlagOverrides: (...args: unknown[]) => mocks.listFlagOverrides(...args),
  upsertFlagOverride: (...args: unknown[]) => mocks.upsertFlagOverride(...args),
  deleteFlagOverride: (...args: unknown[]) => mocks.deleteFlagOverride(...args),
}));

import { createError } from '@/lib/errors';
import { GET as listFlags, POST as createFlag } from '../route';
import { DELETE as archiveFlag, PATCH as killSwitch, PUT as updateFlag } from '../[key]/route';
import { DELETE as removeOverride, PUT as setOverride } from '../[key]/overrides/route';

const KEY = 'composer.voice_mode';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const STORED = {
  key: KEY,
  description: 'Voice mode in the composer',
  killSwitch: false,
  variants: ['on', 'off'],
  defaultVariant: 'off',
  rules: [],
  expiresAt: null,
  archivedAt: null,
  version: 1,
  createdAt: '2026-09-17T00:00:00.000Z',
  updatedAt: '2026-09-17T00:00:00.000Z',
};

function request(method: string, path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const params = { params: Promise.resolve({ key: KEY }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePlatformAdmin.mockResolvedValue({ userId: 'operator_1' });
});

describe('feature flag admin API', () => {
  it('answers not found to anyone who is not a platform operator', async () => {
    mocks.requirePlatformAdmin.mockRejectedValue(createError.notFound('Not found.'));
    const response = await listFlags(request('GET', '/api/admin/feature-flags'));
    expect(response.status).toBe(404);
    expect(mocks.listFlagDefinitions).not.toHaveBeenCalled();
  });

  it('creates a targeted flag and records who created it', async () => {
    mocks.insertFlagDefinition.mockResolvedValue(STORED);
    const response = await createFlag(
      request('POST', '/api/admin/feature-flags', {
        key: KEY,
        description: 'Voice mode in the composer',
        rules: [
          {
            id: 'enterprise-canary',
            conditions: { plans: ['enterprise'], clientVersion: { min: '2.4' } },
            rollout: { percentage: 5 },
            variant: 'on',
          },
        ],
      }),
    );
    expect(response.status).toBe(201);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'operator_1',
        eventType: 'feature_flag_changed',
        detail: expect.objectContaining({ resourceId: KEY, status: 'created' }),
      }),
    );
  });

  it('refuses a definition under a reserved prefix that no reader spells', async () => {
    const response = await createFlag(
      request('POST', '/api/admin/feature-flags', {
        key: 'capability.browser',
        description: 'Browser automation',
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.insertFlagDefinition).not.toHaveBeenCalled();
  });

  it('refuses a ring definition whose default the ring gate would misread', async () => {
    const response = await createFlag(
      request('POST', '/api/admin/feature-flags', {
        key: 'rollout.web.beta.wave_one',
        description: 'Beta wave one on web',
        defaultVariant: 'on',
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.insertFlagDefinition).not.toHaveBeenCalled();
  });

  it('refuses a definition whose rules serve an undeclared variant', async () => {
    const response = await createFlag(
      request('POST', '/api/admin/feature-flags', {
        key: KEY,
        rules: [{ id: 'arm', variant: 'purple' }],
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.insertFlagDefinition).not.toHaveBeenCalled();
  });

  it('refuses a stale update rather than overwriting a newer definition', async () => {
    mocks.getFlagDefinition.mockResolvedValue(STORED);
    mocks.updateFlagDefinition.mockResolvedValue(null);
    const response = await updateFlag(
      request('PUT', `/api/admin/feature-flags/${KEY}`, {
        expectedVersion: 1,
        flag: { key: KEY, description: 'changed' },
      }),
      params,
    );
    expect(response.status).toBe(409);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it('audits which fields an update changed', async () => {
    mocks.getFlagDefinition.mockResolvedValue(STORED);
    mocks.updateFlagDefinition.mockResolvedValue({
      ...STORED,
      version: 2,
      expiresAt: '2026-10-01T00:00:00.000Z',
    });
    const response = await updateFlag(
      request('PUT', `/api/admin/feature-flags/${KEY}`, {
        expectedVersion: 1,
        flag: {
          key: KEY,
          description: 'Voice mode in the composer',
          expiresAt: '2026-10-01T00:00:00.000Z',
        },
      }),
      params,
    );
    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ status: 'updated', changedKeys: ['expiresAt'] }),
      }),
    );
  });

  it('engages the kill switch and audits it as a warning', async () => {
    mocks.setFlagKillSwitch.mockResolvedValue({ ...STORED, killSwitch: true, version: 2 });
    const response = await killSwitch(
      request('PATCH', `/api/admin/feature-flags/${KEY}`, { killSwitch: true }),
      params,
    );
    expect(response.status).toBe(200);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warning',
        detail: expect.objectContaining({ status: 'killed', enabled: false }),
      }),
    );
  });

  it('archives a flag', async () => {
    mocks.archiveFlagDefinition.mockResolvedValue({
      ...STORED,
      archivedAt: '2026-09-17T01:00:00.000Z',
    });
    const response = await archiveFlag(
      request('DELETE', `/api/admin/feature-flags/${KEY}`),
      params,
    );
    expect(response.status).toBe(200);
  });

  it('sets a workspace override and audits it against that workspace', async () => {
    mocks.getFlagDefinition.mockResolvedValue(STORED);
    const response = await setOverride(
      request('PUT', `/api/admin/feature-flags/${KEY}/overrides`, {
        subject: 'workspace',
        subjectId: WORKSPACE_ID,
        variant: 'on',
      }),
      params,
    );
    expect(response.status).toBe(200);
    expect(mocks.upsertFlagOverride).toHaveBeenCalledWith(
      KEY,
      expect.objectContaining({ subject: 'workspace', subjectId: WORKSPACE_ID, variant: 'on' }),
    );
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'feature_flag_override_changed',
        organizationId: WORKSPACE_ID,
      }),
    );
  });

  it('refuses an override naming a variant the flag does not declare', async () => {
    mocks.getFlagDefinition.mockResolvedValue(STORED);
    const response = await setOverride(
      request('PUT', `/api/admin/feature-flags/${KEY}/overrides`, {
        subject: 'user',
        subjectId: 'user_9',
        variant: 'treatment',
      }),
      params,
    );
    expect(response.status).toBe(400);
    expect(mocks.upsertFlagOverride).not.toHaveBeenCalled();
  });

  it('answers not found when removing an override that does not exist', async () => {
    mocks.deleteFlagOverride.mockResolvedValue(0);
    const response = await removeOverride(
      request('DELETE', `/api/admin/feature-flags/${KEY}/overrides`, {
        subject: 'user',
        subjectId: 'user_9',
      }),
      params,
    );
    expect(response.status).toBe(404);
  });
});
