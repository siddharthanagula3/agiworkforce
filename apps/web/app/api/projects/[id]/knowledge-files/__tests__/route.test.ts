/**
 * Tests for GET and POST /api/projects/[id]/knowledge-files.
 *
 * Covers: GET returns mapped files, GET handles table-not-found (unavailable),
 * POST validates required fields (400), POST handles table-not-found (503),
 * POST accepts valid input (201).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  mockGetClerkAuthUser,
  mockNeonQuery,
  mockExtractProjectKnowledgeFile,
  MockProjectKnowledgeExtractionError,
  mockResolveActiveOrganizationId,
} = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockExtractProjectKnowledgeFile: vi.fn(),
  MockProjectKnowledgeExtractionError: class ProjectKnowledgeExtractionError extends Error {},
  mockResolveActiveOrganizationId: vi.fn(),
}));

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
  getClerkAuthUser: mockGetClerkAuthUser,
  getAuthenticatedUserWithClient: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: vi.fn(() => ({
    query: (...args: unknown[]) => mockNeonQuery(...args),
    execute: vi.fn().mockResolvedValue(1),
    transaction: vi.fn((fn: (db: unknown) => unknown) => fn({})),
    withUser: vi.fn(() => ({})),
    dispose: vi.fn(),
  })),
}));

// Pro tier: 10 GB of knowledge storage, so the aggregate quota check passes
// and these tests keep exercising what they are actually about.
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })) },
}));
vi.mock('@/lib/services/active-workspace-service', () => ({
  resolveActiveOrganizationId: mockResolveActiveOrganizationId,
}));
vi.mock('@/lib/server/project-knowledge-extraction', () => ({
  extractProjectKnowledgeFile: mockExtractProjectKnowledgeFile,
  ProjectKnowledgeExtractionError: MockProjectKnowledgeExtractionError,
}));

import { GET, POST } from '@/app/api/projects/[id]/knowledge-files/route';

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
  storage_uri: 'knowledge-files/projects/proj-1/spec.pdf',
};
const CHECKSUM = 'a'.repeat(64);

function wireAuth() {
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mockResolveActiveOrganizationId.mockResolvedValue(null);
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
    wireAuth();
  });

  it('returns mapped files for a project', async () => {
    // First call: project ownership check returns [{ id: 'proj-1' }]
    // Second call: file list query returns [KB_FILE_ROW]
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]).mockResolvedValueOnce([KB_FILE_ROW]);

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
    expect(file['storageUri']).toBe('/api/projects/proj-1/knowledge-files/file-1');
  });

  it('returns 503 when the knowledge schema is unavailable (42P01)', async () => {
    // Project ownership check succeeds
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    // Files query throws PG 42P01
    const pgError = { code: '42P01', message: 'relation does not exist' };
    mockNeonQuery.mockRejectedValueOnce(pgError);

    const res = await GET(makeGetRequest('proj-1'), routeContext('proj-1'));

    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe('knowledge_files_unavailable');
  });
});

describe('POST /api/projects/[id]/knowledge-files', () => {
  beforeEach(() => {
    wireAuth();
    mockExtractProjectKnowledgeFile.mockResolvedValue({ extractedText: null });
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

  it('returns 400 before object access when the checksum is not SHA-256', async () => {
    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: 'abc123',
        sourceSurface: 'web',
        storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(400);
    expect(mockExtractProjectKnowledgeFile).not.toHaveBeenCalled();
  });

  it('returns 503 when table does not exist (42P01)', async () => {
    // Project ownership check succeeds
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    // Insert throws PG 42P01
    const pgError = { code: '42P01', message: 'relation does not exist' };
    mockNeonQuery.mockRejectedValueOnce(pgError);

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string; message: string };
    expect(json.error).toBe('knowledge_files_unavailable');
    expect(json.message).toContain('Knowledge files require Cloud Managed');
  });

  it('returns 201 with mapped file on valid input', async () => {
    // Project ownership check succeeds
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    // Active-file count under the cap
    mockNeonQuery.mockResolvedValueOnce([{ count: 0 }]);
    // Duplicate-checksum probe finds nothing
    mockNeonQuery.mockResolvedValueOnce([]);
    // Aggregate storage usage well under the plan's quota
    mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
    // No prior version of this file name
    mockNeonQuery.mockResolvedValueOnce([]);
    // Insert returns the new row
    mockNeonQuery.mockResolvedValueOnce([KB_FILE_ROW]);
    mockExtractProjectKnowledgeFile.mockResolvedValue({
      extractedText: 'The launch date is October 4.',
    });

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
        summary: 'A spec doc',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(201);
    const json = (await res.json()) as { file: Record<string, unknown> };
    expect(json.file['id']).toBe('file-1');
    expect(json.file['fileName']).toBe('spec.pdf');
    expect(json.file['storageUri']).toBe('/api/projects/proj-1/knowledge-files/file-1');
    expect(mockExtractProjectKnowledgeFile).toHaveBeenCalledWith({
      projectId: 'proj-1',
      storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
      fileName: 'spec.pdf',
      mimeType: 'application/pdf',
      byteCount: 1024,
      checksumSha256: CHECKSUM,
    });
    // Located by CONTENT, not call index: this route legitimately gains
    // queries (the duplicate-checksum probe did), and a positional assertion
    // breaks on every one of them for no real reason.
    const insertCall = mockNeonQuery.mock.calls.find((call) =>
      String(call?.[0] ?? '').includes('insert into project_knowledge_files'),
    );
    expect(insertCall?.[0]).toContain('extracted_text');
    expect(insertCall?.[1]).toContain('The launch date is October 4.');
  });

  it('returns 409 and does not extract or insert when the project is already at the file cap', async () => {
    // Ownership check succeeds; active-file count is already at the cap (20).
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([{ count: 20 }]);

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(409);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toContain('maximum');
    // Fail-fast: no extraction, and nothing written.
    expect(mockExtractProjectKnowledgeFile).not.toHaveBeenCalled();
    expect(
      mockNeonQuery.mock.calls.some((call) =>
        String(call?.[0] ?? '').includes('insert into project_knowledge_files'),
      ),
    ).toBe(false);
  });

  it('returns a user-safe 400 and does not insert when extraction rejects the object', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([{ count: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockExtractProjectKnowledgeFile.mockRejectedValue(
      new MockProjectKnowledgeExtractionError('The uploaded file failed its integrity check.'),
    );

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toContain('integrity check');
    // Assert the INTENT — nothing was written — rather than a query count,
    // which changes whenever the route gains a legitimate read.
    expect(
      mockNeonQuery.mock.calls.some((call) =>
        String(call?.[0] ?? '').includes('insert into project_knowledge_files'),
      ),
    ).toBe(false);
  });

  it('returns 400 when sourceSurface is invalid', async () => {
    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'fax-machine',
        storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
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
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: 'storage/files/huge.bin',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toMatch(/larger than the 25 MiB/i);
  });

  it('returns 400 for a disallowed mimeType with no recognized extension', async () => {
    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'payload.bin',
        mimeType: 'application/octet-stream',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: 'storage/files/payload.bin',
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toMatch(/not an accepted attachment type/i);
  });

  // Regression: `checksum_sha256` was stored and passed to the extractor but
  // never compared, so re-uploading the same file created a second unrelated
  // row — consuming a file slot and doubling the text stuffed into context.
  it('rejects a file whose checksum already exists in the project', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([{ count: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([{ id: 'kb-1', file_name: 'spec.pdf' }]);

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec-copy.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(res.status).toBe(409);
    // Checked BEFORE extraction so a duplicate never pays for that work.
    expect(mockExtractProjectKnowledgeFile).not.toHaveBeenCalled();
  });

  // Regression: re-uploading a CORRECTED file created a completely unrelated
  // row. The old version stayed active, so the model saw both the stale and
  // the corrected text, and the 20-file budget was consumed twice.
  it('versions a same-name file with new content instead of duplicating it', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([{ count: 1 }]);
    // Different checksum, so not the duplicate case.
    mockNeonQuery.mockResolvedValueOnce([]);
    mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
    // An existing v1 of the same file name.
    mockNeonQuery.mockResolvedValueOnce([{ id: 'kb-old', version: 1 }]);
    mockNeonQuery.mockResolvedValueOnce([KB_FILE_ROW]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockExtractProjectKnowledgeFile.mockResolvedValue({ extractedText: 'Corrected text.' });

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 2048,
        checksumSha256: 'b'.repeat(64),
        sourceSurface: 'web',
        storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(res.status).toBe(201);

    const insertCall = mockNeonQuery.mock.calls.find((call) =>
      String(call?.[0] ?? '').includes('insert into project_knowledge_files'),
    );
    // Version 2, pointing at the row it replaced.
    expect(insertCall?.[1]).toContain(2);
    expect(insertCall?.[1]).toContain('kb-old');

    // The old row is retired only AFTER the replacement exists, and via
    // superseded_at rather than deleted_at so history survives.
    const supersedeCall = mockNeonQuery.mock.calls.find((call) =>
      String(call?.[0] ?? '').includes('set superseded_at = now()'),
    );
    expect(supersedeCall?.[1]).toEqual(['kb-old', 'proj-1']);
    expect(String(supersedeCall?.[0] ?? '')).toContain('project_id = $2');
    expect(String(supersedeCall?.[0] ?? '')).not.toContain('deleted_at');
  });
});
