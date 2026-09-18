import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetUserScopedDb,
  mockCsrf,
  mockRateLimit,
  mockE2bReady,
  mockManagedComputeBeta,
  mockRunCell,
  mockGetSession,
} = vi.hoisted(() => ({
  mockGetUserScopedDb: vi.fn(),
  mockCsrf: vi.fn(),
  mockRateLimit: vi.fn(),
  mockE2bReady: vi.fn(),
  mockManagedComputeBeta: vi.fn(),
  mockRunCell: vi.fn(),
  mockGetSession: vi.fn(),
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
    runCloudCodeNotebookCell: mockRunCell,
    getCloudCodeSession: mockGetSession,
  };
});

import { createDatabaseAdapterFake } from '@/test/database-adapter-fake';
import { POST } from './route';

const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const context = { params: Promise.resolve({ sessionId: SESSION_ID }) };
const SESSION = {
  id: SESSION_ID,
  title: 'notebook',
  repositoryUrl: null,
  repositoryBranch: null,
  networkAccess: 'trusted',
  runtimeId: 'code-interpreter-v1',
  extraHosts: [],
  state: 'ready',
  workspacePath: '/home/user',
  lastError: null,
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
  closedAt: null,
};

const queries: Array<[string, unknown[]]> = [];
const db = createDatabaseAdapterFake({
  query: (async (sql: string, params: unknown[] = []) => {
    queries.push([sql, params]);
    return [];
  }) as never,
});

function postRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost:3000/api/code/sessions/${SESSION_ID}/notebook/run-all`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function notebookRunInserts(): Array<unknown[]> {
  return queries
    .filter(([sql]) => sql.includes('insert into public.notebook_runs'))
    .map(([, params]) => params);
}

beforeEach(() => {
  vi.clearAllMocks();
  queries.length = 0;
  mockCsrf.mockResolvedValue(null);
  mockRateLimit.mockResolvedValue(null);
  mockE2bReady.mockReturnValue(true);
  mockManagedComputeBeta.mockReturnValue(true);
  mockGetUserScopedDb.mockResolvedValue({ db, userId: 'user-1', organizationId: null });
  mockGetSession.mockResolvedValue(SESSION);
  mockRunCell.mockResolvedValue({ session: SESSION, ok: true, outputs: [] });
});

describe('POST /notebook/run-all', () => {
  it('runs every cell in order under one run id and records each with actor, code and time', async () => {
    const response = await POST(
      postRequest({
        cells: [
          { id: 'cell-a', code: 'x = 1', language: 'python' },
          { id: 'cell-b', code: 'print(x)', language: 'python' },
        ],
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mockRunCell).toHaveBeenCalledTimes(2);
    const body = (await response.json()) as {
      runId: string;
      fromTop: boolean;
      completed: boolean;
      networkAccess: string;
      results: Array<{ cellId: string; ok: boolean }>;
    };
    expect(body.results.map((result) => result.cellId)).toEqual(['cell-a', 'cell-b']);
    expect(body.completed).toBe(true);
    expect(body.fromTop).toBe(true);
    expect(body.networkAccess).toBe('trusted');

    const inserts = notebookRunInserts();
    expect(inserts).toHaveLength(2);
    expect(inserts.map((params) => params[3])).toEqual([body.runId, body.runId]);
    expect(inserts.map((params) => params[5])).toEqual([0, 1]);
    expect(inserts.map((params) => params[7])).toEqual(['x = 1', 'print(x)']);
    expect(inserts[0]?.[0]).toBe('user-1');
    expect(inserts[0]?.[8]).toMatch(/^[0-9a-f]{64}$/);
    expect(inserts[0]?.[9]).toBe('trusted');
    expect(inserts[0]?.[10]).toBe(true);
    expect(String(inserts[0]?.[13])).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('stops at the first failing cell rather than reporting results below it', async () => {
    mockRunCell
      .mockResolvedValueOnce({ session: SESSION, ok: false, outputs: [], error: 'NameError' })
      .mockResolvedValue({ session: SESSION, ok: true, outputs: [] });

    const response = await POST(
      postRequest({
        cells: [
          { id: 'cell-a', code: 'boom', language: 'python' },
          { id: 'cell-b', code: 'print(1)', language: 'python' },
        ],
      }),
      context,
    );

    const body = (await response.json()) as { completed: boolean; results: unknown[] };
    expect(mockRunCell).toHaveBeenCalledTimes(1);
    expect(body.results).toHaveLength(1);
    expect(body.completed).toBe(false);
    expect(notebookRunInserts()).toHaveLength(1);
  });

  it('refuses a run that demands a tighter network policy than the session has', async () => {
    const response = await POST(
      postRequest({
        cells: [{ id: 'cell-a', code: 'print(1)', language: 'python' }],
        requireNetworkAccess: 'none',
      }),
      context,
    );

    expect(response.status).toBe(409);
    expect(mockRunCell).not.toHaveBeenCalled();
  });

  it('rejects an empty cell list before touching the sandbox', async () => {
    const response = await POST(postRequest({ cells: [] }), context);
    expect(response.status).toBe(400);
    expect(mockRunCell).not.toHaveBeenCalled();
  });

  it('refuses when the managed-compute beta gate is closed', async () => {
    mockManagedComputeBeta.mockReturnValue(false);
    const response = await POST(
      postRequest({ cells: [{ id: 'cell-a', code: 'print(1)', language: 'python' }] }),
      context,
    );
    expect(response.status).toBe(503);
    expect(mockRunCell).not.toHaveBeenCalled();
  });
});
