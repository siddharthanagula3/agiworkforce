import 'server-only';

import { readStoredMedia } from '@/lib/server/media-storage';
import { getMediaAssetById } from '@/lib/server/media-assets';
import { getNeonDb } from '@/lib/server/neon-db';
import {
  isChatImageMimeType,
  isSupportedChatAttachment,
  normalizeChatDocumentMimeType,
} from '@/lib/chat-attachment-policy';
import { withSpan } from '@/lib/observability/span';
import { mapWithConcurrency } from './tool-loop';

const MAX_REQUEST_ATTACHMENT_COUNT = 20;
const MAX_REQUEST_ATTACHMENT_BYTES = 18 * 1024 * 1024;
const MAX_NOTEBOOK_TEXT_CHARS = 200_000;
const NOTEBOOK_MIME_TYPE = 'application/x-ipynb+json';
export const MAX_PARALLEL_ATTACHMENT_FETCHES = 4;

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

/**
 * A file the request cannot read is one file, not the whole turn. Rejecting
 * the request threw away the user's question and every other attachment with
 * it, and named none of them - so the reader could not tell which file to
 * remove or re-attach. Each failure becomes a note the model can answer around.
 *
 * A file attached on an earlier turn is weaker still: the reader cannot act on
 * it at all, because the message carrying it has already been sent. Once one
 * stored blob rotted, every later turn re-resolved it and died the same way,
 * and the only way out was abandoning the conversation. So a historical failure
 * never reaches the reader as an error - it degrades to this note and the turn
 * proceeds. Only the turn being sent right now can still fail, because that is
 * the only one whose files the reader can still change.
 */
function unavailableAttachment(filename: string, note: string): string {
  return `[attachment unavailable: ${filename} ${note}]`;
}

const ATTACHMENT_REMOVED_NOTE = 'was removed from your Library. Attach it again to include it.';
const ATTACHMENT_UNREADABLE_NOTE = 'could not be loaded. Attach it again to include it.';
const ATTACHMENT_UNSUPPORTED_NOTE = 'is not a file type this chat can read.';
const ATTACHMENT_FOREIGN_NOTE = 'is not available to this account.';
const ATTACHMENT_OVER_BUDGET_NOTE =
  'was left out because this conversation has reached its attachment limit.';

/**
 * Reached before the asset row is read, so there is no filename to print and
 * inventing one that looks like a filename would be worse than saying less.
 * Stopping here also bounds the lookups a single request can ask for.
 */
const UNNAMED_UNAVAILABLE_NOTE =
  '[an earlier attachment was left out because this conversation has reached its attachment limit]';

function filenameFromMetadata(metadata: Record<string, unknown>, fallback: string): string {
  const filename = metadata['filename'];
  return typeof filename === 'string' && filename.trim() ? filename.trim() : fallback;
}

/**
 * A provider's native file/image block carries the filename as metadata on the
 * part, not in text the model necessarily reads back to the user - the CSV vs
 * TXT gap this closes was a model that could describe both files' contents but
 * not name the one whose part-level filename it never surfaced. Every resolved
 * attachment gets this same plain-text line first, so the model always has the
 * name and type in the context it actually reads, independent of how any given
 * provider exposes (or drops) file-part metadata.
 */
function attachmentContextHeader(filename: string, mimeType: string): AttachmentReferencePart {
  return { type: 'text', text: `[attached file: ${filename} (${mimeType})]` };
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
 *
 * Null means the bytes are not a notebook at all; an empty string means a notebook with
 * nothing to say. The caller separates them because only the first is a failure.
 */
function extractNotebookText(data: Buffer): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch {
    return null;
  }

  const cells = (parsed as { cells?: unknown } | null)?.cells;
  if (!Array.isArray(cells)) return null;

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

type AttachmentSlot = {
  messageIndex: number;
  partIndex: number;
  assetId: string;
  fromCurrentTurn: boolean;
  resolved?: AttachmentReferencePart[];
};

function collectAttachmentSlots(messages: HydratableMessage[]): AttachmentSlot[] {
  let currentTurnIndex = -1;
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === 'user') currentTurnIndex = index;
  }

  const slots: AttachmentSlot[] = [];
  for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
    const content = messages[messageIndex]?.content;
    if (!Array.isArray(content)) continue;
    for (let partIndex = 0; partIndex < content.length; partIndex += 1) {
      const part = content[partIndex];
      const assetId = part?.file?.asset_id;
      if (part?.type !== 'file' || !assetId) continue;
      slots.push({
        messageIndex,
        partIndex,
        assetId,
        fromCurrentTurn: messageIndex === currentTurnIndex,
      });
    }
  }
  return slots;
}

type ResolvedMediaAsset = NonNullable<Awaited<ReturnType<typeof getMediaAssetById>>>;
type ResolvedStoredMedia = NonNullable<Awaited<ReturnType<typeof readStoredMedia>>>;

type AttachmentFetchOutcome =
  | { readonly kind: 'foreign' }
  | { readonly kind: 'removed'; readonly filename: string }
  | { readonly kind: 'unsupported'; readonly filename: string }
  | { readonly kind: 'unreadable'; readonly filename: string }
  | {
      readonly kind: 'ready';
      readonly filename: string;
      readonly asset: ResolvedMediaAsset;
      readonly object: ResolvedStoredMedia;
    };

/**
 * The DB row and the stored bytes are two round trips with nothing between
 * them a caller can use, so they run one after another here - but this whole
 * function runs concurrently across slots, which is where the serial cost
 * actually was.
 */
async function fetchAttachmentPayload(
  assetId: string,
  userId: string,
): Promise<AttachmentFetchOutcome> {
  const asset = await withSpan(
    'chat_attachment.asset_lookup',
    { domain: 'retrieval', attributes: { 'chat_attachment.asset_id': assetId } },
    // Deliberately unconstrained: the row may belong to another account, and
    // telling those two cases apart is what turns a wrong asset id into
    // "not yours" rather than "deleted". The owner check is the line below.
    () => getMediaAssetById(assetId, getNeonDb()),
  );

  if (asset && asset.userId !== userId) return { kind: 'foreign' };

  if (!asset || asset.deletedAt || !asset.storagePathname) {
    return {
      kind: 'removed',
      filename: asset
        ? filenameFromMetadata(asset.metadata, `attachment-${asset.id}`)
        : `attachment-${assetId}`,
    };
  }

  const filename = filenameFromMetadata(asset.metadata, `attachment-${asset.id}`);
  if (!isSupportedChatAttachment(filename, asset.mimeType)) {
    return { kind: 'unsupported', filename };
  }

  const object = await withSpan(
    'chat_attachment.storage_read',
    {
      domain: 'retrieval',
      attributes: {
        'chat_attachment.asset_id': asset.id,
        'chat_attachment.mime_type': asset.mimeType,
      },
    },
    () => readStoredMedia(asset.storagePathname as string),
  );
  if (!object) return { kind: 'unreadable', filename };
  if (asset.byteSize != null && object.data.byteLength !== asset.byteSize) {
    return { kind: 'unreadable', filename };
  }

  return { kind: 'ready', filename, asset, object };
}

export async function hydrateChatAttachments(
  messages: HydratableMessage[],
  userId: string,
): Promise<void> {
  const slots = collectAttachmentSlots(messages);
  if (slots.length === 0) return;

  let attachmentCount = 0;
  let totalBytes = 0;

  /**
   * The turn being sent goes first so that history cannot spend the budget it
   * needs. Charging in message order let a long conversation starve the file
   * the reader just attached, and reported it as that file being too large.
   */
  const ordered = [
    ...slots.filter((slot) => slot.fromCurrentTurn),
    ...slots.filter((slot) => !slot.fromCurrentTurn),
  ];

  const pending: AttachmentSlot[] = [];

  for (const slot of ordered) {
    const live = slot.fromCurrentTurn;

    if (messages[slot.messageIndex]?.role !== 'user') {
      slot.resolved = [{ type: 'text', text: UNNAMED_UNAVAILABLE_NOTE }];
      continue;
    }

    attachmentCount += 1;
    if (attachmentCount > MAX_REQUEST_ATTACHMENT_COUNT) {
      if (live) {
        throw new ChatAttachmentHydrationError(
          413,
          'too_many_attachments',
          `You can attach up to ${MAX_REQUEST_ATTACHMENT_COUNT} files to one message.`,
        );
      }
      slot.resolved = [{ type: 'text', text: UNNAMED_UNAVAILABLE_NOTE }];
      continue;
    }

    pending.push(slot);
  }

  /**
   * Fetching is independent per slot, so it runs concurrently under a small
   * cap; the budget and ordering rules below still apply afterward, in the
   * same `ordered` sequence the serial loop used, so the outcome does not
   * depend on which fetch happens to land first.
   */
  const outcomes = await mapWithConcurrency(pending, MAX_PARALLEL_ATTACHMENT_FETCHES, (slot) =>
    fetchAttachmentPayload(slot.assetId, userId),
  );

  for (let index = 0; index < pending.length; index += 1) {
    const slot = pending[index]!;
    const outcome = outcomes[index]!;
    const live = slot.fromCurrentTurn;
    const degrade = (filename: string, note: string): void => {
      slot.resolved = [{ type: 'text', text: unavailableAttachment(filename, note) }];
    };

    if (outcome.kind === 'foreign') {
      if (live) {
        throw new ChatAttachmentHydrationError(
          404,
          'attachment_not_found',
          'An attached file is unavailable or does not belong to this account.',
        );
      }
      degrade(`attachment-${slot.assetId}`, ATTACHMENT_FOREIGN_NOTE);
      continue;
    }

    if (outcome.kind === 'removed') {
      degrade(outcome.filename, ATTACHMENT_REMOVED_NOTE);
      continue;
    }

    if (outcome.kind === 'unsupported') {
      if (live) {
        throw new ChatAttachmentHydrationError(
          400,
          'unsupported_attachment',
          `${outcome.filename} is not a file type this chat can read.`,
        );
      }
      degrade(outcome.filename, ATTACHMENT_UNSUPPORTED_NOTE);
      continue;
    }

    if (outcome.kind === 'unreadable') {
      degrade(outcome.filename, ATTACHMENT_UNREADABLE_NOTE);
      continue;
    }

    const { filename, asset, object } = outcome;

    if (totalBytes + object.data.byteLength > MAX_REQUEST_ATTACHMENT_BYTES) {
      if (live) {
        throw new ChatAttachmentHydrationError(
          413,
          'attachment_context_too_large',
          'The files attached to this message are too large to send together. Remove one and try again.',
        );
      }
      degrade(filename, ATTACHMENT_OVER_BUDGET_NOTE);
      continue;
    }
    totalBytes += object.data.byteLength;

    const header = attachmentContextHeader(filename, asset.mimeType);

    if (isChatImageMimeType(asset.mimeType)) {
      slot.resolved = [
        header,
        {
          type: 'image_url',
          image_url: {
            url: `data:${asset.mimeType};base64,${object.data.toString('base64')}`,
          },
        },
      ];
      continue;
    }

    if (isNotebookAttachment(filename, asset.mimeType)) {
      const notebookText = extractNotebookText(object.data);
      if (notebookText === null) {
        if (live) {
          throw new ChatAttachmentHydrationError(
            400,
            'unreadable_attachment',
            `${filename} is not a readable Jupyter notebook.`,
          );
        }
        degrade(filename, ATTACHMENT_UNREADABLE_NOTE);
        continue;
      }
      if (!notebookText) {
        slot.resolved = [
          header,
          { type: 'text', text: `[${filename} contains no readable notebook cells]` },
        ];
        continue;
      }
      slot.resolved = [
        header,
        {
          type: 'file',
          file: {
            filename,
            mime_type: 'text/plain',
            file_data: `data:text/plain;base64,${Buffer.from(notebookText, 'utf8').toString('base64')}`,
          },
        },
      ];
      continue;
    }

    const mimeType = normalizeChatDocumentMimeType(asset.mimeType);
    slot.resolved = [
      header,
      {
        type: 'file',
        file: {
          filename,
          mime_type: mimeType,
          file_data: `data:${mimeType};base64,${object.data.toString('base64')}`,
        },
      },
    ];
  }

  const bySlot = new Map<string, AttachmentSlot>();
  for (const slot of slots) bySlot.set(`${slot.messageIndex}:${slot.partIndex}`, slot);

  for (let messageIndex = 0; messageIndex < messages.length; messageIndex += 1) {
    const message = messages[messageIndex];
    if (!message || !Array.isArray(message.content)) continue;
    message.content = message.content.flatMap(
      (part, partIndex) => bySlot.get(`${messageIndex}:${partIndex}`)?.resolved ?? [part],
    );
  }
}
