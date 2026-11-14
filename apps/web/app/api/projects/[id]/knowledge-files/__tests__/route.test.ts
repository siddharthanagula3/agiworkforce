type OriginalProjectKnowledgeObjectStorageModule =
  typeof import('@/lib/server/project-knowledge-object-storage');
import { createDatabaseAdapterFake } from '@/test/database-adapter-fake';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { MAX_PLAN_ATTACHMENT_BYTES, MAX_PROJECT_KNOWLEDGE_FILES } from '@agiworkforce/types';

const {
  mockGetClerkAuthUser,
  mockNeonQuery,
  mockExtractProjectKnowledgeFile,
  MockProjectKnowledgeExtractionError,
  mockResolveActiveOrganizationId,
  mockSealProjectKnowledgeObject,
  mockDeleteProjectKnowledgeObject,
  mockTransaction,
  mockTxExecute,
} = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockExtractProjectKnowledgeFile: vi.fn(),
  MockProjectKnowledgeExtractionError: class ProjectKnowledgeExtractionError extends Error {},
  mockResolveActiveOrganizationId: vi.fn(),
  mockSealProjectKnowledgeObject: vi.fn(),
  mockDeleteProjectKnowledgeObject: vi.fn(),
  mockTransaction: vi.fn(),
  mockTxExecute: vi.fn(),
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

vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mockNeonQuery(...args),
      execute: vi.fn().mockResolvedValue(1),
      transaction: (...args: unknown[]) => mockTransaction(...args),
      withUser: vi.fn(() => ({})),
      dispose: vi.fn(),
    },
    userId: (await mockGetClerkAuthUser()).userId,
    organizationId: await mockResolveActiveOrganizationId(),
  })),
}));

vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })) },
}));
vi.mock('@/lib/server/project-knowledge-extraction', () => ({
  extractProjectKnowledgeFile: mockExtractProjectKnowledgeFile,
  ProjectKnowledgeExtractionError: MockProjectKnowledgeExtractionError,
}));
vi.mock('@/lib/server/project-knowledge-object-storage', async (importOriginal) => ({
  ...(await importOriginal<OriginalProjectKnowledgeObjectStorageModule>()),
  getProjectKnowledgeObject: vi.fn(),
  deleteProjectKnowledgeObject: mockDeleteProjectKnowledgeObject,
  sealProjectKnowledgeObject: mockSealProjectKnowledgeObject,
  sealedProjectKnowledgeKey: (key: string) => key.replace(/\/([^/]+)$/, '/sealed/$1'),
}));

import { GET, POST } from '@/app/api/projects/[id]/knowledge-files/route';
import { findProjectKnowledgeFileByChecksum } from '@/lib/server/project-knowledge-files';
import { READABLE_PROJECT_SCOPE_SQL } from '@/lib/server/project-read-access';

const UPLOADED_KEY = 'knowledge-files/projects/proj-1/spec.pdf';
const SEALED_KEY = 'knowledge-files/projects/proj-1/sealed/spec.pdf';

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
  storage_targets: { private: 'private-fixture-location' },
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

describe('completed project upload lookup query', () => {
  it('binds current project access, uploader, checksum and the exact sealed upload key', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const organizationId = '11111111-1111-4111-8111-111111111111';
    const scope = {
      db: createDatabaseAdapterFake({ query }),
      projectId: 'proj-1',
      userId: 'user-abc',
      organizationId,
    };

    await expect(
      findProjectKnowledgeFileByChecksum(scope, CHECKSUM, UPLOADED_KEY),
    ).resolves.toBeNull();

    expect(query).toHaveBeenCalledWith(expect.stringContaining(READABLE_PROJECT_SCOPE_SQL), [
      'proj-1',
      'user-abc',
      organizationId,
      CHECKSUM,
      SEALED_KEY,
    ]);
    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql).toContain('join user_projects p on p.id = f.project_id');
    expect(sql).toContain('f.added_by_user_id = $2');
    expect(sql).toContain('f.checksum_sha256 = $4');
    expect(sql).toContain('f.storage_uri = $5');
    expect(sql).toContain('f.deleted_at is null');
    expect(sql).toContain('f.superseded_at is null');

    await expect(
      findProjectKnowledgeFileByChecksum(
        scope,
        CHECKSUM,
        'knowledge-files/projects/proj-1/other.pdf',
      ),
    ).resolves.toBeNull();
    expect(query.mock.calls[1]?.[1]).toEqual([
      'proj-1',
      'user-abc',
      organizationId,
      CHECKSUM,
      'knowledge-files/projects/proj-1/sealed/other.pdf',
    ]);
  });
});

describe('GET /api/projects/[id]/knowledge-files', () => {
  beforeEach(() => {
    wireAuth();
  });

  it('returns mapped files for a project', async () => {
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
    expect(file['textPreviewKind']).toBeNull();
    expect(file).not.toHaveProperty('storage_targets');
    expect(file).not.toHaveProperty('storageTargets');
  });

  it.each([
    ['notes.md', 'text/markdown', 'text'],
    ['data.csv', 'text/csv', 'table'],
    [
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'office',
    ],
  ])('advertises the server preview kind for %s', async (fileName, mimeType, kind) => {
    mockNeonQuery
      .mockResolvedValueOnce([{ id: 'proj-1' }])
      .mockResolvedValueOnce([{ ...KB_FILE_ROW, file_name: fileName, mime_type: mimeType }]);
    const res = await GET(makeGetRequest('proj-1'), routeContext('proj-1'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.files[0].textPreviewKind).toBe(kind);
    expect(json.files[0].textPreview).toBe(kind !== 'text');
  });

  it('reports a failed source read as a server error, not an unavailable feature', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockRejectedValueOnce(new Error('connection terminated'));

    const res = await GET(makeGetRequest('proj-1'), routeContext('proj-1'));

    expect(res.status).toBe(500);
  });
});

describe('POST /api/projects/[id]/knowledge-files', () => {
  beforeEach(() => {
    wireAuth();
    mockExtractProjectKnowledgeFile.mockResolvedValue({
      extractedText: null,
      anchors: [],
      objectKey: UPLOADED_KEY,
      etag: '"etag-1"',
      bytes: Buffer.from('inspected'),
      contentType: 'application/pdf',
    });
    mockSealProjectKnowledgeObject.mockResolvedValue({
      key: SEALED_KEY,
      targets: { private: 'fixture-private' },
    });
    mockDeleteProjectKnowledgeObject.mockResolvedValue(undefined);
    mockTransaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ query: (...args: unknown[]) => mockNeonQuery(...args), execute: mockTxExecute }),
    );
  });

  it('retains staging when the sealed source cannot be registered', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([{ count: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
    mockNeonQuery.mockRejectedValueOnce(new Error('Registration unavailable'));

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: UPLOADED_KEY,
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(500);
    expect(mockSealProjectKnowledgeObject).toHaveBeenCalledOnce();
    expect(mockDeleteProjectKnowledgeObject).not.toHaveBeenCalled();
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

  it('reports a failed registration read as a server error', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockRejectedValueOnce(new Error('connection terminated'));

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

    expect(res.status).toBe(500);
  });

  it('returns 201 with mapped file on valid input', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([{ count: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([KB_FILE_ROW]);
    mockExtractProjectKnowledgeFile.mockResolvedValue({
      extractedText: 'The launch date is October 4.',
      anchors: [],
      objectKey: UPLOADED_KEY,
      etag: '"etag-1"',
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
    expect(mockDeleteProjectKnowledgeObject).toHaveBeenCalledWith(UPLOADED_KEY);
    const registrationIndex = mockNeonQuery.mock.calls.findIndex((call) =>
      String(call[0]).includes('insert into project_knowledge_files'),
    );
    expect(registrationIndex).toBeGreaterThanOrEqual(0);
    expect(mockDeleteProjectKnowledgeObject.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockNeonQuery.mock.invocationCallOrder[registrationIndex]!,
    );
    const json = (await res.json()) as { file: Record<string, unknown> };
    expect(json.file['id']).toBe('file-1');
    expect(json.file['fileName']).toBe('spec.pdf');
    expect(json.file['storageUri']).toBe('/api/projects/proj-1/knowledge-files/file-1');
    expect(mockExtractProjectKnowledgeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        storageUri: 'knowledge-files/projects/proj-1/spec.pdf',
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
      }),
    );
    // A scan has no text layer, so the extractor is handed what a vision call
    // needs: without this the file lands in the store with nothing in it.
    expect(mockExtractProjectKnowledgeFile.mock.calls[0]?.[0]).toMatchObject({
      transcribeScans: { userId: 'user-abc', documentId: `proj-1:${CHECKSUM}` },
    });
    const insertCall = mockNeonQuery.mock.calls.find((call) =>
      String(call?.[0] ?? '').includes('insert into project_knowledge_files'),
    );
    expect(insertCall?.[0]).toContain('extracted_text');
    expect(insertCall?.[1]).toContain('The launch date is October 4.');
  });

  it('returns 409 and does not extract or insert when the project is already at the file cap', async () => {
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

  it('returns 400 when byteCount exceeds the largest plan upload', async () => {
    const tooBig = MAX_PLAN_ATTACHMENT_BYTES + 1;
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
    expect(mockExtractProjectKnowledgeFile).not.toHaveBeenCalled();
  });

  it('stores the sealed key rather than the key the presigned url still names', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([{ count: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([KB_FILE_ROW]);

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: UPLOADED_KEY,
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(201);
    expect(mockSealProjectKnowledgeObject).toHaveBeenCalledWith({
      key: UPLOADED_KEY,
      etag: '"etag-1"',
      bytes: Buffer.from('inspected'),
      contentType: 'application/pdf',
    });
    const insertCall = mockNeonQuery.mock.calls.find((call) =>
      String(call?.[0] ?? '').includes('insert into project_knowledge_files'),
    );
    expect(insertCall?.[1]).toContain(SEALED_KEY);
    expect(insertCall?.[1]?.[10]).toBe(JSON.stringify({ private: 'fixture-private' }));
    expect(insertCall?.[1]).not.toContain(UPLOADED_KEY);
  });

  it('refuses a source whose bytes changed between the inspection and the seal', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([{ count: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
    mockSealProjectKnowledgeObject.mockResolvedValue(null);

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: UPLOADED_KEY,
      }),
      routeContext('proj-1'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message ?? '').toMatch(/changed during its safety check/i);
    expect(mockDeleteProjectKnowledgeObject).toHaveBeenCalledWith(UPLOADED_KEY);
    expect(
      mockNeonQuery.mock.calls.some((call) =>
        String(call?.[0] ?? '').includes('insert into project_knowledge_files'),
      ),
    ).toBe(false);
  });

  it('versions a same-name file with new content instead of duplicating it', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([{ count: 1 }]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([KB_FILE_ROW]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockExtractProjectKnowledgeFile.mockResolvedValue({
      extractedText: 'Corrected text.',
      anchors: [],
      objectKey: UPLOADED_KEY,
      etag: '"etag-1"',
    });

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
    expect(String(insertCall?.[0])).toContain('coalesce(max(version), 0) + 1');
    expect(String(insertCall?.[0])).toContain('order by version desc');

    const supersedeCall = mockNeonQuery.mock.calls.find((call) =>
      String(call?.[0] ?? '').includes('set superseded_at = now()'),
    );
    expect(supersedeCall?.[1]).toEqual(['proj-1', 'spec.pdf', 'file-1']);
    expect(String(supersedeCall?.[0] ?? '')).toContain('id <> $3');
  });

  it('inserts and retires inside one transaction that holds the per-name lock first', async () => {
    const order: string[] = [];
    mockTransaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => {
      order.push('begin');
      const result = await run({
        query: (...args: unknown[]) => mockNeonQuery(...args),
        execute: mockTxExecute,
      });
      order.push('commit');
      return result;
    });
    mockTxExecute.mockImplementation(async (sql: string) => {
      if (String(sql).includes('pg_advisory_xact_lock')) order.push('lock');
      return 1;
    });
    mockNeonQuery.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from user_projects')) return [{ id: 'proj-1' }];
      if (text.includes('count(*)')) return [{ count: 1 }];
      if (text.includes('coalesce(sum(k.byte_count)')) return [{ total: 0 }];
      if (text.includes('insert into project_knowledge_files')) {
        order.push('insert');
        return [KB_FILE_ROW];
      }
      if (text.includes('set superseded_at')) order.push('supersede');
      return [];
    });
    mockExtractProjectKnowledgeFile.mockResolvedValue({
      extractedText: 'Corrected text.',
      anchors: [],
      objectKey: UPLOADED_KEY,
      etag: '"etag-1"',
    });

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
    expect(order).toEqual(['begin', 'lock', 'insert', 'supersede', 'commit']);
  });

  it('answers a failed retirement as a failure and not as a created replacement', async () => {
    mockNeonQuery.mockImplementation(async (sql: string) => {
      const text = String(sql);
      if (text.includes('from user_projects')) return [{ id: 'proj-1' }];
      if (text.includes('count(*)')) return [{ count: 1 }];
      if (text.includes('coalesce(sum(k.byte_count)')) return [{ total: 0 }];
      if (text.includes('insert into project_knowledge_files')) return [KB_FILE_ROW];
      if (text.includes('set superseded_at')) throw new Error('supersede failed');
      return [];
    });
    mockTransaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ query: (...args: unknown[]) => mockNeonQuery(...args), execute: mockTxExecute }),
    );
    mockExtractProjectKnowledgeFile.mockResolvedValue({
      extractedText: 'Corrected text.',
      anchors: [],
      objectKey: UPLOADED_KEY,
      etag: '"etag-1"',
    });

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

    expect(res.status).toBe(500);
  });

  it('lets a project at its file cap replace a file it already holds', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([
      { count: MAX_PROJECT_KNOWLEDGE_FILES, replaces_current: true },
    ]);
    mockNeonQuery.mockResolvedValueOnce([]);
    mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
    mockNeonQuery.mockResolvedValueOnce([KB_FILE_ROW]);
    mockExtractProjectKnowledgeFile.mockResolvedValue({
      extractedText: 'Corrected text.',
      anchors: [],
      objectKey: UPLOADED_KEY,
      etag: '"etag-1"',
    });

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
  });

  it('still refuses a new file name once the project is at its file cap', async () => {
    mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
    mockNeonQuery.mockResolvedValueOnce([
      { count: MAX_PROJECT_KNOWLEDGE_FILES, replaces_current: false },
    ]);

    const res = await POST(
      makePostRequest('proj-1', {
        fileName: 'other.pdf',
        mimeType: 'application/pdf',
        byteCount: 2048,
        checksumSha256: 'c'.repeat(64),
        sourceSurface: 'web',
        storageUri: 'knowledge-files/projects/proj-1/other.pdf',
      }),
      { params: Promise.resolve({ id: 'proj-1' }) },
    );

    expect(res.status).toBe(409);
    expect(mockExtractProjectKnowledgeFile).not.toHaveBeenCalled();
  });
});
