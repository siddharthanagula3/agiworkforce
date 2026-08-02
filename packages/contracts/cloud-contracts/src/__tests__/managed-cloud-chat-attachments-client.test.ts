import { describe, expect, it, vi } from 'vitest';

import { createManagedCloudChatAttachmentsClient } from '../managed-cloud-chat-attachments-client';

describe('createManagedCloudChatAttachmentsClient', () => {
  it('propagates cancellation through the presign request and stops before storage upload', async () => {
    const controller = new AbortController();
    let capturedSignal: AbortSignal | null | undefined;
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          },
          { once: true },
        );
      });
    });
    const uploadFetchImpl = vi.fn();
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'https://cloud.example',
      getHeaders: () => ({ Authorization: 'Bearer test' }),
      fetchImpl,
      uploadFetchImpl,
    });

    const upload = client.upload([new File(['hello'], 'note.txt', { type: 'text/plain' })], {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    controller.abort();

    await expect(upload).rejects.toMatchObject({ name: 'AbortError' });
    expect(capturedSignal).toBe(controller.signal);
    expect(uploadFetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an already-aborted upload before requesting credentials or egress', async () => {
    const controller = new AbortController();
    controller.abort();
    const getHeaders = vi.fn();
    const fetchImpl = vi.fn();
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'https://cloud.example',
      getHeaders,
      fetchImpl,
    });

    await expect(
      client.upload([new File(['hello'], 'note.txt', { type: 'text/plain' })], {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(getHeaders).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
