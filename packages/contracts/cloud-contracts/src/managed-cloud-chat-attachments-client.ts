import { stripTrailingSlashes } from '@agiworkforce/types';
import {
  CHAT_ATTACHMENT_LIMITS,
  CHAT_LARGE_FILE_POLICY,
  MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH,
  MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
  ManagedCloudChatAttachmentCompleteRequestSchema,
  ManagedCloudChatAttachmentCompleteResponseSchema,
  ManagedCloudChatAttachmentPresignRequestSchema,
  ManagedCloudChatAttachmentPresignResponseSchema,
  chatAttachmentSizeLabel,
  chatAttachmentSizeRefusal,
  chatLargeFileKindMaxBytes,
  isSupportedChatAttachment,
  resolveChatAttachmentMimeType,
  type ChatAttachmentLimits,
  type ManagedCloudChatAttachment,
} from './chat-attachments';
import { sha256HexOfBlob, sha256HexOfBlobInSlices, type IncrementalSha256 } from './file-digest';
import { managedUploadRequestOptions } from './managed-upload';
import {
  ManagedCloudResumableUploadError,
  RESUMABLE_UPLOAD_INTAKE_STATUS_UNREADABLE,
  createManagedCloudResumableUploadClient,
  isResumableUploadUnavailable,
  type ManagedCloudResumableUploadClientConfig,
  type ResumableUploadSessionStore,
} from './managed-cloud-resumable-upload-client';
import { CHAT_LARGE_FILE_UPLOAD_KIND, shouldUploadInParts } from './resumable-uploads';

export type { IncrementalSha256 } from './file-digest';

export interface ManagedCloudChatAttachmentsClientConfig extends Pick<
  ManagedCloudResumableUploadClientConfig,
  'sleep' | 'partConcurrency' | 'visibility'
> {
  baseUrl?: string;
  assertCurrent?: () => void;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
  decorateMutationHeaders?: (headers: Headers) => HeadersInit | Promise<HeadersInit>;
  fetchImpl?: typeof globalThis.fetch;
  uploadFetchImpl?: typeof globalThis.fetch;
  sessions?: ResumableUploadSessionStore | null;
  /**
   * The limits the server gave this client. They only ever lower the ceilings
   * the client checks: the compiled inline ones, or the large file policy when
   * an upload passes `largeFiles`.
   */
  limits?: ChatAttachmentLimits;
  createSha256?: () => IncrementalSha256;
}

export interface ManagedCloudChatAttachmentUploadOptions {
  signal?: AbortSignal;
  /** The conversation receiving the files, when it has already been created. */
  conversationId?: string;
  /** The composer is in Temporary Chat, so the upload is not a Library file. */
  temporary?: boolean;
  /**
   * Set only when the server offered large files to this client: a file over
   * the inline limit is then uploaded as a large chat file and checked before
   * it resolves.
   */
  largeFiles?: boolean;
  onStatus?: (status: ManagedCloudChatAttachmentUploadStatus) => void;
}

export type ManagedCloudChatAttachmentUploadPhase =
  'preparing' | 'uploading' | 'verifying' | 'complete' | 'failed';

export interface ManagedCloudChatAttachmentUploadStatus {
  index: number;
  fileName: string;
  phase: ManagedCloudChatAttachmentUploadPhase;
  error?: string;
  /** False when sending the same file again cannot succeed, such as a refused type or content. */
  retryable?: boolean;
}

export interface ManagedCloudChatAttachmentsClient {
  upload(
    files: File[],
    options?: ManagedCloudChatAttachmentUploadOptions,
  ): Promise<ManagedCloudChatAttachment[]>;
}

export class ManagedCloudChatAttachmentHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ManagedCloudChatAttachmentHttpError';
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Managed Cloud attachment upload was cancelled.');
  error.name = 'AbortError';
  throw error;
}

function lowered(compiled: number, given: number | undefined): number {
  return given !== undefined && Number.isFinite(given) && given >= 0
    ? Math.min(compiled, given)
    : compiled;
}

function takesLargeBranch(file: File, largeFiles: boolean): boolean {
  return largeFiles && file.size > MAX_CHAT_ATTACHMENT_BYTES;
}

function normalizeBaseUrl(baseUrl: string): string {
  return stripTrailingSlashes(baseUrl);
}

const TRANSIENT_HTTP_STATUSES: ReadonlySet<number> = new Set([408, 425, 429]);

export function isRetryableAttachmentUploadError(error: unknown): boolean {
  if (
    error instanceof ManagedCloudResumableUploadError &&
    error.code === RESUMABLE_UPLOAD_INTAKE_STATUS_UNREADABLE
  )
    return false;
  if (error instanceof ManagedCloudResumableUploadError && error.status === 0) return true;
  if (
    error instanceof ManagedCloudChatAttachmentHttpError ||
    error instanceof ManagedCloudResumableUploadError
  ) {
    return error.status >= 500 || TRANSIENT_HTTP_STATUSES.has(error.status);
  }
  return error instanceof TypeError;
}

function reportStatus(
  listener: ManagedCloudChatAttachmentUploadOptions['onStatus'],
  status: ManagedCloudChatAttachmentUploadStatus,
): void {
  try {
    listener?.(status);
  } catch {
    return;
  }
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: unknown } | string;
    message?: unknown;
  } | null;
  const rawError = payload?.error;
  const message =
    typeof rawError === 'string'
      ? rawError
      : rawError && typeof rawError.message === 'string'
        ? rawError.message
        : typeof payload?.message === 'string'
          ? payload.message
          : fallback;
  return new ManagedCloudChatAttachmentHttpError(message, response.status);
}

export function createManagedCloudChatAttachmentsClient(
  config: ManagedCloudChatAttachmentsClientConfig = {},
): ManagedCloudChatAttachmentsClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl ?? '');
  const fetchImpl = config.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const uploadFetchImpl = config.uploadFetchImpl ?? fetchImpl;
  const resumable = createManagedCloudResumableUploadClient({
    ...config,
    fetchImpl,
    uploadFetchImpl,
  });

  async function readJson(response: Response): Promise<unknown> {
    const data: unknown = await response.json();
    config.assertCurrent?.();
    return data;
  }

  async function mutationHeaders(): Promise<HeadersInit> {
    const headers = new Headers(await config.getHeaders?.());
    headers.set('Content-Type', 'application/json');
    return config.decorateMutationHeaders
      ? config.decorateMutationHeaders(headers)
      : Object.fromEntries(headers.entries());
  }

  async function uploadInParts(
    file: File,
    mimeType: string,
    options: ManagedCloudChatAttachmentUploadOptions,
    onCompleting: () => void,
  ): Promise<ManagedCloudChatAttachment | null> {
    const { signal, conversationId, temporary } = options;
    try {
      const completed = await resumable.upload({
        file,
        request: {
          kind: 'chat-attachment',
          fileName: file.name,
          mimeType,
          byteCount: file.size,
          checksumSha256: await sha256HexOfBlob(file),
        },
        completion: {
          ...(conversationId ? { conversationId } : {}),
          ...(temporary ? { temporary } : {}),
        },
        ...(signal ? { signal } : {}),
        onCompleting,
      });
      if (completed.kind !== 'chat-attachment') {
        throw new ManagedCloudChatAttachmentHttpError(`Could not verify ${file.name}.`, 502);
      }
      return completed.attachment;
    } catch (error) {
      if (isResumableUploadUnavailable(error)) return null;
      throw error;
    }
  }

  function requireLargeFileHasher(file: File): () => IncrementalSha256 {
    if (config.createSha256) return config.createSha256;
    throw new Error(
      `${file.name} is larger than ${chatAttachmentSizeLabel(MAX_CHAT_ATTACHMENT_BYTES)}, and this app cannot upload a file that large.`,
    );
  }

  async function uploadLargeFile(
    file: File,
    mimeType: string,
    options: ManagedCloudChatAttachmentUploadOptions,
    onCompleting: () => void,
  ): Promise<ManagedCloudChatAttachment> {
    const { signal, conversationId, temporary } = options;
    const createHasher = requireLargeFileHasher(file);
    const completed = await resumable.upload({
      file,
      request: {
        kind: CHAT_LARGE_FILE_UPLOAD_KIND,
        fileName: file.name,
        mimeType,
        byteCount: file.size,
        checksumSha256: await sha256HexOfBlobInSlices(file, createHasher, signal ? { signal } : {}),
        ...(conversationId ? { conversationId } : {}),
        ...(temporary ? { temporary } : {}),
      },
      ...(signal ? { signal } : {}),
      onCompleting,
    });
    if (completed.kind !== 'chat-attachment') {
      throw new ManagedCloudChatAttachmentHttpError(`Could not verify ${file.name}.`, 502);
    }
    return completed.attachment;
  }

  function assertMessageWithinLimits(files: File[], largeFiles: boolean): void {
    const given = config.limits;
    const ceilings = largeFiles ? CHAT_LARGE_FILE_POLICY.largeFiles : null;
    const maxCount = lowered(
      ceilings?.maxCount ?? MAX_CHAT_ATTACHMENT_COUNT,
      given?.maxFilesPerMessage,
    );
    if (files.length > maxCount) {
      throw new Error(`Attach at most ${maxCount} files per message.`);
    }
    const maxMessageBytes = lowered(
      ceilings?.maxMessageBytes ?? MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
      given?.maxMessageBytes,
    );
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > maxMessageBytes) {
      throw new Error(
        `Chat attachments are limited to ${chatAttachmentSizeLabel(maxMessageBytes)} total per message.`,
      );
    }
    if (!largeFiles) return;
    const inlineMessageBytes = lowered(
      MAX_CHAT_ATTACHMENT_MESSAGE_BYTES,
      given?.inlineMessageBytes,
    );
    const inlineBytes = files
      .filter((file) => file.size <= MAX_CHAT_ATTACHMENT_BYTES)
      .reduce((sum, file) => sum + file.size, 0);
    if (inlineBytes > inlineMessageBytes) {
      throw new Error(
        `Chat attachments are limited to ${chatAttachmentSizeLabel(inlineMessageBytes)} total per message.`,
      );
    }
  }

  function largeFileSizeRefusal(
    fileName: string,
    mimeType: string,
    byteCount: number,
  ): string | null {
    const kindMaxBytes = chatLargeFileKindMaxBytes(fileName, mimeType);
    if (kindMaxBytes === null) {
      return `${fileName} is not supported. Attach an image, PDF, or text/code file instead.`;
    }
    const maxFileBytes = lowered(kindMaxBytes, config.limits?.maxFileBytes);
    return chatAttachmentSizeRefusal(fileName, mimeType, byteCount, {
      ...CHAT_ATTACHMENT_LIMITS,
      maxFileBytes,
      maxImageBytes: Math.min(kindMaxBytes, CHAT_ATTACHMENT_LIMITS.maxImageBytes),
    });
  }

  async function post(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
    assertNotAborted(signal);
    const headers = await mutationHeaders();
    assertNotAborted(signal);
    return fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(body),
      signal,
    });
  }

  return {
    async upload(files, options = {}) {
      const { signal, conversationId, temporary, onStatus } = options;
      const largeFiles = options.largeFiles === true;
      assertNotAborted(signal);
      assertMessageWithinLimits(files, largeFiles);
      for (const file of files) {
        if (takesLargeBranch(file, largeFiles)) requireLargeFileHasher(file);
      }

      const uploaded: ManagedCloudChatAttachment[] = [];
      for (const [index, file] of files.entries()) {
        try {
          assertNotAborted(signal);
          reportStatus(onStatus, { index, fileName: file.name, phase: 'preparing' });
          const mimeType = resolveChatAttachmentMimeType(file.name, file.type);
          if (!mimeType || !isSupportedChatAttachment(file.name, mimeType)) {
            throw new Error(
              `${file.name} is not supported. Attach an image, PDF, or text/code file instead.`,
            );
          }
          const large = takesLargeBranch(file, largeFiles);
          const sizeRefusal = large
            ? largeFileSizeRefusal(file.name, mimeType, file.size)
            : chatAttachmentSizeRefusal(file.name, mimeType, file.size);
          if (sizeRefusal) throw new Error(sizeRefusal);

          if (large) {
            reportStatus(onStatus, { index, fileName: file.name, phase: 'uploading' });
            uploaded.push(
              await uploadLargeFile(file, mimeType, options, () =>
                reportStatus(onStatus, { index, fileName: file.name, phase: 'verifying' }),
              ),
            );
            reportStatus(onStatus, { index, fileName: file.name, phase: 'complete' });
            continue;
          }

          if (shouldUploadInParts(file.size)) {
            reportStatus(onStatus, { index, fileName: file.name, phase: 'uploading' });
            const attachment = await uploadInParts(file, mimeType, options, () =>
              reportStatus(onStatus, { index, fileName: file.name, phase: 'verifying' }),
            );
            if (attachment) {
              uploaded.push(attachment);
              reportStatus(onStatus, { index, fileName: file.name, phase: 'complete' });
              continue;
            }
          }

          const presignRequest = ManagedCloudChatAttachmentPresignRequestSchema.parse({
            kind: 'chat-attachment',
            fileName: file.name,
            mimeType,
            byteCount: file.size,
          });
          const presignResponse = await post(
            MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH,
            presignRequest,
            signal,
          );
          if (!presignResponse.ok) {
            throw await responseError(presignResponse, `Could not upload ${file.name}.`);
          }
          const presign = ManagedCloudChatAttachmentPresignResponseSchema.parse(
            await readJson(presignResponse),
          );
          const uploadUrl = new URL(presign.uploadUrl);
          reportStatus(onStatus, { index, fileName: file.name, phase: 'uploading' });
          const uploadOptions = await managedUploadRequestOptions(
            uploadUrl.toString(),
            presign.uploadHeaders,
            config,
          );
          assertNotAborted(signal);
          const putResponse = await uploadFetchImpl(uploadUrl.toString(), {
            ...uploadOptions,
            method: presign.uploadMethod,
            body: file,
            signal,
          });
          if (!putResponse.ok) {
            throw new ManagedCloudChatAttachmentHttpError(
              `Could not upload ${file.name} to storage.`,
              putResponse.status,
            );
          }

          reportStatus(onStatus, { index, fileName: file.name, phase: 'verifying' });
          const completeRequest = ManagedCloudChatAttachmentCompleteRequestSchema.parse({
            storageKey: presign.storageKey,
            fileName: file.name,
            mimeType,
            byteCount: file.size,
            ...(conversationId ? { conversationId } : {}),
            ...(temporary ? { temporary } : {}),
          });
          const completionResponse = await post(
            MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH,
            completeRequest,
            signal,
          );
          if (!completionResponse.ok) {
            throw await responseError(completionResponse, `Could not verify ${file.name}.`);
          }
          const completed = ManagedCloudChatAttachmentCompleteResponseSchema.parse(
            await readJson(completionResponse),
          );
          uploaded.push(completed.attachment);
          reportStatus(onStatus, { index, fileName: file.name, phase: 'complete' });
        } catch (error) {
          reportStatus(onStatus, {
            index,
            fileName: file.name,
            phase: 'failed',
            error: error instanceof Error ? error.message : `Could not upload ${file.name}.`,
            retryable: isRetryableAttachmentUploadError(error),
          });
          throw error;
        }
      }
      return uploaded;
    },
  };
}
