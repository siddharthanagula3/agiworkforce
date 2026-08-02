import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  upload: vi.fn(),
  captureBoundary: vi.fn(),
  assertBoundary: vi.fn(),
  subscribeBoundary: vi.fn(),
  unsubscribeBoundary: vi.fn(),
  accountBoundCloudFetch: vi.fn(),
  getAuthHeaders: vi.fn(),
  guardedFetch: vi.fn(),
}));

vi.mock('@agiworkforce/cloud-contracts', () => ({
  createManagedCloudChatAttachmentsClient: mocks.createClient,
}));
vi.mock('../../api/cloudApi', () => ({
  accountBoundCloudFetch: mocks.accountBoundCloudFetch,
  getAuthHeaders: mocks.getAuthHeaders,
}));
vi.mock('../../lib/egressGuard', () => ({ guardedFetch: mocks.guardedFetch }));
vi.mock('../managedCloudBoundary', () => ({
  captureManagedCloudBoundary: mocks.captureBoundary,
  assertManagedCloudBoundary: mocks.assertBoundary,
  subscribeManagedCloudBoundary: mocks.subscribeBoundary,
}));

import { uploadDesktopCloudAttachments } from '../desktopCloudAttachments';

describe('uploadDesktopCloudAttachments boundary cancellation', () => {
  let invalidateBoundary: (() => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateBoundary = undefined;
    mocks.captureBoundary.mockReturnValue({
      accountId: 'account-a',
      sessionEpoch: 7,
      accessToken: 'token-a',
    });
    mocks.subscribeBoundary.mockImplementation((_boundary, listener: () => void) => {
      invalidateBoundary = listener;
      return mocks.unsubscribeBoundary;
    });
    mocks.createClient.mockReturnValue({ upload: mocks.upload });
    mocks.upload.mockImplementation(
      (_files: File[], options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          });
        }),
    );
  });

  it('aborts an in-flight byte upload immediately when account/session authority changes', async () => {
    const pending = uploadDesktopCloudAttachments([
      new File(['private'], 'notes.txt', { type: 'text/plain' }),
    ]);
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());

    invalidateBoundary?.();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.unsubscribeBoundary).toHaveBeenCalledOnce();
    const signal = mocks.upload.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(true);
  });

  it('also forwards explicit caller cancellation and always unsubscribes', async () => {
    const caller = new AbortController();
    const pending = uploadDesktopCloudAttachments(
      [new File(['private'], 'notes.txt', { type: 'text/plain' })],
      caller.signal,
    );
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());

    caller.abort(new DOMException('User canceled upload.', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.unsubscribeBoundary).toHaveBeenCalledOnce();
  });
});
