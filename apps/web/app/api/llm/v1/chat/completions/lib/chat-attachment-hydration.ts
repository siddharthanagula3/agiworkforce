import 'server-only';

import { readStoredMedia } from '@/lib/server/media-storage';
import { getMediaAssetById } from '@/lib/server/media-assets';
import { getNeonDb } from '@/lib/server/neon-db';
import { StoredObjectTooLargeError } from '@/lib/server/object-storage';
import {
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  isChatImageMimeType,
  isSupportedChatAttachment,
  normalizeChatDocumentMimeType,
  unavailableChatAttachmentNote,
  type ChatAttachmentUnavailableReason,
} from '@/lib/chat-attachment-policy';
import {
  extractOfficeDocumentText,
  officeDocumentKind,
  OfficeDocumentUnreadableError,
} from '@/lib/server/office-document-text';
import {
  extractPdfAttachmentContent,
  PdfAttachmentUnreadableError,
} from '@/lib/server/pdf-attachment-content';
import { untrustedDocumentText } from '@/lib/server/untrusted-document-text';
import { truncateExtractedText, wasExtractionTruncated } from '@/lib/server/extraction-truncation';
import { withSpan } from '@/lib/observability/span';
import type { TurnAttachment } from '@/lib/e2b/attachment-staging';
import type { ImageDetailValue } from './image-detail';
import { markNativeDocument, type NativeDocument } from './media-input';
import { ModelImageUnreadableError, prepareModelImage } from './model-image';
import { mapWithConcurrency } from './tool-loop';

const MAX_NOTEBOOK_TEXT_CHARS = 200_000;
const NOTEBOOK_MIME_TYPE = 'application/x-ipynb+json';
const PDF_MIME_TYPE = 'application/pdf';
export const MAX_PARALLEL_ATTACHMENT_FETCHES = 4;

export type AttachmentReferencePart = {
  type: string;
  text?: string;
  image_url?: { url: string; detail?: ImageDetailValue };
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
 * the request would throw away the user's question and every other attachment
 * with it, and name none of them, so each failure becomes a note the model can
 * answer around.
 *
 * A file attached on an earlier turn is weaker still: the reader cannot act on
 * it at all, because the message carrying it has already been sent, and a
 * stored blob that rotted would fail every later turn the same way. So a
 * historical failure never reaches the reader as an error - it degrades to this
 * note and the turn proceeds. Only the turn being sent right now can still fail,
 * because that is the only one whose files the reader can still change.
 */

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
 * part, not in text the model necessarily reads back to the user, so a model
 * can describe two files' contents and still not name the one whose part-level
 * filename it never surfaced. Every resolved
 * attachment gets this same plain-text line first, so the model always has the
 * name and type in the context it actually reads, independent of how any given
 * provider exposes (or drops) file-part metadata.
 */
function attachmentContextHeader(filename: string, mimeType: string): AttachmentReferencePart {
  return { type: 'text', text: `[attached file: ${filename} (${mimeType})]` };
}

/**
 * Text pulled out of a package the provider cannot open itself - a notebook's
 * cells, an Office document's paragraphs, rows and slides - travels as a file
 * part so every route that has a document channel keeps the filename with it.
 */
function textDocumentParts(filename: string, text: string): AttachmentReferencePart[] {
  // Fenced here rather than in the extractors: project knowledge anchors offsets
  // into the raw extracted text, and a preamble would shift every one of them.
  const fenced = untrustedDocumentText(filename, text);
  return [
    {
      type: 'file',
      file: {
        filename,
        mime_type: 'text/plain',
        file_data: `data:text/plain;base64,${Buffer.from(fenced, 'utf8').toString('base64')}`,
      },
    },
  ];
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
  return truncateExtractedText(text, MAX_NOTEBOOK_TEXT_CHARS);
}

export type AttachmentSlot = {
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

export type ResolvedMediaAsset = NonNullable<Awaited<ReturnType<typeof getMediaAssetById>>>;
type ResolvedStoredMedia = NonNullable<Awaited<ReturnType<typeof readStoredMedia>>>;

export type OversizeAttachmentReason = 'over_file_limit' | 'over_message_budget';

export type OversizeAttachmentResolution =
  | { kind: 'refuse' }
  | { kind: 'note'; reason: ChatAttachmentUnavailableReason }
  | { kind: 'parts'; parts: AttachmentReferencePart[] };

export type OversizeAttachmentResolver = (input: {
  slot: AttachmentSlot;
  asset: ResolvedMediaAsset;
  turn: 'live' | 'history';
  reason: OversizeAttachmentReason;
}) => Promise<OversizeAttachmentResolution>;

export interface HydrateChatAttachmentsOptions {
  resolveOversizeAttachment?: OversizeAttachmentResolver;
}

export const defaultOversizeAttachmentResolver: OversizeAttachmentResolver = async ({ turn }) =>
  turn === 'live' ? { kind: 'refuse' } : { kind: 'note', reason: 'over_budget' };

type AttachmentLookupOutcome =
  | { readonly kind: 'foreign' }
  | { readonly kind: 'removed'; readonly filename: string }
  | { readonly kind: 'unsupported'; readonly filename: string }
  | {
      readonly kind: 'candidate';
      readonly filename: string;
      readonly asset: ResolvedMediaAsset;
      readonly pathname: string;
    };

type StoredAttachmentRead =
  | { readonly kind: 'unread' }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'too_large'; readonly reason: OversizeAttachmentReason }
  | { readonly kind: 'ready'; readonly object: ResolvedStoredMedia };

type AttachmentCandidate = {
  readonly slot: AttachmentSlot;
  readonly filename: string;
  readonly asset: ResolvedMediaAsset;
  readonly pathname: string;
  read: StoredAttachmentRead;
};

type AdmissionDecision =
  | { readonly kind: 'admitted' }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'oversize'; readonly reason: OversizeAttachmentReason };

type PlannedDecision = AdmissionDecision | { readonly kind: 'pending' };

type PlannedRead = { readonly candidate: AttachmentCandidate; readonly maxBytes: number };

type AdmissionPlan = {
  readonly decisions: readonly PlannedDecision[];
  readonly reads: readonly PlannedRead[];
};

function recordedByteSize(asset: ResolvedMediaAsset): number | null {
  const size = asset.byteSize;
  return size != null && Number.isSafeInteger(size) && size >= 0 ? size : null;
}

function chargeableBytes(candidate: AttachmentCandidate): number | null {
  if (candidate.read.kind === 'ready') return candidate.read.object.data.byteLength;
  return recordedByteSize(candidate.asset);
}

/**
 * Charges in `ordered` sequence, as the read-then-charge loop this replaced
 * did. A file proved unreadable is never charged, so a later file that fits
 * only without it is admitted when this runs again.
 *
 * A file with no usable recorded size cannot be charged until it is read, and
 * every decision after it waits on that size. It is read only once every
 * admitted file before it is ready, so the budget left before it is final,
 * and only up to that budget: a larger object fails the bounded read without
 * being held, and is over the budget wherever the later files land.
 */
function planAdmissions(candidates: readonly AttachmentCandidate[]): AdmissionPlan {
  let totalBytes = 0;
  let admittedUnread = false;
  let unsizedBound: number | null = null;
  let waiting = false;
  const reads: PlannedRead[] = [];

  const decisions = candidates.map((candidate): PlannedDecision => {
    if (candidate.read.kind === 'unreadable') return { kind: 'unreadable' };
    if (candidate.read.kind === 'too_large') {
      return { kind: 'oversize', reason: candidate.read.reason };
    }
    const bytes = chargeableBytes(candidate);
    if (bytes === null) {
      if (!waiting && !admittedUnread) {
        unsizedBound = Math.min(
          MAX_CHAT_ATTACHMENT_BYTES,
          MAX_CHAT_ATTACHMENT_MESSAGE_BYTES - totalBytes,
        );
      }
      if (unsizedBound !== null && reads.length < MAX_PARALLEL_ATTACHMENT_FETCHES) {
        reads.push({ candidate, maxBytes: unsizedBound });
      }
      waiting = true;
      return { kind: 'pending' };
    }
    if (waiting) return { kind: 'pending' };
    if (bytes > MAX_CHAT_ATTACHMENT_BYTES) {
      return { kind: 'oversize', reason: 'over_file_limit' };
    }
    if (totalBytes + bytes > MAX_CHAT_ATTACHMENT_MESSAGE_BYTES) {
      return { kind: 'oversize', reason: 'over_message_budget' };
    }
    totalBytes += bytes;
    if (candidate.read.kind === 'unread') {
      admittedUnread = true;
      reads.push({ candidate, maxBytes: MAX_CHAT_ATTACHMENT_BYTES });
    }
    return { kind: 'admitted' };
  });

  return { decisions, reads };
}

async function lookupAttachment(
  assetId: string,
  userId: string,
  organizationId: string | null,
): Promise<AttachmentLookupOutcome> {
  const asset = await withSpan(
    'chat_attachment.asset_lookup',
    { domain: 'retrieval', attributes: { 'chat_attachment.asset_id': assetId } },
    // Check both owner and admitted workspace before reading any stored bytes.
    () => getMediaAssetById(assetId, getNeonDb()),
  );

  if (asset && (asset.userId !== userId || asset.organizationId !== organizationId)) {
    return { kind: 'foreign' };
  }

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

  return { kind: 'candidate', filename, asset, pathname: asset.storagePathname };
}

/**
 * Every read is bounded by the inline per-file limit or less, so a row whose
 * recorded size is missing or wrong can never pull a larger object into
 * memory. An object that breaks the bound despite a recorded size disagrees
 * with that size, which is the same mismatch an exact-length check reports as
 * unreadable.
 */
async function readAttachment({ candidate, maxBytes }: PlannedRead): Promise<StoredAttachmentRead> {
  const { asset, pathname } = candidate;
  const tooLarge: StoredAttachmentRead =
    asset.byteSize != null
      ? { kind: 'unreadable' }
      : {
          kind: 'too_large',
          reason: maxBytes < MAX_CHAT_ATTACHMENT_BYTES ? 'over_message_budget' : 'over_file_limit',
        };
  let object: ResolvedStoredMedia | null;
  try {
    object = await withSpan(
      'chat_attachment.storage_read',
      {
        domain: 'retrieval',
        attributes: {
          'chat_attachment.asset_id': asset.id,
          'chat_attachment.mime_type': asset.mimeType,
        },
      },
      () => readStoredMedia(pathname, maxBytes),
    );
  } catch (error) {
    if (error instanceof StoredObjectTooLargeError) return tooLarge;
    throw error;
  }
  if (!object) return { kind: 'unreadable' };
  if (object.data.byteLength > maxBytes) return tooLarge;
  if (asset.byteSize != null && object.data.byteLength !== asset.byteSize) {
    return { kind: 'unreadable' };
  }
  return { kind: 'ready', object };
}

async function readCandidates(planned: readonly PlannedRead[]): Promise<void> {
  const reads = await mapWithConcurrency(planned, MAX_PARALLEL_ATTACHMENT_FETCHES, readAttachment);
  planned.forEach(({ candidate }, index) => {
    candidate.read = reads[index]!;
  });
}

function isSettled(decision: PlannedDecision): decision is AdmissionDecision {
  return decision.kind !== 'pending';
}

/**
 * Decides which files fit from their recorded sizes before reading any bytes,
 * then reads only the admitted ones, and files with no usable recorded size
 * only up to the budget left before them. Reading can prove an admitted file
 * unreadable; the decision then runs again without its charge, and only files
 * newly admitted are read. A file read and then pushed out by an earlier one
 * that fits again is let go before any content is built.
 */
async function admitAndReadCandidates(
  candidates: readonly AttachmentCandidate[],
): Promise<AdmissionDecision[]> {
  for (;;) {
    const { decisions, reads } = planAdmissions(candidates);
    if (reads.length > 0) {
      await readCandidates(reads);
      continue;
    }
    const settled = decisions.filter(isSettled);
    if (settled.length !== candidates.length) {
      throw new Error('Attachment admission ended with an undecided file.');
    }
    candidates.forEach((candidate, index) => {
      if (settled[index]!.kind !== 'admitted' && candidate.read.kind === 'ready') {
        candidate.read = { kind: 'unread' };
      }
    });
    return settled;
  }
}

/**
 * Resolves every attachment reference into provider wire content, and returns
 * the bytes of the ones attached to the turn being sent.
 *
 * The returned manifest is what lets the execution sandbox hold the same files
 * the model can see. Only the current turn's attachments are listed: a
 * conversation-scoped sandbox already holds what earlier turns staged, and
 * re-staging history would grow with the conversation.
 */
export async function hydrateChatAttachments(
  messages: HydratableMessage[],
  userId: string,
  onTruncated: ((filename: string) => void) | undefined,
  maxAttachments: number,
  organizationId: string | null,
  options: HydrateChatAttachmentsOptions = {},
): Promise<TurnAttachment[]> {
  const resolveOversizeAttachment =
    options.resolveOversizeAttachment ?? defaultOversizeAttachmentResolver;
  const turnAttachments: TurnAttachment[] = [];
  const slots = collectAttachmentSlots(messages);
  if (slots.length === 0) return turnAttachments;

  let attachmentCount = 0;

  /**
   * The turn being sent goes first so that history cannot spend the budget it
   * needs: charging in message order would let a long conversation starve the
   * file the reader just attached and report that file as too large.
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
    if (attachmentCount > maxAttachments) {
      if (live) {
        throw new ChatAttachmentHydrationError(
          413,
          'too_many_attachments',
          `You can attach up to ${maxAttachments} files to one message.`,
        );
      }
      slot.resolved = [{ type: 'text', text: UNNAMED_UNAVAILABLE_NOTE }];
      continue;
    }

    pending.push(slot);
  }

  /**
   * Lookups and reads are independent per slot, so each runs concurrently
   * under a small cap; the budget and ordering rules apply in `ordered`
   * sequence, so the outcome does not depend on which request lands first.
   */
  const lookups = await mapWithConcurrency(pending, MAX_PARALLEL_ATTACHMENT_FETCHES, (slot) =>
    lookupAttachment(slot.assetId, userId, organizationId),
  );

  const candidates: AttachmentCandidate[] = [];
  const candidateBySlot = new Map<AttachmentSlot, AttachmentCandidate>();
  pending.forEach((slot, index) => {
    const lookup = lookups[index]!;
    if (lookup.kind !== 'candidate') return;
    const candidate: AttachmentCandidate = {
      slot,
      filename: lookup.filename,
      asset: lookup.asset,
      pathname: lookup.pathname,
      read: { kind: 'unread' },
    };
    candidates.push(candidate);
    candidateBySlot.set(slot, candidate);
  });

  const decisions = await admitAndReadCandidates(candidates);
  const decisionBySlot = new Map<AttachmentSlot, AdmissionDecision>();
  candidates.forEach((candidate, index) => decisionBySlot.set(candidate.slot, decisions[index]!));

  for (let index = 0; index < pending.length; index += 1) {
    const slot = pending[index]!;
    const outcome = lookups[index]!;
    const live = slot.fromCurrentTurn;
    const degrade = (filename: string, reason: ChatAttachmentUnavailableReason): void => {
      slot.resolved = [{ type: 'text', text: unavailableChatAttachmentNote(filename, reason) }];
    };

    if (outcome.kind === 'foreign') {
      if (live) {
        throw new ChatAttachmentHydrationError(
          404,
          'attachment_not_found',
          'An attached file is unavailable or does not belong to this account.',
        );
      }
      degrade(`attachment-${slot.assetId}`, 'foreign');
      continue;
    }

    if (outcome.kind === 'removed') {
      degrade(outcome.filename, 'removed');
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
      degrade(outcome.filename, 'unsupported');
      continue;
    }

    const candidate = candidateBySlot.get(slot)!;
    const decision = decisionBySlot.get(slot)!;
    const { filename, asset } = candidate;

    if (decision.kind === 'oversize') {
      const resolution = await resolveOversizeAttachment({
        slot: { ...slot },
        asset,
        turn: live ? 'live' : 'history',
        reason: decision.reason,
      });
      if (resolution.kind === 'parts') {
        slot.resolved = resolution.parts;
        continue;
      }
      if (resolution.kind === 'note') {
        degrade(filename, resolution.reason);
        continue;
      }
      if (live) {
        throw new ChatAttachmentHydrationError(
          413,
          'attachment_context_too_large',
          'The files attached to this message are too large to send together. Remove one and try again.',
        );
      }
      degrade(filename, 'over_budget');
      continue;
    }

    if (candidate.read.kind !== 'ready') {
      degrade(filename, 'unreadable');
      continue;
    }
    const { object } = candidate.read;

    const header = attachmentContextHeader(filename, asset.mimeType);
    // The sandbox gets the file as uploaded, not the shape the provider wire
    // wants: a notebook reaches the model as extracted text, and code that
    // opens a .ipynb needs the real JSON.
    const rawBase64 = object.data.toString('base64');
    const stagedEntry: TurnAttachment = {
      filename,
      mimeType: asset.mimeType,
      base64: rawBase64,
    };
    const stageForSandbox = (): void => {
      if (live) turnAttachments.push(stagedEntry);
    };

    if (isChatImageMimeType(asset.mimeType)) {
      let image: Awaited<ReturnType<typeof prepareModelImage>>;
      try {
        image = await prepareModelImage(object.data, filename);
      } catch (error) {
        if (!(error instanceof ModelImageUnreadableError)) throw error;
        if (live) {
          throw new ChatAttachmentHydrationError(400, 'unreadable_attachment', error.message);
        }
        degrade(filename, 'unreadable');
        continue;
      }
      stageForSandbox();
      slot.resolved = [
        header,
        ...(image.note ? [{ type: 'text', text: image.note }] : []),
        {
          type: 'image_url',
          image_url: {
            url: `data:${image.mimeType};base64,${image.data.toString('base64')}`,
          },
        },
      ];
      continue;
    }

    if (asset.mimeType.trim().toLowerCase() === PDF_MIME_TYPE) {
      let content: Awaited<ReturnType<typeof extractPdfAttachmentContent>>;
      try {
        content = await extractPdfAttachmentContent(object.data, filename);
      } catch (error) {
        if (!(error instanceof PdfAttachmentUnreadableError)) throw error;
        if (live) {
          throw new ChatAttachmentHydrationError(400, 'unreadable_attachment', error.message);
        }
        degrade(filename, 'unreadable');
        continue;
      }
      stageForSandbox();
      if (
        live &&
        (content.pagesOmitted ||
          content.scannedPagesOmitted.length > 0 ||
          wasExtractionTruncated(content.text))
      ) {
        onTruncated?.(filename);
      }
      const pageImageParts = content.pageImages.flatMap((image) => [
        { type: 'text' as const, text: `[Page ${image.page}]` },
        {
          type: 'image_url' as const,
          image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
        },
      ]);
      const omittedScanNote =
        content.scannedPagesOmitted.length > 0
          ? [
              {
                type: 'text' as const,
                text: `[${filename}: scanned ${content.scannedPagesOmitted.length === 1 ? 'page' : 'pages'} ${content.scannedPagesOmitted.join(', ')} did not fit in this message and ${content.scannedPagesOmitted.length === 1 ? 'was' : 'were'} not included]`,
              },
            ]
          : [];
      const nativeDocument: NativeDocument = {
        filename,
        mediaType: PDF_MIME_TYPE,
        data: rawBase64,
        pageCount: content.pageCount,
        extractedTextComplete: !content.pagesOmitted && !wasExtractionTruncated(content.text),
      };
      if (content.text) {
        slot.resolved = markNativeDocument<AttachmentReferencePart>(
          header,
          [...textDocumentParts(filename, content.text), ...pageImageParts, ...omittedScanNote],
          nativeDocument,
        );
        continue;
      }
      if (content.pageImages.length > 0) {
        slot.resolved = markNativeDocument<AttachmentReferencePart>(
          header,
          [
            {
              type: 'text',
              text: `[${filename} has no text layer; its ${content.pageImages.length === 1 ? 'page is' : `${content.pageImages.length} pages are`} attached as images]`,
            },
            ...pageImageParts,
            ...omittedScanNote,
          ],
          nativeDocument,
        );
        continue;
      }
      slot.resolved = markNativeDocument<AttachmentReferencePart>(
        header,
        [{ type: 'text', text: `[${filename} contains no readable text]` }],
        nativeDocument,
      );
      continue;
    }

    const officeKind = officeDocumentKind(filename, asset.mimeType);
    if (officeKind) {
      let officeText: string;
      try {
        officeText = await extractOfficeDocumentText(object.data, filename, officeKind);
      } catch (error) {
        if (!(error instanceof OfficeDocumentUnreadableError)) throw error;
        if (live) {
          throw new ChatAttachmentHydrationError(400, 'unreadable_attachment', error.message);
        }
        degrade(filename, 'unreadable');
        continue;
      }
      stageForSandbox();
      if (live && wasExtractionTruncated(officeText)) onTruncated?.(filename);
      slot.resolved = officeText
        ? [header, ...textDocumentParts(filename, officeText)]
        : [header, { type: 'text', text: `[${filename} contains no readable text]` }];
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
        degrade(filename, 'unreadable');
        continue;
      }
      stageForSandbox();
      if (live && wasExtractionTruncated(notebookText)) onTruncated?.(filename);
      if (!notebookText) {
        slot.resolved = [
          header,
          { type: 'text', text: `[${filename} contains no readable notebook cells]` },
        ];
        continue;
      }
      slot.resolved = [header, ...textDocumentParts(filename, notebookText)];
      continue;
    }

    stageForSandbox();
    const mimeType = normalizeChatDocumentMimeType(asset.mimeType);
    slot.resolved = [
      header,
      {
        type: 'file',
        file: {
          filename,
          mime_type: mimeType,
          file_data: `data:${mimeType};base64,${rawBase64}`,
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

  return turnAttachments;
}
