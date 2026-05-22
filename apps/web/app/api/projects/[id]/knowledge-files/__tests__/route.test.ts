/**
 * Tests for GET and POST /api/projects/[id]/knowledge-files.
 *
 * Covers: GET returns mapped files, GET handles table-not-found (empty),
 * POST validates required fields (400), POST handles table-not-found (503),
 * POST accepts valid input (201).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockFrom,
  mockInsert,
  mockEq,
  mockIs,
  mockSelect,
  mockSingle,
  mockOrder,
  mockGetAuthenticatedUserWithClient,
} = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockOrder = vi.fn();
  const mockSelect = vi.fn();
  const mockIs = vi.fn();
  const mockEq = vi.fn();
  const mockInsert = vi.fn();
  const mockFrom = vi.fn();
  const mockGetAuthenticatedUserWithClient = vi.fn();
  return {
    mockFrom,
    mockInsert,
    mockEq,
    mockIs,
    mockSelect,
    mockSingle,
    mockOrder,
    mockGetAuthenticatedUserWithClient,
  };
});

vi.mock('@/lib/rate-limit', () => ({
  withRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/csrf', () => ({
  requireCsrfToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/api-auth', () => ({
  getAuthenticatedUserWithClient: mockGetAuthenticatedUserWithClient,
  getAuthenticatedUser: vi.fn(),
}));

import { GET, POST } from '@/app/api/projects/[id]/knowledge-files/route';

const PROJECT_ROW = { id: 'proj-1' };

const KB_FILE_ROW = {
  id: 'file-1',
  project_id: 'proj-1',
  file_name: 'spec.pdf',
  mime_type: 'application/pdf',
  byte_count: 1024,
  checksum_sha256: 'abc123',
  summary: 'A spec doc',
  source_surface: 'web',
  added_by_user_id: 'user-abc',
  added_at: '2026-05-22T10:00:00Z',
  retention_expires_at: null,
  deleted_at: null,
  storage_uri: 'storage/files/spec.pdf',
};

function wireAuthAndDb() {
  mockGetAuthenticatedUserWithClient.mockResolvedValue({
    user: { id: 'user-abc' },
    userDb: { from: (...args: unknown[]) => mockFrom(...args) },
  });
}

function makeGetRequest(projectId: string): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${projectId}/knowledge-files`, {
    method: 'GET',
  });
}

function makePostRequest(projectId: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${projectId}/knowledge-files`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const routeContext = (id: string) => ({ params: Promise.resolve({ id }) });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/projects/[id]/knowledge-files', () => {
  beforeEach(() => {
    wireAuthAndDb();
  });

  it('returns mapped files for a project', async () => {
    // Project ownership check
    mockSingle.mockResolvedValueOnce({ data: PROJECT_ROW, error: null });
    // File list query
    mockOrder.mockResolvedValueOnce({ data: [KB_FILE_ROW], error: null });
    mockIs.mockReturnValueOnce({ order: mockOrder });
    mockEq.mockReturnValue({ eq: mockEq, is: mockIs, single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockFrom.mockReturnValue({ select: mockSelect });

    const res = await GET(makeGetRequest('proj-1'), routeContext('proj-1'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { files: unknown[] };
    expect(Array.isArray(json.files)).toBe(true);
    expect(json.files).toHaveLength(1);
    const file = json.files[0] as Record<string, unknown>;
    expect(file['id']).toBe('file-1');
    expect(file['fileName']).toBe('spec.pdf');
    expect(file['mimeType']).toBe('application/pdf');
    expect(file['byteCount']).toBe(1024);
    expect(file['sourceSurface']).toBe('web');
  });

  it('returns empty array when table does not exist (42P01)', async () => {
    // Project ownership check succeeds
    mockSingle.mockResolvedValueOnce({ data: PROJECT_ROW, error: null });
    // Files query returns 42P01
    const pgError = { code: '42P01', message: 'relation does not exist' };
    mockOrder.mockResolvedValueOnce({ data: null, error: pgError });
    mockIs.mockReturnValueOnce({ order: mockOrder });
    mockEq.mockReturnValue({ eq: mockEq, is: mockIs, single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockFrom.mockReturnValue({ select: mockSelect });

    const res = await GET(makeGetRequest('proj-1'), routeContext('proj-1'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { files: unknown[] };
    expect(json.files).toEqual([]);
  });
});

describe('POST /api/projects/[id]/knowledge-files', () => {
  beforeEach(() => {
    wireAuthAndDb();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(
      makePostRequest('proj-1', { mimeType: 'application/pdf' }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toMatch(/fileName/i);
  });

  it('returns 503 when table does not exist (42P01)', async () => {
    // Project ownership check succeeds
    mockSingle.mockResolvedValueOnce({ data: PROJECT_ROW, error: null });
    // Insert returns 42P01
    const pgError = { code: '42P01', message: 'relation does not exist' };
    mockSingle.mockResolvedValueOnce({ data: null, error: pgError });
    // select() resolves both the project-check (.eq().eq().single()) and the
    // insert(.select().single()) chains.
    mockEq.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert });

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: 'abc123',
        sourceSurface: 'web',
        storageUri: 'storage/files/spec.pdf',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string; message: string };
    expect(json.error).toBe('knowledge_files_unavailable');
    expect(json.message).toContain('Knowledge files require Cloud Managed');
  });

  it('returns 201 with mapped file on valid input', async () => {
    // Project ownership check
    mockSingle.mockResolvedValueOnce({ data: PROJECT_ROW, error: null });
    // Insert succeeds
    mockSingle.mockResolvedValueOnce({ data: KB_FILE_ROW, error: null });
    mockEq.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockSelect.mockReturnValue({ eq: mockEq, single: mockSingle });
    mockInsert.mockReturnValue({ select: mockSelect });
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert });

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: 'abc123',
        sourceSurface: 'web',
        storageUri: 'storage/files/spec.pdf',
        summary: 'A spec doc',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as { file: Record<string, unknown> };
    expect(json.file['id']).toBe('file-1');
    expect(json.file['fileName']).toBe('spec.pdf');
    expect(json.file['storageUri']).toBe('storage/files/spec.pdf');
  });

  it('returns 400 when sourceSurface is invalid', async () => {
    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: 'abc123',
        sourceSurface: 'fax-machine',
        storageUri: 'storage/files/spec.pdf',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toMatch(/sourceSurface/i);
  });

  it('returns 400 when byteCount exceeds MAX_ATTACHMENT_BYTES', async () => {
    const tooBig = 25 * 1024 * 1024 + 1; // 1 byte over 25 MiB
    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'huge.bin',
        mimeType: 'application/octet-stream',
        byteCount: tooBig,
        checksumSha256: 'abc123',
        sourceSurface: 'web',
        storageUri: 'storage/files/huge.bin',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toMatch(/byteCount/i);
  });
});
