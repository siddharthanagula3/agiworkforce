// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockCsrf,
  mockRateLimit,
  mockE2bReady,
  mockManagedComputeBeta,
  mockListFiles,
  mockWriteFile,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockCsrf: vi.fn(),
  mockRateLimit: vi.fn(),
  mockE2bReady: vi.fn(),
  mockManagedComputeBeta: vi.fn(),
  mockListFiles: vi.fn(),
  mockWriteFile: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: mockCsrf }));
vi.mock('@/lib/e2b/gate', () => ({ e2bProvisioningReady: mockE2bReady }));
vi.mock('@/lib/managed-compute-gate', () => ({
  isManagedComputePrivateBetaEnabled: mockManagedComputeBeta,
}));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(async () => ({ plan_tier: 'pro', status: 'active' })),
  },
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return {
    ...actual,
    listCloudCodeNotebookFiles: mockListFiles,
    writeCloudCodeNotebookFile: mockWriteFile,
  };
});

import { CloudCodeValidationError } from '@/lib/services/cloud-code-session-service';
import { GET, POST } from './route';

const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };
const SESSION = {
  id: SESSION_ID,
  title: 'notebook',
  repositoryUrl: null,
  repositoryBranch: null,
  networkAccess: 'none',
  runtimeId: 'code-interpreter-v1',
  extraHosts: [],
  state: 'ready',
  workspacePath: '/home/user',
  lastError: null,
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
  closedAt: null,
};

function getRequest(): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/notebook/files`);
}

function uploadRequest(formData: FormData): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/notebook/files`, {
    method: 'POST',
    body: formData,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCsrf.mockResolvedValue(null);
  mockRateLimit.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockManagedComputeBeta.mockReturnValue(true);
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockListFiles.mockResolvedValue({ session: SESSION, files: [] });
  mockWriteFile.mockResolvedValue({
    session: SESSION,
    file: { path: 'data.csv', name: 'data.csv', isDir: false, byteSize: 3 },
  });
});

describe('GET /notebook/files', () => {
  it('lists the sandbox workspace files', async () => {
    const response = await GET(getRequest(), context);
    expect(response.status).toBe(200);
    expect(mockListFiles).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'pro',
    );
    await expect(response.json()).resolves.toEqual({ session: SESSION, files: [] });
  });

  it('refuses when managed Code is not provisioned', async () => {
    mockE2bReady.mockReturnValue(false);
    const response = await GET(getRequest(), context);
    expect(response.status).toBe(503);
    expect(mockListFiles).not.toHaveBeenCalled();
  });
});

describe('POST /notebook/files (upload)', () => {
  it('base64-encodes the uploaded bytes and writes them through the service', async () => {
    const formData = new FormData();
    formData.set('file', new File([Buffer.from('abc')], 'data.csv', { type: 'text/csv' }));
    formData.set('path', 'data.csv');

    const response = await POST(uploadRequest(formData), context);

    expect(response.status).toBe(200);
    expect(mockWriteFile).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'data.csv',
      Buffer.from('abc').toString('base64'),
      'pro',
    );
  });

  it('rejects a request with no file', async () => {
    const formData = new FormData();
    formData.set('path', 'data.csv');
    const response = await POST(uploadRequest(formData), context);
    expect(response.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('rejects a request with no path', async () => {
    const formData = new FormData();
    formData.set('file', new File([Buffer.from('abc')], 'data.csv'));
    const response = await POST(uploadRequest(formData), context);
    expect(response.status).toBe(400);
    expect(mockWriteFile).not.toHaveBeenCalled();
  });

  it('surfaces a validation error from the service', async () => {
    mockWriteFile.mockRejectedValueOnce(new CloudCodeValidationError('bad path'));
    const formData = new FormData();
    formData.set('file', new File([Buffer.from('abc')], 'data.csv'));
    formData.set('path', '../etc/passwd');
    const response = await POST(uploadRequest(formData), context);
    expect(response.status).toBe(400);
  });
});
