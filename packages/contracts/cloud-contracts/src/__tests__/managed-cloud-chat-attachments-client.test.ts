import { describe, expect, it, vi } from 'vitest';

import { MAX_CHAT_ATTACHMENT_MESSAGE_BYTES, chatAttachmentSizeLabel } from '../chat-attachments';
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

  it('refuses files over the per-message total before any request, naming that total', async () => {
    const fetchImpl = vi.fn();
    const client = createManagedCloudChatAttachmentsClient({
      baseUrl: 'https://cloud.example',
      fetchImpl,
    });
    const half = Math.floor(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES / 2) + 1;
    const files = ['first.pdf', 'second.pdf'].map(
      (name) => new File([new Uint8Array(half)], name, { type: 'application/pdf' }),
    );

    await expect(client.upload(files)).rejects.toThrow(
      `Chat attachments are limited to ${chatAttachmentSizeLabel(MAX_CHAT_ATTACHMENT_MESSAGE_BYTES)} total per message.`,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('chatAttachmentSizeLabel', () => {
  it('names a byte count in mebibytes', () => {
    expect(chatAttachmentSizeLabel(12 * 1024 * 1024)).toBe('12 MiB');
    expect(chatAttachmentSizeLabel(2.5 * 1024 * 1024)).toBe('2.5 MiB');
  });
});
