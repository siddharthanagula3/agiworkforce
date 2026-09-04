// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUserScopedDb, mockRateLimit, mockE2bReady, mockReadFile } = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockRateLimit: vi.fn(),
  mockE2bReady: vi.fn(),
  mockReadFile: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: mockRateLimit }));
vi.mock('@/lib/e2b/gate', () => ({ e2bProvisioningReady: mockE2bReady }));
vi.mock('@/lib/server/rls-db', () => ({ getUserScopedDb: mockGetUserScopedDb }));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(async () => ({ plan_tier: 'pro', status: 'active' })),
  },
}));
vi.mock('@/lib/services/cloud-code-session-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/cloud-code-session-service')>();
  return { ...actual, readCloudCodeNotebookFile: mockReadFile };
});

import { CloudCodeNotFoundError } from '@/lib/services/cloud-code-session-service';
import { GET } from './route';

const SESSION_ID = '22222222-2222-4222-8222-222222222222';
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

function context(path: string[]) {
  return { params: Promise.resolve({ sessionId: SESSION_ID, path }) };
}

function getRequest(path: string): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/code/sessions/${SESSION_ID}/notebook/files/${path}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockGetUserScopedDb.mockResolvedValue({ db: {}, userId: 'user-1', organizationId: null });
  mockReadFile.mockResolvedValue({ session: SESSION, bytes: new TextEncoder().encode('hello') });
});

describe('GET /notebook/files/[...path]', () => {
  it('streams the file bytes with an attachment disposition', async () => {
    const response = await GET(getRequest('output.bin'), context(['output.bin']));

    expect(response.status).toBe(200);
    expect(mockReadFile).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'output.bin',
      'pro',
    );
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="output.bin"');
    const body = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(body)).toBe('hello');
  });

  it('joins a nested path back together for the service call', async () => {
    await GET(getRequest('nested/output.bin'), context(['nested', 'output.bin']));
    expect(mockReadFile).toHaveBeenCalledWith(
      {},
      { userId: 'user-1', organizationId: null },
      SESSION_ID,
      'nested/output.bin',
      'pro',
    );
  });

  it('maps a missing file to 404', async () => {
    mockReadFile.mockRejectedValueOnce(new CloudCodeNotFoundError());
    const response = await GET(getRequest('missing.bin'), context(['missing.bin']));
    expect(response.status).toBe(404);
  });

  it('refuses when managed Code is not provisioned', async () => {
    mockE2bReady.mockReturnValue(false);
    const response = await GET(getRequest('output.bin'), context(['output.bin']));
    expect(response.status).toBe(503);
    expect(mockReadFile).not.toHaveBeenCalled();
  });
});
