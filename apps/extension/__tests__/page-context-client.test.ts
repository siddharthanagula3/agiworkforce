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
  it('says what the daily page-read limit is, in the server words, when it is reached', async () => {
    const resetAt = '2026-11-13T00:00:00.000Z';
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json(
        {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please wait before trying again.',
            reason: 'rate_limit:page-read-account-day',
            retry_after_seconds: 3600,
            reset_at: resetAt,
          },
          rateLimit: { limit: 500, remaining: 0, reset: resetAt, retry_after_seconds: 3600 },
        },
        { status: 429, headers: { 'Retry-After': '3600' } },
      ),
    );
    const failure = await readChromeLinkedPage(result.url, { owner }, { getAuth: auth, fetchImpl })
      .then(() => null)
      .catch((error: unknown) => error as Error);

    expect(failure?.message).toContain('Too many requests. Please wait before trying again.');
    expect(failure?.message).toContain('The limit is 500 page reads.');
    expect(failure?.message).toContain('It resets');
  });

  it('asks the user to try again later when the reader is briefly unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      Response.json(
        { error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' } },
        { status: 503, headers: { 'retry-after': '5' } },
      ),
    );
    await expect(
      readChromeLinkedPage(result.url, { owner }, { getAuth: auth, fetchImpl }),
    ).rejects.toThrow('The page reader is temporarily unavailable. Try again in 5 seconds.');
  });
});
