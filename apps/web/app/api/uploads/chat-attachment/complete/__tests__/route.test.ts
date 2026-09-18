import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const {
  mockDeletePrivateObject,
  mockInsertMediaAsset,
  mockResolveSecretHandlingPolicy,
  mockScanUploadBytes,
  mockRecordAuditEvent,
} = vi.hoisted(() => ({
  mockDeletePrivateObject: vi.fn(async () => undefined),
  mockInsertMediaAsset: vi.fn(async () => 'asset-1'),
  mockResolveSecretHandlingPolicy: vi.fn(async () => ({
    mode: 'block' as 'block' | 'redact' | 'warn',
    organizationId: 'org-1',
  })),
  mockScanUploadBytes: vi.fn(async () => ({
    ok: true,
    findings: [] as { code: string; detail: string }[],
  })),
  mockRecordAuditEvent: vi.fn(async () => undefined),
}));

const BYTES = new TextEncoder().encode('hello world');

vi.mock('@/lib/server/object-storage', () => ({
  deletePrivateObject: mockDeletePrivateObject,
  getBoundedPrivateObject: vi.fn(async () => ({
    data: BYTES,
    contentType: 'text/plain',
    etag: 'etag-1',
  })),
  isPrivateObjectStorageConfigured: () => true,
  copyPrivateObjectIfUnchanged: vi.fn(async () => true),
  StoredObjectTooLargeError: class extends Error {},
}));
vi.mock('@/lib/security/upload-scan', async () => {
  const actual = await vi.importActual<typeof import('@/lib/security/upload-scan')>(
    '@/lib/security/upload-scan',
  );
  return { ...actual, scanUploadBytes: mockScanUploadBytes };
});
vi.mock('@/lib/moderation', () => ({
  matchDenylistedUpload: () => ({ matched: false, sha256: 'sha-1' }),
  recordModerationEvent: vi.fn(),
}));
vi.mock('@/lib/server/media-assets', () => ({
  getMediaAssetByContentHash: vi.fn(async () => null),
  getMediaAssetByStoragePathname: vi.fn(async () => null),
  insertMediaAsset: mockInsertMediaAsset,
}));
vi.mock('@/lib/server/rls-db', () => ({
  getUserScopedDb: vi.fn(async () => ({
    db: { query: vi.fn(async () => []) },
    userId: 'user-1',
    organizationId: 'org-1',
  })),
}));
vi.mock('@/lib/services/organization-policy-gate', () => ({
  resolveSecretHandlingPolicy: mockResolveSecretHandlingPolicy,
}));
vi.mock('@/lib/security-audit', () => ({ recordAuditEvent: mockRecordAuditEvent }));
vi.mock('@/lib/csrf', () => ({ requireCsrfToken: vi.fn(async () => null) }));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: vi.fn(async () => null) }));
vi.mock('@/lib/server/product-analytics', () => ({
  resolveProductAnalyticsSurface: () => 'web',
  trackProductAnalyticsEvent: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { POST } from '../route';

function completeRequest() {
  return new NextRequest('https://app.test/api/uploads/chat-attachment/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      storageKey: 'chat-attachments/user-1/notes.txt',
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      byteCount: BYTES.byteLength,
    }),
  });
}

beforeEach(() => {
  mockDeletePrivateObject.mockClear();
  mockInsertMediaAsset.mockClear();
  mockRecordAuditEvent.mockClear();
  mockScanUploadBytes.mockResolvedValue({ ok: true, findings: [] });
  mockResolveSecretHandlingPolicy.mockResolvedValue({ mode: 'block', organizationId: 'org-1' });
});

describe('POST /api/uploads/chat-attachment/complete', () => {
  it('stores an attachment the workspace policy allows', async () => {
    const response = await POST(completeRequest());

    expect(response.status).toBe(200);
    expect(mockInsertMediaAsset).toHaveBeenCalled();
    expect(mockResolveSecretHandlingPolicy).not.toHaveBeenCalled();
  });

  it('refuses and purges an upload whose reported credential material the workspace blocks', async () => {
    mockScanUploadBytes.mockResolvedValue({
      ok: true,
      findings: [{ code: 'credential_material', detail: 'generic_api_key at byte 12' }],
    });

    const response = await POST(completeRequest());

    expect(response.status).toBe(400);
    expect(mockInsertMediaAsset).not.toHaveBeenCalled();
    expect(mockDeletePrivateObject).toHaveBeenCalledWith('chat-attachments/user-1/notes.txt');
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'dlp_content_blocked',
        detail: expect.objectContaining({ resourceType: 'upload' }),
      }),
    );
  });

  it('refuses the same upload for a workspace that redacts, because bytes cannot be rewritten', async () => {
    mockScanUploadBytes.mockResolvedValue({
      ok: true,
      findings: [{ code: 'credential_material', detail: 'generic_api_key at byte 12' }],
    });
    mockResolveSecretHandlingPolicy.mockResolvedValue({ mode: 'redact', organizationId: 'org-1' });

    expect((await POST(completeRequest())).status).toBe(400);
    expect(mockInsertMediaAsset).not.toHaveBeenCalled();
  });

  it('stores the upload when the workspace only warns', async () => {
    mockScanUploadBytes.mockResolvedValue({
      ok: true,
      findings: [{ code: 'credential_material', detail: 'generic_api_key at byte 12' }],
    });
    mockResolveSecretHandlingPolicy.mockResolvedValue({ mode: 'warn', organizationId: 'org-1' });

    expect((await POST(completeRequest())).status).toBe(200);
    expect(mockInsertMediaAsset).toHaveBeenCalled();
    expect(mockRecordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'secret_detected' }),
    );
  });
});
