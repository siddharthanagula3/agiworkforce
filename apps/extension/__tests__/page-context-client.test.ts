import { describe, expect, it, vi } from 'vitest';
import { readChromeLinkedPage } from '../src/features/cloud-bridge/pageContextClient';

const owner = { accountId: 'account-a', authIncarnation: 'session-a' };
const auth = async () => ({ token: 'test-token', owner });
const result = {
  ok: true,
  url: 'https://example.com/',
  title: 'Example',
  content: 'Page',
  truncated: false,
};
describe('account page-context reader', () => {
  it('uses the first-party route and passes cancellation through', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(result));
    const controller = new AbortController();
    await expect(
      readChromeLinkedPage(
        result.url,
        { owner, signal: controller.signal },
        { getAuth: auth, fetchImpl },
      ),
    ).resolves.toEqual(result);
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/api/page-context/read'),
      expect.objectContaining({
        method: 'POST',
        signal: controller.signal,
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    expect(fetchImpl.mock.calls[0]?.[0]).not.toBe(result.url);
  });
  it('never sends through another account', async () => {
    const fetchImpl = vi.fn();
    await expect(
      readChromeLinkedPage(
        result.url,
        { owner },
        {
          getAuth: async () => ({ token: 'other', owner: { ...owner, accountId: 'account-b' } }),
          fetchImpl,
        },
      ),
    ).rejects.toThrow('account changed');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('does not send after cancellation during credential resolution', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn();
    await expect(
      readChromeLinkedPage(
        result.url,
        { owner, signal: controller.signal },
        {
          getAuth: async () => {
            controller.abort();
            return auth();
          },
          fetchImpl,
        },
      ),
    ).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects an invalid reader response', async () => {
    await expect(
      readChromeLinkedPage(
        result.url,
        { owner },
        {
          getAuth: auth,
          fetchImpl: async () => Response.json({ ok: true, content: 'missing source' }),
        },
      ),
    ).rejects.toThrow();
  });
});
