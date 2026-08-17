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

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
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

import { POST } from '@/app/api/projects/[id]/knowledge-files/route';

const CHECKSUM = 'a'.repeat(64);

function wireInsertPath(summaryOnRow: string | null): void {
  mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
  mockResolveActiveOrganizationId.mockResolvedValue(null);
  mockNeonQuery.mockResolvedValueOnce([{ id: 'proj-1' }]);
  mockNeonQuery.mockResolvedValueOnce([{ count: 0 }]);
  mockNeonQuery.mockResolvedValueOnce([]);
  mockNeonQuery.mockResolvedValueOnce([{ total: 0 }]);
  mockNeonQuery.mockResolvedValueOnce([]);
  mockNeonQuery.mockResolvedValueOnce([
    {
      id: 'file-1',
      project_id: 'proj-1',
      file_name: 'scan.png',
      mime_type: 'image/png',
      byte_count: 1024,
      checksum_sha256: CHECKSUM,
      summary: summaryOnRow,
      source_surface: 'web',
      added_by_user_id: 'user-abc',
      added_at: '2026-05-22T10:00:00Z',
      retention_expires_at: null,
      deleted_at: null,
      storage_uri: 'knowledge-files/projects/proj-1/scan.png',
    },
  ]);
}

function post(fileName: string, mimeType: string): Promise<Response> {
  return POST(
    new NextRequest('http://localhost/api/projects/proj-1/knowledge-files', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileName,
        mimeType,
        byteCount: 1024,
        checksumSha256: CHECKSUM,
        sourceSurface: 'web',
        storageUri: `knowledge-files/projects/proj-1/${fileName}`,
      }),
    }),
    { params: Promise.resolve({ id: 'proj-1' }) },
  ) as unknown as Promise<Response>;
}

function insertParams(): unknown[] {
  const call = mockNeonQuery.mock.calls.find((entry) =>
    String(entry?.[0] ?? '').includes('insert into project_knowledge_files'),
  );
  return (call?.[1] ?? []) as unknown[];
}

describe('POST knowledge-files records why a file has no extracted text', () => {
  beforeEach(() => {
    mockNeonQuery.mockReset();
    mockExtractProjectKnowledgeFile.mockReset();
  });

  it('stores an image-specific not-readable summary instead of a bare null', async () => {
    wireInsertPath('Not readable: text is not extracted from images.');
    mockExtractProjectKnowledgeFile.mockResolvedValue({ extractedText: null });

    const res = await post('scan.png', 'image/png');

    expect(res.status).toBe(201);
    const summary = insertParams()[5];
    expect(summary).toContain('Not readable');
    expect(summary).toContain('images');
  });

  it('stores a not-readable summary for a document that yielded no text', async () => {
    wireInsertPath(null);
    mockExtractProjectKnowledgeFile.mockResolvedValue({ extractedText: null });

    const res = await post('scanned.pdf', 'application/pdf');

    expect(res.status).toBe(201);
    const summary = insertParams()[5];
    expect(summary).toContain('Not readable');
    expect(summary).toContain('no text could be extracted');
  });

  it('leaves the summary null when text was extracted', async () => {
    wireInsertPath(null);
    mockExtractProjectKnowledgeFile.mockResolvedValue({ extractedText: 'Launch is October 4.' });

    const res = await post('launch.txt', 'text/plain');

    expect(res.status).toBe(201);
    expect(insertParams()[5]).toBeNull();
  });
});
