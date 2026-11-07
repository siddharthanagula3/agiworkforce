import { describe, expect, it, vi } from 'vitest';
import { setPublishedArtifactAudience } from './publishArtifactClient';

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/client/csrf')>(),
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({
    ...(headers as Record<string, string>), 'x-csrf-token': 'test-token',
  })),
}));

const receipt = {
  token: 'a'.repeat(24), shareUrl: `https://example.test/shared-artifact/${'a'.repeat(24)}`,
  visibility: 'invited', title: 'Page', organizationId: null, updatedAt: '2026-11-07T00:00:00Z',
};

// UNRUN: WEB-PUBLICATION-QUOTA-ADMISSION-01 audience acknowledgement boundary.
describe('setPublishedArtifactAudience confirmed receipts', () => {
  it.each(['public', 'organization', 'invited'] as const)('confirms requested %s audience', async (visibility) => {
    const body = { ...receipt, visibility, organizationId: visibility === 'organization' ? 'org-1' : null };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(setPublishedArtifactAudience(receipt.shareUrl, visibility, fetchImpl)).resolves.toEqual({
      shareUrl: receipt.shareUrl, visibility,
    });
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(`/api/artifacts/publish/${receipt.token}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'test-token' },
      body: JSON.stringify({ visibility }),
    });
  });

  it.each([
    {}, { shareUrl: receipt.shareUrl }, null,
    ...Object.keys(receipt).map((field) => Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== field))),
    { ...receipt, visibility: 'future' }, { ...receipt, visibility: 'public' },
    { ...receipt, token: 'b'.repeat(24), shareUrl: `https://example.test/shared-artifact/${'b'.repeat(24)}` },
    { ...receipt, shareUrl: `https://example.test/shared-artifact/${'b'.repeat(24)}` },
    { ...receipt, shareUrl: 'javascript:alert(1)' },
    { ...receipt, shareUrl: `${receipt.shareUrl}?query=1` },
    { ...receipt, shareUrl: `${receipt.shareUrl}#fragment` },
    { ...receipt, shareUrl: `${receipt.shareUrl}/` },
    { ...receipt, shareUrl: receipt.shareUrl.replace('https://', 'https://user:password@') },
  ])('does not confirm malformed, legacy or mismatched receipt %j', async (body) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(body));
    await expect(setPublishedArtifactAudience(receipt.shareUrl, 'invited', fetchImpl))
      .rejects.toThrow('Audience change could not be confirmed. Access may have changed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports invalid JSON as unconfirmed without rollback or retry', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('{'));
    await expect(setPublishedArtifactAudience(receipt.shareUrl, 'invited', fetchImpl))
      .rejects.toThrow('Audience change could not be confirmed');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403, 409, 429, 500])('rejects HTTP %s with a valid-looking receipt', async (status) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(receipt, { status }));
    await expect(setPublishedArtifactAudience(receipt.shareUrl, 'invited', fetchImpl)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not confirm or retry interrupted transport', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error('interrupted'));
    await expect(setPublishedArtifactAudience(receipt.shareUrl, 'invited', fetchImpl)).rejects.toThrow('interrupted');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
