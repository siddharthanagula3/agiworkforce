import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { CLOUD_CODE_ENVIRONMENT_LIMITS } from '@agiworkforce/types';
type ServiceModule = typeof import('@/lib/services/cloud-code-environment-service');
type RateLimitModule = typeof import('@/lib/rate-limit');
type CsrfModule = typeof import('@/lib/csrf');
type RlsDbModule = typeof import('@/lib/server/rls-db');
type SecurityAuditModule = typeof import('@/lib/security-audit');

const { mockGetUserScopedDb, mockCsrf, mockRateLimit, mockRecordAuditEvent, service } = vi.hoisted(
  () => ({
    mockGetUserScopedDb: vi.fn(),
    mockRecordAuditEvent: vi.fn(),
    mockCsrf: vi.fn(),
    mockRateLimit: vi.fn(),
    service: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  }),
);

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<RateLimitModule>()),
  withRateLimit: mockRateLimit,
}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  requireCsrfToken: mockCsrf,
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<RlsDbModule>()),
  getUserScopedDb: mockGetUserScopedDb,
}));
vi.mock('@/lib/security-audit', async (importOriginal) => ({
  ...(await importOriginal<SecurityAuditModule>()),
  recordAuditEvent: mockRecordAuditEvent,
}));
vi.mock('@/lib/services/cloud-code-environment-service', async (importOriginal) => ({
  ...(await importOriginal<ServiceModule>()),
  listCloudCodeEnvironments: service.list,
  createCloudCodeEnvironment: service.create,
  updateCloudCodeEnvironment: service.update,
  deleteCloudCodeEnvironment: service.remove,
}));

import { createDatabaseAdapterFake } from '@/test/database-adapter-fake';
import {
  CLOUD_CODE_ENVIRONMENT_NAME_TAKEN,
  CloudCodeEnvironmentConflictError,
  CloudCodeEnvironmentNotFoundError,
} from '@/lib/services/cloud-code-environment-service';
import { GET, POST } from './route';
import { DELETE, PATCH } from './[environmentId]/route';

const db = createDatabaseAdapterFake();
const ENVIRONMENT_ID = '0190a000-0000-7000-8000-000000000001';
const ENVIRONMENT = {
  id: ENVIRONMENT_ID,
  name: 'Web app',
  networkAccess: 'trusted',
  extraHosts: [],
  allowPackageManagers: true,
  setupScript: '',
  variableNames: [],
  isDefault: false,
  createdAt: '2026-11-16T10:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
};
const URL_BASE = 'http://localhost:3000/api/code/environments';

function jsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function context(environmentId = ENVIRONMENT_ID) {
  return { params: Promise.resolve({ environmentId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCsrf.mockResolvedValue(null);
  mockRateLimit.mockResolvedValue(null);
  mockRecordAuditEvent.mockResolvedValue(undefined);
  mockGetUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: 'org-1' });
});

describe('GET /api/code/environments', () => {
  it('lists the caller’s environments with the account limit', async () => {
    service.list.mockResolvedValue([ENVIRONMENT]);

    const response = await GET(new NextRequest(URL_BASE));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      environments: [ENVIRONMENT],
      limit: CLOUD_CODE_ENVIRONMENT_LIMITS.perAccount,
    });
    expect(service.list).toHaveBeenCalledWith(db, { userId: 'user-1', organizationId: 'org-1' });
  });

  it('answers a rate-limited caller without reading', async () => {
    mockRateLimit.mockResolvedValue(NextResponse.json({ error: 'slow down' }, { status: 429 }));

    const response = await GET(new NextRequest(URL_BASE));

    expect(response.status).toBe(429);
    expect(service.list).not.toHaveBeenCalled();
  });
});

describe('POST /api/code/environments', () => {
  const body = { requestId: 'request-0001', name: 'Web app', networkAccess: 'trusted' };

  it('creates an environment and answers 201', async () => {
    service.create.mockResolvedValue({ environment: ENVIRONMENT, reused: false });

    const response = await POST(jsonRequest(URL_BASE, 'POST', body));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ environment: ENVIRONMENT });
    expect(service.create).toHaveBeenCalledWith(
      db,
      { userId: 'user-1', organizationId: 'org-1' },
      body,
    );
  });

  it('records the new environment and its network access in the audit trail', async () => {
    service.create.mockResolvedValue({ environment: ENVIRONMENT, reused: false });

    await POST(jsonRequest(URL_BASE, 'POST', body));

    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'code_session_lifecycle_changed',
        detail: {
          resourceType: 'code_environment',
          resourceId: ENVIRONMENT_ID,
          status: 'created',
          changesAfter: ['networkAccess:trusted'],
        },
      }),
    );
  });

  it('answers 200 with the first environment when a request is retried', async () => {
    service.create.mockResolvedValue({ environment: ENVIRONMENT, reused: true });

    const response = await POST(jsonRequest(URL_BASE, 'POST', body));

    expect(response.status).toBe(200);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a field it does not store, so nothing sent is silently dropped', async () => {
    const response = await POST(
      jsonRequest(URL_BASE, 'POST', { ...body, variables: { API_TOKEN: 'secret' } }),
    );

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('refuses a body without a request id', async () => {
    const response = await POST(
      jsonRequest(URL_BASE, 'POST', { name: 'Web app', networkAccess: 'trusted' }),
    );

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('returns the CSRF refusal without creating anything', async () => {
    mockCsrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    const response = await POST(jsonRequest(URL_BASE, 'POST', body));

    expect(response.status).toBe(403);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('answers 409 with the name the account already uses', async () => {
    service.create.mockRejectedValue(
      new CloudCodeEnvironmentConflictError(CLOUD_CODE_ENVIRONMENT_NAME_TAKEN),
    );

    const response = await POST(jsonRequest(URL_BASE, 'POST', body));

    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).toContain(CLOUD_CODE_ENVIRONMENT_NAME_TAKEN);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/code/environments/[environmentId]', () => {
  it('sets an environment as the default', async () => {
    service.update.mockResolvedValue({ ...ENVIRONMENT, isDefault: true });

    const response = await PATCH(
      jsonRequest(`${URL_BASE}/${ENVIRONMENT_ID}`, 'PATCH', { isDefault: true }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ environment: { ...ENVIRONMENT, isDefault: true } });
    expect(service.update).toHaveBeenCalledWith(
      db,
      { userId: 'user-1', organizationId: 'org-1' },
      ENVIRONMENT_ID,
      { isDefault: true },
    );
  });

  it('records which settings changed, and the network access it now allows', async () => {
    service.update.mockResolvedValue({ ...ENVIRONMENT, networkAccess: 'full' });

    await PATCH(
      jsonRequest(`${URL_BASE}/${ENVIRONMENT_ID}`, 'PATCH', {
        networkAccess: 'full',
        fullNetworkAcknowledged: true,
        setupScript: 'pnpm install',
      }),
      context(),
    );

    expect(mockRecordAuditEvent).toHaveBeenCalledTimes(1);
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'code_session_lifecycle_changed',
        detail: {
          resourceType: 'code_environment',
          resourceId: ENVIRONMENT_ID,
          status: 'updated',
          changedKeys: ['networkAccess', 'setupScript'],
          changesAfter: ['networkAccess:full'],
        },
      }),
    );
  });

  it('records no setting value it did not change', async () => {
    service.update.mockResolvedValue({ ...ENVIRONMENT, name: 'Renamed' });

    await PATCH(
      jsonRequest(`${URL_BASE}/${ENVIRONMENT_ID}`, 'PATCH', { name: 'Renamed' }),
      context(),
    );

    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: {
          resourceType: 'code_environment',
          resourceId: ENVIRONMENT_ID,
          status: 'updated',
          changedKeys: ['name'],
        },
      }),
    );
  });

  it('records nothing when the body only acknowledges full network access', async () => {
    service.update.mockResolvedValue(ENVIRONMENT);

    const response = await PATCH(
      jsonRequest(`${URL_BASE}/${ENVIRONMENT_ID}`, 'PATCH', { fullNetworkAcknowledged: true }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses an empty change', async () => {
    const response = await PATCH(
      jsonRequest(`${URL_BASE}/${ENVIRONMENT_ID}`, 'PATCH', {}),
      context(),
    );

    expect(response.status).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('answers 404 for an environment the caller does not own', async () => {
    service.update.mockRejectedValue(new CloudCodeEnvironmentNotFoundError());

    const response = await PATCH(
      jsonRequest(`${URL_BASE}/${ENVIRONMENT_ID}`, 'PATCH', { name: 'Renamed' }),
      context(),
    );

    expect(response.status).toBe(404);
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/code/environments/[environmentId]', () => {
  it('deletes the caller’s environment', async () => {
    service.remove.mockResolvedValue(undefined);

    const response = await DELETE(
      new NextRequest(`${URL_BASE}/${ENVIRONMENT_ID}`, { method: 'DELETE' }),
      context(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(service.remove).toHaveBeenCalledWith(
      db,
      { userId: 'user-1', organizationId: 'org-1' },
      ENVIRONMENT_ID,
    );
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        eventType: 'code_session_lifecycle_changed',
        detail: { resourceType: 'code_environment', resourceId: ENVIRONMENT_ID, status: 'deleted' },
      }),
    );
  });

  it('checks CSRF before it deletes', async () => {
    mockCsrf.mockResolvedValue(NextResponse.json({ error: 'csrf' }, { status: 403 }));

    const response = await DELETE(
      new NextRequest(`${URL_BASE}/${ENVIRONMENT_ID}`, { method: 'DELETE' }),
      context(),
    );

    expect(response.status).toBe(403);
    expect(service.remove).not.toHaveBeenCalled();
    expect(mockRecordAuditEvent).not.toHaveBeenCalled();
  });

  it('answers 404 when nothing was deleted', async () => {
    service.remove.mockRejectedValue(new CloudCodeEnvironmentNotFoundError());

    const response = await DELETE(
      new NextRequest(`${URL_BASE}/${ENVIRONMENT_ID}`, { method: 'DELETE' }),
      context(),
    );

    expect(response.status).toBe(404);
  });
});
