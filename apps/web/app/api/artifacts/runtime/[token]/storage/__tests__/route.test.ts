import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ARTIFACT_STORAGE_VALUE_LIMIT_BYTES } from '@agiworkforce/cloud-contracts';
type ScanModule0 = typeof import('@/lib/csrf');
type ScanModule1 = typeof import('@/lib/rate-limit');
type ScanModule2 = typeof import('@/lib/api-auth');
type ScanModule3 = typeof import('@/lib/server/rls-db');
type ScanModule4 = typeof import('@/lib/services/artifact-runtime-service');

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/csrf', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  requireCsrfToken: vi.fn(async () => null),
}));
vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<ScanModule1>()),
  withRateLimit: vi.fn(async () => null),
}));
vi.mock('@/lib/api-auth', async (importOriginal) => ({
  ...(await importOriginal<ScanModule2>()),
  assertAccountActive: vi.fn(async () => undefined),
}));
vi.mock('@/lib/server/rls-db', async (importOriginal) => ({
  ...(await importOriginal<ScanModule3>()),
  getUserScopedDb: vi.fn(async () => ({ db: {}, userId: 'user-1', organizationId: null })),
}));
vi.mock('@/lib/services/artifact-runtime-service', async (importOriginal) => ({
  ...(await importOriginal<ScanModule4>()),
  readRunnableArtifact: vi.fn(async () => ({ id: 'artifact-1' })),
  writeArtifactStorageValue: mocks.write,
}));

import { POST } from '../route';

const TOKEN = 'a'.repeat(24);

function saveRequest(value: string): NextRequest {
  const body = JSON.stringify({ op: 'set', key: 'notes', value, shared: false });
  return new NextRequest(`https://app.test/api/artifacts/runtime/${TOKEN}/storage`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    },
    body,
  });
}

describe('POST /api/artifacts/runtime/[token]/storage', () => {
  it('names the saved-value limit when a value is just over it', async () => {
    const response = await POST(saveRequest('x'.repeat(ARTIFACT_STORAGE_VALUE_LIMIT_BYTES + 1)), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(response.status).toBe(413);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('storage_value_too_large');
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
