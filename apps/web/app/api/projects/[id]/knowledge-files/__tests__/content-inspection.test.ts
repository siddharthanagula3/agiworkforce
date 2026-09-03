import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

const {
  mockGetClerkAuthUser,
  mockNeonQuery,
  mockGetPrivateObject,
  mockDeletePrivateObject,
  mockDeleteObject,
} = vi.hoisted(() => ({
  mockGetClerkAuthUser: vi.fn(),
  mockNeonQuery: vi.fn(),
  mockGetPrivateObject: vi.fn(),
  mockDeletePrivateObject: vi.fn(),
  mockDeleteObject: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: {
      query: (...args: unknown[]) => mockNeonQuery(...args),
      execute: vi.fn().mockResolvedValue(1),
    },
    userId: (await mockGetClerkAuthUser()).userId,
    organizationId: null,
  })),
}));
vi.mock('@/lib/services/subscription-service', () => ({
  SubscriptionService: { getSubscription: vi.fn(async () => ({ plan_tier: 'pro' })) },
}));
vi.mock('@/lib/server/object-storage', () => ({
  getBoundedObject: vi.fn(),
  getBoundedPrivateObject: mockGetPrivateObject,
  StoredObjectTooLargeError: class StoredObjectTooLargeError extends Error {},
  deleteObject: mockDeleteObject,
  deletePrivateObject: mockDeletePrivateObject,
  isObjectStorageConfigured: () => true,
  isPrivateObjectStorageConfigured: () => true,
  objectKeyFromStorageUri: (value: string) => value,
}));

import { POST } from '@/app/api/projects/[id]/knowledge-files/route';

const PROJECT_ID = 'proj-1';
const STORAGE_URI = `knowledge-files/projects/${PROJECT_ID}/notes-1234.txt`;
const INSERT_SQL_FRAGMENT = 'insert into project_knowledge_files';

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function wireDatabase(): void {
  mockNeonQuery.mockImplementation(async (sql: string) => {
    const text = String(sql);
    if (text.includes('from user_projects')) return [{ id: PROJECT_ID }];
    if (text.includes('count(*)')) return [{ count: 0 }];
    if (text.includes('coalesce(sum(k.byte_count)')) return [{ total: 0 }];
    if (text.includes(INSERT_SQL_FRAGMENT)) {
      return [
        {
          id: 'file-1',
          project_id: PROJECT_ID,
          file_name: 'notes.txt',
          mime_type: 'text/plain',
          byte_count: 5,
          checksum_sha256: 'x',
          source_surface: 'web',
          added_by_user_id: 'user-abc',
          added_at: '2026-08-09T00:00:00Z',
          storage_uri: STORAGE_URI,
        },
      ];
    }
    return [];
  });
}

function post(bytes: Buffer, mimeType: string, fileName: string): Promise<Response> {
  mockGetPrivateObject.mockResolvedValue({ data: bytes, contentType: mimeType });
  const request = new NextRequest(`http://localhost/api/projects/${PROJECT_ID}/knowledge-files`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName,
      mimeType,
      byteCount: bytes.byteLength,
      checksumSha256: sha256(bytes),
      sourceSurface: 'web',
      storageUri: STORAGE_URI,
    }),
  });
  return POST(request, { params: Promise.resolve({ id: PROJECT_ID }) }) as Promise<Response>;
}

function insertWasAttempted(): boolean {
  return mockNeonQuery.mock.calls.some((call) => String(call[0]).includes(INSERT_SQL_FRAGMENT));
}

describe('POST /api/projects/[id]/knowledge-files, content inspection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetClerkAuthUser.mockResolvedValue({ userId: 'user-abc' });
    mockDeletePrivateObject.mockResolvedValue(undefined);
    mockDeleteObject.mockResolvedValue(undefined);
    wireDatabase();
  });

  it('registers a benign text source', async () => {
    const res = await post(Buffer.from('hello', 'utf8'), 'text/plain', 'notes.txt');

    expect(res.status).toBe(201);
    expect(insertWasAttempted()).toBe(true);
    expect(mockDeletePrivateObject).not.toHaveBeenCalled();
  });

  it('rejects an ELF executable disguised as a text source and purges the object', async () => {
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64, 0x41)]);

    const res = await post(elf, 'text/plain', 'notes.txt');

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: { message?: string } };
    expect(json.error?.message).toBe(
      'This file could not be added because its contents failed a safety check.',
    );
    expect(insertWasAttempted()).toBe(false);
    expect(mockDeletePrivateObject).toHaveBeenCalledWith(STORAGE_URI);
  });

  it('rejects a ZIP polyglot declared as a PNG image', async () => {
    const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 0x41)]);

    const res = await post(zip, 'image/png', 'chart.png');

    expect(res.status).toBe(400);
    expect(insertWasAttempted()).toBe(false);
    expect(mockDeletePrivateObject).toHaveBeenCalledWith(STORAGE_URI);
  });

  it('rejects a PDF that embeds JavaScript', async () => {
    const pdf = Buffer.from(
      '%PDF-1.7\n1 0 obj\n<< /OpenAction << /JavaScript (app.alert(1)) >>',
      'utf8',
    );

    const res = await post(pdf, 'application/pdf', 'invoice.pdf');

    expect(res.status).toBe(400);
    expect(insertWasAttempted()).toBe(false);
    expect(mockDeletePrivateObject).toHaveBeenCalledWith(STORAGE_URI);
  });

  it('never leaks which detector fired', async () => {
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(64, 0x41)]);
    const res = await post(elf, 'text/plain', 'notes.txt');
    const body = await res.text();

    expect(body).not.toMatch(/ELF/i);
    expect(body).not.toMatch(/executable/i);
    expect(body).not.toMatch(/type_confusion/);
  });
});
