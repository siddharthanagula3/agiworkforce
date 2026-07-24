'use client';

import { getCsrfToken } from '@/lib/client/csrf';
import { createManagedCloudChatAttachmentsClient } from '@agiworkforce/cloud-contracts';
import type { Attachment } from '@/shared/stores/web-chat-store';

export async function uploadChatAttachments(files: File[]): Promise<Attachment[]> {
  const csrfToken = await getCsrfToken();
  const client = createManagedCloudChatAttachmentsClient({
    decorateMutationHeaders: (headers) => {
      const decorated = new Headers(headers);
      decorated.set('x-csrf-token', csrfToken);
      return decorated;
    },
  });
  return (await client.upload(files)).map((attachment) => ({
    id: attachment.id,
    assetId: attachment.id,
    type: attachment.type,
    name: attachment.name,
    size: attachment.byteCount,
    mimeType: attachment.mimeType,
    url: attachment.url,
  }));
}
