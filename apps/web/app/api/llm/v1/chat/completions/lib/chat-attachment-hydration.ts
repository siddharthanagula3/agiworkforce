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
const MAX_NOTEBOOK_TEXT_CHARS = 200_000;
const NOTEBOOK_MIME_TYPE = 'application/x-ipynb+json';

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

function isNotebookAttachment(filename: string, mimeType: string): boolean {
  return (
    mimeType.trim().toLowerCase() === NOTEBOOK_MIME_TYPE ||
    filename.trim().toLowerCase().endsWith('.ipynb')
  );
}

function joinNotebookSource(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((line) => typeof line === 'string').join('');
  return '';
}

/**
 * A notebook's `outputs[].data` carries rendered images as base64 blobs. Sending the raw
 * file would spend the whole request attachment budget on pixels the model cannot use, so
 * only sources and textual outputs cross the wire.
 */
function extractNotebookText(data: Buffer, filename: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch {
    throw new ChatAttachmentHydrationError(
      400,
      'unreadable_attachment',
      `${filename} is not a readable Jupyter notebook.`,
    );
  }

  const cells = (parsed as { cells?: unknown } | null)?.cells;
  if (!Array.isArray(cells)) {
    throw new ChatAttachmentHydrationError(
      400,
      'unreadable_attachment',
      `${filename} does not contain notebook cells.`,
    );
  }

  const parts: string[] = [];
  for (const rawCell of cells) {
    if (!rawCell || typeof rawCell !== 'object') continue;
    const cell = rawCell as { cell_type?: unknown; source?: unknown; outputs?: unknown };
    const source = joinNotebookSource(cell.source).trim();

    if (cell.cell_type === 'markdown') {
      if (source) parts.push(source);
      continue;
    }
    if (cell.cell_type !== 'code') continue;

    if (source) parts.push(['```', source, '```'].join('\n'));
    if (!Array.isArray(cell.outputs)) continue;

    for (const rawOutput of cell.outputs) {
      if (!rawOutput || typeof rawOutput !== 'object') continue;
      const output = rawOutput as {
        text?: unknown;
        data?: Record<string, unknown>;
        ename?: unknown;
        evalue?: unknown;
      };

      const stream = joinNotebookSource(output.text).trim();
      if (stream) parts.push(`Output:\n${stream}`);

      const plain = joinNotebookSource(output.data?.['text/plain']).trim();
      if (plain) parts.push(`Output:\n${plain}`);

      if (typeof output.ename === 'string' && output.ename) {
        const detail = typeof output.evalue === 'string' ? `: ${output.evalue}` : '';
        parts.push(`Error: ${output.ename}${detail}`);
      }
    }
  }

  const text = parts.join('\n\n').replace(/\r\n?/g, '\n').trim();
  if (text.length <= MAX_NOTEBOOK_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_NOTEBOOK_TEXT_CHARS)}\n\n[Content truncated during extraction.]`;
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

      if (isChatImageMimeType(asset.mimeType)) {
        hydrated.push({
          type: 'image_url',
          image_url: {
            url: `data:${asset.mimeType};base64,${object.data.toString('base64')}`,
          },
        });
        continue;
      }

      if (isNotebookAttachment(filename, asset.mimeType)) {
        const notebookText = extractNotebookText(object.data, filename);
        if (!notebookText) {
          hydrated.push({
            type: 'text',
            text: `[${filename} contains no readable notebook cells]`,
          });
          continue;
        }
        hydrated.push({
          type: 'file',
          file: {
            filename,
            mime_type: 'text/plain',
            file_data: `data:text/plain;base64,${Buffer.from(notebookText, 'utf8').toString('base64')}`,
          },
        });
        continue;
      }

      const mimeType = normalizeChatDocumentMimeType(asset.mimeType);
      hydrated.push({
        type: 'file',
        file: {
          filename,
          mime_type: mimeType,
          file_data: `data:${mimeType};base64,${object.data.toString('base64')}`,
        },
      });
    }

    message.content = hydrated;
  }
}
