'use client';

import { z } from 'zod';
import { getCsrfToken } from '@/lib/client/csrf';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  isSupportedChatAttachment,
} from '@/lib/chat-attachment-policy';
import type { Attachment } from '@/shared/stores/web-chat-store';

const PresignResponseSchema = z.object({
  storageKey: z.string().min(1),
  uploadUrl: z.string().url(),
  uploadMethod: z.literal('PUT'),
  uploadHeaders: z.record(z.string(), z.string()),
});

const CompletionResponseSchema = z.object({
  attachment: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    mimeType: z.string().min(1),
    byteCount: z.number().int().positive(),
    type: z.enum(['image', 'file']),
    url: z.string().startsWith('/api/files/'),
  }),
});

async function responseError(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  return payload?.error?.message ?? payload?.message ?? fallback;
}

export async function uploadChatAttachments(files: File[]): Promise<Attachment[]> {
  if (files.length > MAX_CHAT_ATTACHMENT_COUNT) {
    throw new Error(`Attach at most ${MAX_CHAT_ATTACHMENT_COUNT} files per message.`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > MAX_CHAT_ATTACHMENT_BYTES) {
    throw new Error('Chat attachments are limited to 12 MiB total per message.');
  }

  const csrfToken = await getCsrfToken();
  const uploaded: Attachment[] = [];

  for (const file of files) {
    if (!isSupportedChatAttachment(file.name, file.type)) {
      throw new Error(
        `${file.name} is not supported. Attach an image, PDF, or text/code file instead.`,
      );
    }

    const headers = { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken };
    const mimeType = file.type || 'text/plain';
    const presignResponse = await fetch('/api/uploads/presign', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        kind: 'chat-attachment',
        fileName: file.name,
        mimeType,
        byteCount: file.size,
      }),
    });
    if (!presignResponse.ok) {
      throw new Error(await responseError(presignResponse, `Could not upload ${file.name}.`));
    }
    const presign = PresignResponseSchema.parse(await presignResponse.json());

    const putResponse = await fetch(presign.uploadUrl, {
      method: presign.uploadMethod,
      headers: presign.uploadHeaders,
      body: file,
    });
    if (!putResponse.ok) throw new Error(`Could not upload ${file.name} to storage.`);

    const completionResponse = await fetch('/api/uploads/chat-attachment/complete', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        storageKey: presign.storageKey,
        fileName: file.name,
        mimeType,
        byteCount: file.size,
      }),
    });
    if (!completionResponse.ok) {
      throw new Error(await responseError(completionResponse, `Could not verify ${file.name}.`));
    }
    const { attachment } = CompletionResponseSchema.parse(await completionResponse.json());
    uploaded.push({
      id: attachment.id,
      assetId: attachment.id,
      type: attachment.type,
      name: attachment.name,
      size: attachment.byteCount,
      mimeType: attachment.mimeType,
      url: attachment.url,
    });
  }

  return uploaded;
}
