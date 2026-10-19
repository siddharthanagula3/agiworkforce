import { describe, expect, it, vi } from 'vitest';
import { publishEdgeAddons } from '../scripts/publish-edge-addons.mjs';

const product = '0f3c2a1b-1111-4222-8333-444455556666';
const client = '9a8b7c6d-1111-4222-8333-444455556666';

function accepted(operationId: string) {
  return new Response(null, { status: 202, headers: { location: operationId } });
}

function status(value: string, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ id: 'op', status: value, ...extra }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function options(fetchImpl: typeof fetch) {
  return {
    apiKey: 'edge-api-key',
    clientId: client,
    productId: product,
    notes: 'AGI Workforce 1.2.0',
    packageBytes: Buffer.from('verified zip bytes'),
    fetchImpl,
    sleep: vi.fn(async () => undefined),
  };
}

describe('Edge Add-ons publisher', () => {
  it('uploads the package, waits for it, then submits the draft with the v1.1 headers', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(accepted('upload-op'))
      .mockResolvedValueOnce(status('InProgress'))
      .mockResolvedValueOnce(status('Succeeded'))
      .mockResolvedValueOnce(accepted('publish-op'))
      .mockResolvedValueOnce(status('Succeeded', { message: 'Successfully created submission' }));

    await expect(publishEdgeAddons(options(fetchImpl))).resolves.toEqual({
      outcome: 'submitted',
      message: 'Successfully created submission',
    });
    const calls = fetchImpl.mock.calls.map(([url, init]) => [String(url), init?.method ?? 'GET']);
    const base = `https://api.addons.microsoftedge.microsoft.com/v1/products/${product}/submissions`;
    expect(calls).toEqual([
      [`${base}/draft/package`, 'POST'],
      [`${base}/draft/package/operations/upload-op`, 'GET'],
      [`${base}/draft/package/operations/upload-op`, 'GET'],
      [base, 'POST'],
      [`${base}/operations/publish-op`, 'GET'],
    ]);
    const uploadHeaders = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(uploadHeaders).toEqual({
      Authorization: 'ApiKey edge-api-key',
      'X-ClientID': client,
      'Content-Type': 'application/zip',
    });
  });

  it('stops with the store’s reason when publishing is refused', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(accepted('upload-op'))
      .mockResolvedValueOnce(status('Succeeded'))
      .mockResolvedValueOnce(accepted('publish-op'))
      .mockResolvedValueOnce(
        status('Failed', { errorCode: 'InProgressSubmission', message: 'Submission in progress' }),
      );
    await expect(publishEdgeAddons(options(fetchImpl))).rejects.toThrow(
      'Edge Add-ons publish failed: InProgressSubmission; Submission in progress',
    );
  });

  it('refuses to start without well-formed credentials', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      publishEdgeAddons({ ...options(fetchImpl), productId: 'not-a-guid' }),
    ).rejects.toThrow('EDGE_PRODUCT_ID is missing or malformed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
