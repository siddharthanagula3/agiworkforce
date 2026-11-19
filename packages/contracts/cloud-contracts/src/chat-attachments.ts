import attachmentPolicy from './chat-attachment-policy.json' with { type: 'json' };
import {
  bareMediaType,
  createFileReference,
  documentClassFor,
  fileExtension,
  fileMediaTypeForName,
  isTextLikeFileMediaType,
  toManagedFile,
  type DocumentClass,
  type FileLineage,
  type FileReference,
  type ManagedFile,
  type SourceSurface,
} from '@agiworkforce/types';
import { z } from 'zod';

export const MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH = '/api/uploads/presign';
export const MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH = '/api/uploads/chat-attachment/complete';

export const MAX_CHAT_ATTACHMENT_BYTES = attachmentPolicy.maxBytes;
export const MAX_CHAT_ATTACHMENT_MESSAGE_BYTES = attachmentPolicy.maxMessageBytes;
export const MAX_CHAT_ATTACHMENT_COUNT = attachmentPolicy.maxCount;
/**
 * What a person may attach. The server re-encodes an image before a model
 * sees it (see {@link CHAT_MODEL_IMAGE_ENVELOPE}), so this ceiling is about
 * what people send, not about what one provider route takes.
 */
export const MAX_CHAT_IMAGE_ATTACHMENT_BYTES = attachmentPolicy.maxImageBytes;

/**
 * The largest image every chat route takes inline. A turn can fail over to
 * another route after its images are prepared, so the bound is the strictest
 * route's, not the chosen one's.
 */
export const CHAT_MODEL_IMAGE_ENVELOPE: Readonly<{
  maxBase64Bytes: number;
  maxEdgePixels: number;
  mediaTypes: readonly string[];
}> = Object.freeze({ ...attachmentPolicy.modelImage });

/** The attachment limits a client checks before it uploads; the server enforces its own copy. */
export interface ChatAttachmentLimits {
  maxFileBytes: number;
  maxImageBytes: number;
  maxMessageBytes: number;
  maxFilesPerMessage: number;
  /** Set only when the server offers large files to this client. */
  largeFilesAvailable?: boolean;
  /** Present with the offer; null when the account's storage is unlimited. */
  storageRemainingBytes?: number | null;
  /** Present with the offer: the budget the files within the inline limit share in one message. */
  inlineMessageBytes?: number;
}

export const CHAT_ATTACHMENT_LIMITS: Readonly<ChatAttachmentLimits> = Object.freeze({
  maxFileBytes: MAX_CHAT_ATTACHMENT_BYTES,
  maxImageBytes: MAX_CHAT_IMAGE_ATTACHMENT_BYTES,
  maxMessageBytes: MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  maxFilesPerMessage: MAX_CHAT_ATTACHMENT_COUNT,
});

/**
 * What a client may assume when the server has not told it its limits: the
 * numbers the oldest server a client can meet accepts. A server that sends its
 * limits replaces these whole.
 */
export const CHAT_ATTACHMENT_LIMITS_WITHOUT_HANDSHAKE: Readonly<ChatAttachmentLimits> =
  Object.freeze({
    maxFileBytes: attachmentPolicy.withoutHandshake.maxBytes,
    maxImageBytes: attachmentPolicy.withoutHandshake.maxImageBytes,
    maxMessageBytes: attachmentPolicy.withoutHandshake.maxMessageBytes,
    maxFilesPerMessage: attachmentPolicy.withoutHandshake.maxCount,
  });

/**
 * An offer a client cannot act on safely is refused whole, so a reader that
 * treats a bad block as absent keeps the limits it was built with: without the
 * inline budget a client would let small files fill the large message budget.
 */
export const ChatAttachmentLimitsWireSchema = z
  .object({
    max_file_bytes: z.number().int().positive(),
    max_image_bytes: z.number().int().positive(),
    max_message_bytes: z.number().int().positive(),
    max_files_per_message: z.number().int().positive(),
    large_files_available: z.boolean().optional(),
    storage_remaining_bytes: z.number().int().nonnegative().nullable().optional(),
    inline_message_bytes: z.number().int().positive().optional(),
  })
  .superRefine((wire, context) => {
    if (
      wire.large_files_available === true &&
      (wire.inline_message_bytes === undefined || wire.storage_remaining_bytes === undefined)
    )
      context.addIssue({
        code: 'custom',
        message: 'A large file offer carries the inline budget and the storage left.',
      });
    if (
      wire.inline_message_bytes !== undefined &&
      wire.inline_message_bytes > wire.max_message_bytes
    )
      context.addIssue({
        code: 'custom',
        path: ['inline_message_bytes'],
        message: 'The inline budget cannot pass the message budget.',
      });
  });
export type ChatAttachmentLimitsWire = z.infer<typeof ChatAttachmentLimitsWireSchema>;

export function chatAttachmentLimitsToWire(limits: ChatAttachmentLimits): ChatAttachmentLimitsWire {
  return {
    max_file_bytes: limits.maxFileBytes,
    max_image_bytes: limits.maxImageBytes,
    max_message_bytes: limits.maxMessageBytes,
    max_files_per_message: limits.maxFilesPerMessage,
    ...(limits.largeFilesAvailable === undefined
      ? {}
      : { large_files_available: limits.largeFilesAvailable }),
    ...(limits.storageRemainingBytes === undefined
      ? {}
      : { storage_remaining_bytes: limits.storageRemainingBytes }),
    ...(limits.inlineMessageBytes === undefined
      ? {}
      : { inline_message_bytes: limits.inlineMessageBytes }),
  };
}

export function chatAttachmentLimitsFromWire(wire: ChatAttachmentLimitsWire): ChatAttachmentLimits {
  return {
    maxFileBytes: wire.max_file_bytes,
    maxImageBytes: wire.max_image_bytes,
    maxMessageBytes: wire.max_message_bytes,
    maxFilesPerMessage: wire.max_files_per_message,
    ...(wire.large_files_available === undefined
      ? {}
      : { largeFilesAvailable: wire.large_files_available }),
    ...(wire.storage_remaining_bytes === undefined
      ? {}
      : { storageRemainingBytes: wire.storage_remaining_bytes }),
    ...(wire.inline_message_bytes === undefined
      ? {}
      : { inlineMessageBytes: wire.inline_message_bytes }),
  };
}

type DeepReadonly<T> = T extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T;

function frozenCopy<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy)) as DeepReadonly<T>;
  if (value !== null && typeof value === 'object') {
    return Object.freeze(
      Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, frozenCopy(entry)])),
    ) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}

/**
 * Large chat files: the per-file, per-message and per-kind ceilings, how a
 * file is prepared, what a turn may spend on it and how its intake runs. The
 * inline ceilings above stay what every compiled client uses.
 */
export const CHAT_LARGE_FILE_POLICY = frozenCopy({
  largeFiles: attachmentPolicy.largeFiles,
  kinds: attachmentPolicy.kinds,
  preparation: attachmentPolicy.preparation,
  turnBudget: attachmentPolicy.turnBudget,
  intake: attachmentPolicy.intake,
});
export type ChatLargeFilePolicy = typeof CHAT_LARGE_FILE_POLICY;

export type ChatLargeFilePreparedKind = keyof ChatLargeFilePolicy['kinds'];
/** Images stay on the inline path, so their kind is capped by the inline image ceiling. */
export type ChatLargeFileKind = 'image' | ChatLargeFilePreparedKind;

const NOTEBOOK_MEDIA_TYPE = 'application/x-ipynb+json';
const NOTEBOOK_EXTENSION = 'ipynb';

const PREPARED_KIND_BY_DOCUMENT_CLASS: Readonly<Record<string, ChatLargeFilePreparedKind>> = {
  pdf: 'pdf',
  docx: 'office',
  pptx: 'office',
  xlsx: 'spreadsheet',
  csv: 'delimited',
  tsv: 'delimited',
  html: 'html',
};

function kindOfDocumentClass(documentClass: DocumentClass): ChatLargeFilePreparedKind {
  return PREPARED_KIND_BY_DOCUMENT_CLASS[documentClass.id] ?? 'text';
}

function kindForMediaType(mimeType: string): ChatLargeFileKind | null {
  const mime = bareMediaType(mimeType);
  if (!mime) return null;
  if (isChatImageMimeType(mime)) return 'image';
  if (mime === NOTEBOOK_MEDIA_TYPE) return 'notebook';
  const documentClass = documentClassFor('', mime);
  if (documentClass) return kindOfDocumentClass(documentClass);
  return mime.startsWith('text/') ? 'text' : null;
}

function kindForExtension(fileName: string): ChatLargeFileKind | null {
  const extension = fileExtension(fileName);
  if (!extension) return null;
  if (extension === NOTEBOOK_EXTENSION) return 'notebook';
  if (isChatImageMimeType(fileMediaTypeForName(fileName))) return 'image';
  const documentClass = documentClassFor(fileName, '');
  if (documentClass) return kindOfDocumentClass(documentClass);
  return CHAT_ATTACHMENT_EXTENSIONS.includes(`.${extension}`) ? 'text' : null;
}

function chatLargeFileKindCap(kind: ChatLargeFileKind): number {
  return kind === 'image'
    ? MAX_CHAT_IMAGE_ATTACHMENT_BYTES
    : CHAT_LARGE_FILE_POLICY.kinds[kind].maxBytes;
}

/**
 * The kind whose ceiling holds this file, or null when chat does not accept
 * it. When the declared type and the name disagree, the stricter kind wins, so
 * renaming a file never lifts its ceiling; at an equal ceiling the specific
 * kind beats plain text, because the kind also picks how the file is prepared.
 */
export function chatLargeFileKind(fileName: string, mimeType: string): ChatLargeFileKind | null {
  const resolved = resolveChatAttachmentMimeType(fileName, mimeType);
  if (resolved === null) return null;
  const candidates = [kindForMediaType(resolved), kindForExtension(fileName)].filter(
    (kind): kind is ChatLargeFileKind => kind !== null,
  );
  let strictest: ChatLargeFileKind | null = null;
  for (const kind of candidates) {
    if (strictest === null || isStricterKind(kind, strictest)) strictest = kind;
  }
  return strictest;
}

function isStricterKind(kind: ChatLargeFileKind, than: ChatLargeFileKind): boolean {
  const cap = chatLargeFileKindCap(kind);
  const thanCap = chatLargeFileKindCap(than);
  return cap < thanCap || (cap === thanCap && than === 'text' && kind !== 'text');
}

/** The most bytes one file of this name and type may have when large files are offered. */
export function chatLargeFileKindMaxBytes(fileName: string, mimeType: string): number | null {
  const kind = chatLargeFileKind(fileName, mimeType);
  return kind === null ? null : chatLargeFileKindCap(kind);
}

const BYTES_PER_MEBIBYTE = 1024 * 1024;

function megabytes(bytes: number): number {
  return Math.round((bytes / BYTES_PER_MEBIBYTE) * 10) / 10;
}

export const CHAT_ATTACHMENT_NEEDS_PROJECT_MESSAGE = `Files over ${MAX_CHAT_ATTACHMENT_BYTES / BYTES_PER_MEBIBYTE} MB go into a project, where AGI reads and searches them.`;

export function chatImageTooLargeMessage(
  limits: ChatAttachmentLimits = CHAT_ATTACHMENT_LIMITS,
): string {
  return `Images can be up to ${megabytes(limits.maxImageBytes)} MB each. Attach a smaller image.`;
}

export const CHAT_IMAGE_ATTACHMENT_TOO_LARGE_MESSAGE = chatImageTooLargeMessage();

export const SHARED_ATTACHMENTS_NOT_COPIED =
  'Attached in the shared chat and kept private to the person who shared it:';

export function chatAttachmentSizeLabel(bytes: number): string {
  return `${megabytes(bytes)} MiB`;
}

function isImageMimeType(mimeType: string): boolean {
  return (mimeType.split(';', 1)[0] ?? '').trim().toLowerCase().startsWith('image/');
}

export function chatAttachmentMaxBytes(
  mimeType: string,
  limits: ChatAttachmentLimits = CHAT_ATTACHMENT_LIMITS,
): number {
  return isImageMimeType(mimeType) ? limits.maxImageBytes : limits.maxFileBytes;
}

export function chatAttachmentSizeRefusal(
  fileName: string,
  mimeType: string,
  byteCount: number,
  limits: ChatAttachmentLimits = CHAT_ATTACHMENT_LIMITS,
): string | null {
  if (byteCount <= chatAttachmentMaxBytes(mimeType, limits)) return null;
  return isImageMimeType(mimeType)
    ? `"${fileName}" is too large. ${chatImageTooLargeMessage(limits)}`
    : `"${fileName}" is larger than the ${megabytes(limits.maxFileBytes)} MB chat attachment limit.`;
}

export const CHAT_ATTACHMENT_MIME_TYPES: readonly string[] = attachmentPolicy.mimeTypes;

const CHAT_ATTACHMENT_EXTENSIONS: readonly string[] = attachmentPolicy.extensions;

export function chatAttachmentAcceptAttribute(): string {
  return [...CHAT_ATTACHMENT_MIME_TYPES, ...CHAT_ATTACHMENT_EXTENSIONS].join(',');
}

export function isSupportedChatAttachment(fileName: string, mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  if ((CHAT_ATTACHMENT_MIME_TYPES as readonly string[]).includes(mime)) return true;
  if (mime.startsWith('text/')) return true;
  const lowerName = fileName.trim().toLowerCase();
  return CHAT_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

export function resolveChatAttachmentMimeType(fileName: string, mimeType: string): string | null {
  const normalized = mimeType.trim().toLowerCase();
  if (normalized) return isSupportedChatAttachment(fileName, normalized) ? normalized : null;
  const lowerName = fileName.trim().toLowerCase();
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  if (lowerName.endsWith('.gif')) return 'image/gif';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.ipynb')) return 'application/x-ipynb+json';
  if (lowerName.endsWith('.json')) return 'application/json';
  if (lowerName.endsWith('.xml')) return 'application/xml';
  if (lowerName.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lowerName.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lowerName.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return CHAT_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
    ? 'text/plain'
    : null;
}

export function isChatImageMimeType(mimeType: string): boolean {
  return attachmentPolicy.imageMimeTypes.includes(mimeType.trim().toLowerCase());
}

/**
 * The type a document attachment is described by once it reaches a model.
 *
 * A PDF stays a PDF, because a route with a native file channel reads the
 * bytes. Anything else the accept list admits decodes to characters, so it
 * keeps its own type: a `.csv` announced as `text/csv` tells the model it is
 * looking at rows, which collapsing everything to `text/plain` threw away.
 *
 * The fallback is still `text/plain`, and it is reachable: an extension on the
 * accept list with no recognised media type (`.rs`, `.toml`) arrives labelled
 * that way already. What must never reach it is opaque bytes: an Office
 * package is read into text before this point and arrives as that text, so
 * nothing that fails to decode is ever labelled as though it would.
 */
export function normalizeChatDocumentMimeType(mimeType: string): string {
  const mime = mimeType.trim().toLowerCase();
  if (mime === 'application/pdf') return mime;
  if (isTextLikeFileMediaType(mime)) return mime;
  return 'text/plain';
}

export const ManagedCloudChatAttachmentPresignRequestSchema = z.object({
  kind: z.literal('chat-attachment'),
  fileName: z.string().min(1).max(attachmentPolicy.fileNameMaxLength),
  mimeType: z.string().min(1).max(attachmentPolicy.mimeTypeMaxLength),
  byteCount: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES),
});

export const ManagedCloudChatAttachmentPresignResponseSchema = z.object({
  storageKey: z.string().min(1),
  uploadUrl: z.string().url(),
  uploadMethod: z.literal('PUT'),
  uploadHeaders: z.record(z.string(), z.string()),
});

export const ManagedCloudChatAttachmentCompleteRequestSchema = z.object({
  storageKey: z.string().min(1).max(600),
  fileName: z.string().min(1).max(attachmentPolicy.fileNameMaxLength),
  mimeType: z.string().min(1).max(attachmentPolicy.mimeTypeMaxLength),
  byteCount: z.number().int().positive().max(MAX_CHAT_ATTACHMENT_BYTES),
  /**
   * The conversation the file is being attached to, when it already exists.
   * The server reads its own `is_temporary` from this rather than trusting
   * `temporary`, which only covers a chat that has not been created yet.
   */
  conversationId: z.string().min(1).max(200).optional(),
  /** The composer is in Temporary Chat. Only ever shortens what is kept. */
  temporary: z.boolean().optional(),
});

export const ManagedCloudChatAttachmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  byteCount: z.number().int().positive(),
  type: z.enum(['image', 'file']),
  url: z.string().startsWith(attachmentPolicy.filePathPrefix),
});

export const ManagedCloudChatAttachmentCompleteResponseSchema = z.object({
  attachment: ManagedCloudChatAttachmentSchema,
});

export type ManagedCloudChatAttachment = z.infer<typeof ManagedCloudChatAttachmentSchema>;
export type ManagedCloudChatAttachmentCompleteResponse = z.input<
  typeof ManagedCloudChatAttachmentCompleteResponseSchema
>;

export const ManagedCloudUploadedChatAttachmentsSchema = z
  .array(ManagedCloudChatAttachmentSchema)
  .max(MAX_CHAT_ATTACHMENT_COUNT)
  .superRefine((attachments, context) => {
    const ids = new Set<string>();
    let bytes = 0;
    for (const [index, attachment] of attachments.entries()) {
      bytes += attachment.byteCount;
      if (
        ids.has(attachment.id) ||
        attachment.byteCount > chatAttachmentMaxBytes(attachment.mimeType) ||
        attachment.url !== `${attachmentPolicy.filePathPrefix}${attachment.id}` ||
        attachment.name.length > attachmentPolicy.fileNameMaxLength ||
        attachment.name.includes('/') ||
        attachment.name.includes('\\') ||
        Array.from(attachment.name).some((character) => {
          const code = character.charCodeAt(0);
          return code <= 31 || code === 127;
        }) ||
        attachment.mimeType.length > attachmentPolicy.mimeTypeMaxLength ||
        !isSupportedChatAttachment(attachment.name, attachment.mimeType) ||
        (attachment.type === 'image') !== isChatImageMimeType(attachment.mimeType)
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: 'Invalid uploaded chat attachment reference.',
        });
      ids.add(attachment.id);
    }
    if (bytes > MAX_CHAT_ATTACHMENT_MESSAGE_BYTES)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Uploaded chat attachments exceed their message byte budget.',
      });
  });

export const ManagedCloudChatAttachmentContentPartSchema = z
  .object({
    type: z.literal('file'),
    file: z.object({ asset_id: z.string().uuid() }).strict(),
  })
  .strict();

export type ManagedCloudChatAttachmentContentPart = z.infer<
  typeof ManagedCloudChatAttachmentContentPartSchema
>;

export function chatAttachmentContentPart(
  attachment: ManagedCloudChatAttachment,
): ManagedCloudChatAttachmentContentPart {
  return ManagedCloudChatAttachmentContentPartSchema.parse({
    type: 'file',
    file: { asset_id: attachment.id },
  });
}

/**
 * The canonical reference to an uploaded attachment. A text-like upload is
 * read back as text, so its parse status is pending until an extractor has
 * run; opaque bytes are never parsed and say so.
 */
export function chatAttachmentFileReference(
  attachment: ManagedCloudChatAttachment,
  options: { sourceSurface?: SourceSurface | null; checksumSha256?: string | null } = {},
): FileReference {
  return createFileReference({
    id: attachment.id,
    name: attachment.name,
    mediaType: attachment.mimeType,
    byteCount: attachment.byteCount,
    uri: attachment.url,
    origin: 'upload',
    parseStatus: isTextLikeFileMediaType(attachment.mimeType) ? 'pending' : 'not_applicable',
    checksumSha256: options.checksumSha256 ?? null,
    sourceSurface: options.sourceSurface ?? null,
  });
}

/**
 * The same reference carrying the version and lineage every surface stores it
 * with. An upload is always version 1 of its own chain: it was not derived from
 * anything the platform holds, which is exactly what an empty
 * `derivedFromFileId` says.
 */
export function chatAttachmentManagedFile(
  attachment: ManagedCloudChatAttachment,
  options: {
    sourceSurface?: SourceSurface | null;
    checksumSha256?: string | null;
    lineage?: Partial<FileLineage>;
  } = {},
): ManagedFile {
  return toManagedFile(chatAttachmentFileReference(attachment, options), options.lineage ?? {});
}

export interface DurableChatAttachment {
  id: string;
  assetId: string;
  type: 'image' | 'file';
  name: string;
  size?: number;
  mimeType?: string;
  url?: string;
}

export function durableAttachmentDescriptors(
  attachments:
    readonly (Omit<DurableChatAttachment, 'assetId'> & { assetId?: string })[] | undefined,
): DurableChatAttachment[] | undefined {
  const durable = (attachments ?? []).flatMap((attachment) =>
    attachment.assetId
      ? [
          {
            id: attachment.id,
            assetId: attachment.assetId,
            type: attachment.type,
            name: attachment.name,
            size: attachment.size,
            mimeType: attachment.mimeType,
            url: attachment.url,
          },
        ]
      : [],
  );
  return durable.length ? durable : undefined;
}

export function readPersistedAttachments(value: unknown): DurableChatAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments: DurableChatAttachment[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate['id'] !== 'string' ||
      typeof candidate['assetId'] !== 'string' ||
      (candidate['type'] !== 'image' && candidate['type'] !== 'file') ||
      typeof candidate['name'] !== 'string'
    ) {
      continue;
    }
    attachments.push({
      id: candidate['id'],
      assetId: candidate['assetId'],
      type: candidate['type'],
      name: candidate['name'],
      size: typeof candidate['size'] === 'number' ? candidate['size'] : undefined,
      mimeType: typeof candidate['mimeType'] === 'string' ? candidate['mimeType'] : undefined,
      url: typeof candidate['url'] === 'string' ? candidate['url'] : undefined,
    });
  }
  return attachments.length ? attachments : undefined;
}
