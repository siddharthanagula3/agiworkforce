import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  assertResolvedPublicHostname: vi.fn(async (..._args: unknown[]) => undefined),
  pinnedPublicFetch: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/neon-db', () => ({
  getNeonDb: () => ({
    query: (...args: unknown[]) => mocks.query(...args),
    execute: (...args: unknown[]) => mocks.execute(...args),
  }),
}));
vi.mock('@/lib/egress-policy', () => ({
  assertResolvedPublicHostname: (...args: unknown[]) => mocks.assertResolvedPublicHostname(...args),
  pinnedPublicFetch: (...args: unknown[]) => mocks.pinnedPublicFetch(...args),
}));

import { getIconForUrl } from '@/lib/connectors/directory/icon-fetch';

function streamResponse(bytes: Uint8Array, headers: Record<string, string>): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers });
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);

describe('getIconForUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertResolvedPublicHostname.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue([]);
  });

  it('fetches, caches and returns an allowed icon within the size cap', async () => {
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(PNG_BYTES, {
        'content-type': 'image/png',
        'content-length': String(PNG_BYTES.byteLength),
      }),
    );

    const icon = await getIconForUrl('https://cdn.example.com/icon.png');

    expect(icon?.contentType).toBe('image/png');
    expect(Buffer.from(icon?.base64 ?? '', 'base64')).toEqual(Buffer.from(PNG_BYTES));
  });

  it('rejects a disallowed content type', async () => {
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(new Uint8Array([1, 2, 3]), { 'content-type': 'application/octet-stream' }),
    );

    await expect(getIconForUrl('https://cdn.example.com/icon.bin')).resolves.toBeNull();
  });

  it('rejects a declared content-length over the size cap', async () => {
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(PNG_BYTES, { 'content-type': 'image/png', 'content-length': '999999999' }),
    );

    await expect(getIconForUrl('https://cdn.example.com/huge.png')).resolves.toBeNull();
  });

  it('rejects a stream that exceeds the size cap even with no declared content-length', async () => {
    const oversized = new Uint8Array(70_000).fill(1);
    mocks.pinnedPublicFetch.mockResolvedValueOnce(
      streamResponse(oversized, { 'content-type': 'image/png' }),
    );

    await expect(getIconForUrl('https://cdn.example.com/oversized.png')).resolves.toBeNull();
  });

  it('never fetches when the egress guard rejects the hostname', async () => {
    mocks.assertResolvedPublicHostname.mockRejectedValueOnce(new Error('internal host'));

    await expect(getIconForUrl('https://169.254.169.254/icon.png')).resolves.toBeNull();
    expect(mocks.pinnedPublicFetch).not.toHaveBeenCalled();
  });

  it('reuses a cached icon instead of fetching again', async () => {
    mocks.query.mockResolvedValueOnce([
      {
        value: JSON.stringify({ contentType: 'image/png', base64: 'AAAA' }),
        stamp: '1',
        expires_at_ms: String(Date.now() + 60_000),
        scope: 'public',
      },
    ]);

    const icon = await getIconForUrl('https://cdn.example.com/cached.png');

    expect(icon).toEqual({ contentType: 'image/png', base64: 'AAAA' });
    expect(mocks.pinnedPublicFetch).not.toHaveBeenCalled();
  });
});
