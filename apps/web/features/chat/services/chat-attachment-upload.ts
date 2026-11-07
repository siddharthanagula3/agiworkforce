'use client';

import type { RequestAuthority } from '@/lib/identity/request-authority';
import { getCsrfToken } from '@/lib/client/csrf';
import { createManagedCloudChatAttachmentsClient } from '@agiworkforce/cloud-contracts';
import type { ManagedCloudChatAttachmentUploadOptions } from '@agiworkforce/cloud-contracts';
import type { Attachment } from '@/shared/stores/web-chat-store';
import {
  pictureMetadataUploadRefusal,
  prepareChatAttachments,
} from '@features/chat/lib/attachment-metadata';

export async function uploadChatAttachments(
  files: File[],
  options: ManagedCloudChatAttachmentUploadOptions = {},
  authority?: RequestAuthority,
): Promise<Attachment[]> {
  authority?.assertCurrent();
  const { accepted, refused } = await prepareChatAttachments(files);
  authority?.assertCurrent();
  const unreadable = refused[0];
  if (unreadable) throw new Error(pictureMetadataUploadRefusal(unreadable.filename));

  const csrfToken = await getCsrfToken();
  authority?.assertCurrent();
  const client = createManagedCloudChatAttachmentsClient({
    ...(authority ? {
      sessions: null,
      assertCurrent: authority.assertCurrent,
      getHeaders: async () => ({ Authorization: `Bearer ${await authority.getToken()}` }),
      fetchImpl: (input, init) => authority.fetch(input, { ...init, credentials: 'omit' }),
      uploadFetchImpl: async (input, init) => {
        authority.assertCurrent();
        const response = await fetch(input, {
          ...init,
          credentials: 'omit',
          signal: init?.signal
            ? AbortSignal.any([authority.signal, init.signal])
            : authority.signal,
        });
        authority.assertCurrent();
        return response;
      },
    } : {}),
    decorateMutationHeaders: (headers) => {
      const decorated = new Headers(headers);
      decorated.set('x-csrf-token', csrfToken);
      return decorated;
    },
  });
  const uploaded = await client.upload(accepted, {
    ...options,
    onStatus: (status) => {
      if (!authority || authority.isCurrent()) options.onStatus?.(status);
    },
  });
  authority?.assertCurrent();
  return uploaded.map((attachment) => ({
    id: attachment.id,
    assetId: attachment.id,
    type: attachment.type,
    name: attachment.name,
    size: attachment.byteCount,
    mimeType: attachment.mimeType,
    url: attachment.url,
  }));
}
