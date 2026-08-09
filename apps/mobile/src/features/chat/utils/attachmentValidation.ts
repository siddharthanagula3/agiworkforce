/**
 * Attach-time validation for chat attachments (QA 1.3.53 / 2.3.45): reject files
 * the app cannot use — an unsupported type or an oversized file — with a specific
 * reason, up front, instead of silently accepting them and producing an empty
 * "content could not be extracted" stub at send time. Images (handled by
 * OCR / image_url) and any docParser-parseable document (pdf/txt/md/csv/code/
 * text) are accepted.
 *
 * The size ceiling is destination-aware, because the two destinations refuse at
 * different sizes for different reasons:
 *
 *  - Cloud: the send uploads through `api.uploadFile`, whose presign POST goes
 *    out via `guardedFetch` to `${API_URL}/api/uploads/presign`. That route
 *    rejects `byteCount > MAX_CHAT_ATTACHMENT_BYTES` (12 MiB) with a 400
 *    (apps/web/app/api/uploads/presign/route.ts:100).
 *  - Local: `guardedFetch` throws `EgressBlockedError` for any our-cloud host
 *    while the app is in Local mode (lib/egressGuard.ts:170-176), so no upload
 *    can happen at all; `chatExecutionStore.sendMessage` instead builds
 *    `createLocalAttachmentReferences` and the file is read on-device by
 *    docParser / OCR. The 12 MiB cloud contract is not binding here and must
 *    not be applied — only the device-memory ceiling is.
 *
 * That makes `appMode` the exact, not approximate, discriminator: the upload
 * is reachable if and only if `appMode === 'cloud'`.
 */
import { MAX_CHAT_ATTACHMENT_BYTES } from '@agiworkforce/cloud-contracts';
import { isParseableDocument } from '@/services/docParser';

/**
 * Where the send will put a staged file. Structurally identical to
 * `MobileChatAppMode` (the store value callers pass in), declared here so this
 * module stays a leaf — the composer's attach path must not grow an import of
 * the model-picker/app-mode graph just to size a file.
 */
export type AttachmentDestination = 'local' | 'cloud';

/** 25 MB — large enough for real documents/images, small enough to avoid reading
 *  a runaway file fully into memory (docParser base64-reads the whole file).
 *  This is a DEVICE ceiling, so it applies to both destinations. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * 12 MiB — the managed-cloud attachment contract, not a second opinion about
 * memory. `api.uploadFile` refuses at the same number before it even asks
 * (services/api.ts:501), and the presign route refuses again server-side.
 *
 * The composer used to accept up to 25 MB regardless of destination, so a
 * 20 MB file attached in Cloud was admitted, then burned three
 * exponential-backoff retries in `uploadWithRetry`
 * (stores/chat/chatExecutionStore.ts:503) and surfaced "Could not upload …
 * please check your connection" — blaming the network for a deterministic
 * contract rejection. Read from the contract package so this cannot drift
 * from the route again.
 */
export const MAX_CLOUD_ATTACHMENT_BYTES = MAX_CHAT_ATTACHMENT_BYTES;

/**
 * The effective ceiling for one file, given where the send will put it. Both
 * ceilings apply to a cloud send (it is read into memory *and* uploaded), so
 * the smaller one wins. With today's constants that is always the 12 MiB cloud
 * contract; the `Math.min` states the invariant rather than restating the
 * winner, so lowering the device ceiling below 12 MiB stays correct.
 */
export function maxAttachmentBytesFor(destination: AttachmentDestination): number {
  return destination === 'cloud'
    ? Math.min(MAX_ATTACHMENT_BYTES, MAX_CLOUD_ATTACHMENT_BYTES)
    : MAX_ATTACHMENT_BYTES;
}

export interface ValidatableAttachment {
  fileName: string;
  mimeType: string;
  uri: string;
  fileSize?: number;
  /** Pasted-text cards carry inline text and bypass file validation. */
  pastedText?: string;
}

export interface AttachmentRejection {
  fileName: string;
  reason: string;
}

export interface AttachmentValidationResult<T> {
  accepted: T[];
  rejected: AttachmentRejection[];
}

/**
 * @param destination where the send will put this file — pass the live
 * `appMode`. Defaults to the stricter `'cloud'` ceiling so that a caller which
 * has not resolved its destination is never the reason an unsendable file gets
 * staged. The production caller (ChatInput) always passes it.
 */
export function isAcceptableAttachment(
  a: ValidatableAttachment,
  destination: AttachmentDestination = 'cloud',
): true | string {
  if (a.pastedText != null) return true;
  const maxBytes = maxAttachmentBytesFor(destination);
  if (typeof a.fileSize === 'number' && a.fileSize > maxBytes) {
    const mb = Math.floor(maxBytes / (1024 * 1024));
    // Name the real cause. A cloud rejection is the AGI Cloud attachment
    // contract, and the file is still usable on-device — say both, so the
    // user is not left thinking their connection failed.
    return destination === 'cloud'
      ? `“${a.fileName}” is too large to send to AGI Cloud (max ${mb} MB). Switch to Local Mode to use it on this device, or attach a smaller file.`
      : `“${a.fileName}” is too large (max ${mb} MB).`;
  }
  if (a.mimeType.startsWith('image/')) return true;
  if (isParseableDocument(a.uri, a.mimeType)) return true;
  return `“${a.fileName}” isn’t a supported file type. Try an image, PDF, text, CSV, Markdown, or code file.`;
}

export function validateAttachments<T extends ValidatableAttachment>(
  items: T[],
  destination: AttachmentDestination = 'cloud',
): AttachmentValidationResult<T> {
  const accepted: T[] = [];
  const rejected: AttachmentRejection[] = [];
  for (const item of items) {
    const verdict = isAcceptableAttachment(item, destination);
    if (verdict === true) accepted.push(item);
    else rejected.push({ fileName: item.fileName, reason: verdict });
  }
  return { accepted, rejected };
}
