import 'server-only';

import { readStoredMedia } from '@/lib/server/media-storage';
import { getMediaAssetById } from '@/lib/server/media-assets';
import {
  isChatImageMimeType,
  isSupportedChatAttachment,
  normalizeChatDocumentMimeType,
} from '@/lib/chat-attachment-policy';

const MAX_REQUEST_ATTACHMENT_COUNT = 20;
const MAX_REQUEST_ATTACHMENT_BYTES = 18 * 1024 * 1024;

type AttachmentReferencePart = {
  type: string;
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
  file?: {
    asset_id?: string;
    filename?: string;
    mime_type?: string;
    file_data?: string;
  };
};

type HydratableMessage = {
  role: string;
  content: string | AttachmentReferencePart[];
};

export class ChatAttachmentHydrationError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ChatAttachmentHydrationError';
  }
}

const ATTACHMENT_UNAVAILABLE_PLACEHOLDER =
  '[attachment unavailable \u2014 it was deleted from your Library]';

function filenameFromMetadata(metadata: Record<string, unknown>, fallback: string): string {
  const filename = metadata['filename'];
  return typeof filename === 'string' && filename.trim() ? filename.trim() : fallback;
}

export async function hydrateChatAttachments(
  messages: HydratableMessage[],
  userId: string,
): Promise<void> {
  let attachmentCount = 0;
  let totalBytes = 0;

  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    const hydrated: AttachmentReferencePart[] = [];

    for (const part of message.content) {
      const assetId = part.file?.asset_id;
      if (part.type !== 'file' || !assetId) {
        hydrated.push(part);
        continue;
      }
      if (message.role !== 'user') {
        throw new ChatAttachmentHydrationError(
          400,
          'invalid_attachment_role',
          'Only user messages can include file attachments.',
        );
      }

      attachmentCount += 1;
      if (attachmentCount > MAX_REQUEST_ATTACHMENT_COUNT) {
        throw new ChatAttachmentHydrationError(
          413,
          'too_many_attachments',
          `A chat request can include at most ${MAX_REQUEST_ATTACHMENT_COUNT} stored attachments.`,
        );
      }

      const asset = await getMediaAssetById(assetId);

      if (asset && asset.userId !== userId) {
        throw new ChatAttachmentHydrationError(
          404,
          'attachment_not_found',
          'An attached file is unavailable or does not belong to this account.',
        );
      }

      if (!asset || asset.deletedAt || !asset.storagePathname) {
        hydrated.push({
          type: 'text',
          text: ATTACHMENT_UNAVAILABLE_PLACEHOLDER,
        });
        continue;
      }
      const filename = filenameFromMetadata(asset.metadata, `attachment-${asset.id}`);
      if (!isSupportedChatAttachment(filename, asset.mimeType)) {
        throw new ChatAttachmentHydrationError(
          400,
          'unsupported_attachment',
          `${filename} is not a supported chat attachment.`,
        );
      }

      const object = await readStoredMedia(asset.storagePathname);
      if (!object) {
        throw new ChatAttachmentHydrationError(
          404,
          'attachment_bytes_missing',
          `${filename} is registered but its stored bytes are missing.`,
        );
      }
      if (asset.byteSize != null && object.data.byteLength !== asset.byteSize) {
        throw new ChatAttachmentHydrationError(
          409,
          'attachment_size_mismatch',
          `${filename} failed its storage integrity check.`,
        );
      }
      totalBytes += object.data.byteLength;
      if (totalBytes > MAX_REQUEST_ATTACHMENT_BYTES) {
        throw new ChatAttachmentHydrationError(
          413,
          'attachment_context_too_large',
          'Stored attachments in this conversation exceed the 18 MiB provider-safe request limit.',
        );
      }

      const encoded = object.data.toString('base64');
      if (isChatImageMimeType(asset.mimeType)) {
        hydrated.push({
          type: 'image_url',
          image_url: { url: `data:${asset.mimeType};base64,${encoded}` },
        });
      } else {
        const mimeType = normalizeChatDocumentMimeType(asset.mimeType);
        hydrated.push({
          type: 'file',
          file: {
            filename,
            mime_type: mimeType,
            file_data: `data:${mimeType};base64,${encoded}`,
          },
        });
      }
    }

    message.content = hydrated;
  }
}
