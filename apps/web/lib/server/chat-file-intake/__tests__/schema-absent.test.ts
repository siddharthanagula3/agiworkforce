// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/logger');
type FileStorageModule = typeof import('@/lib/server/file-storage');
type ProductAnalyticsModule = typeof import('@/lib/server/product-analytics');
type OrganizationPolicyGateModule = typeof import('@/lib/services/organization-policy-gate');
type InfrastructureCostModule = typeof import('@/lib/services/infrastructure-cost');

vi.mock('@/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/server/file-storage', async (importOriginal) => ({
  ...(await importOriginal<FileStorageModule>()),
  assertFileStorageAvailable: vi.fn(),
}));
vi.mock('@/lib/server/product-analytics', async (importOriginal) => ({
  ...(await importOriginal<ProductAnalyticsModule>()),
  trackProductAnalyticsEvent: vi.fn(),
}));
vi.mock('@/lib/services/organization-policy-gate', async (importOriginal) => ({
  ...(await importOriginal<OrganizationPolicyGateModule>()),
  resolveSecretHandlingPolicy: vi.fn(async () => ({ mode: 'block', organizationId: null })),
}));
vi.mock('@/lib/services/infrastructure-cost', async (importOriginal) => ({
  ...(await importOriginal<InfrastructureCostModule>()),
  recordGeneratedArtifactBytes: vi.fn(),
}));

import { completeChatAttachmentUpload } from '@/lib/server/chat-attachment-completion';
import { sealedChatAttachmentPathname } from '@/lib/server/media-storage';
import { createSchemaAbsentDb } from './schema-absent-db';
import {
  memoryObjectStore,
  objectExists,
  PRIVATE_BUCKET,
  stubMemoryObjectStorage,
} from './inline-executor';

const USER_ID = 'user-1';
const STORAGE_KEY = `chat-attachments/${USER_ID}/1731000000000_notesabc12345.txt`;

beforeEach(() => {
  stubMemoryObjectStorage();
});

describe('a small chat file on a database without migration 0422', () => {
  it('is stored through insertMediaAsset exactly as before, and nothing asks for the 0422 schema', async () => {
    await memoryObjectStore().put({
      bucket: PRIVATE_BUCKET,
      key: STORAGE_KEY,
      body: new TextEncoder().encode('hello'),
      contentType: 'text/plain',
    });
    const statements: string[] = [];
    const delegate = vi.fn(async (sql: string) => {
      statements.push(sql);
      return sql.includes('insert into public.media_assets') ? [{ id: 'asset-1' }] : [];
    });
    const db = createSchemaAbsentDb({ query: delegate as never });

    const attachment = await completeChatAttachmentUpload({
      db,
      userId: USER_ID,
      organizationId: null,
      sourceSurface: 'web',
      analyticsSurface: 'web',
      storageKey: STORAGE_KEY,
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      byteCount: 5,
    });

    expect(attachment).toMatchObject({ id: 'asset-1' });
    const insert = statements.find((sql) => sql.includes('insert into public.media_assets'));
    expect(insert).toBeDefined();
    expect(insert).not.toMatch(/scanned_sha256/);
    expect(statements.some((sql) => /chat_file_/.test(sql))).toBe(false);
    expect(await objectExists(sealedChatAttachmentPathname(STORAGE_KEY))).toBe(true);
  });
});
