import { stripTrailingSlashes } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_CHAT_ATTACHMENT_COMPLETE_PATH,
  MANAGED_CLOUD_CHAT_ATTACHMENT_PRESIGN_PATH,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  ManagedCloudChatAttachmentCompleteRequestSchema,
  ManagedCloudChatAttachmentCompleteResponseSchema,
  ManagedCloudChatAttachmentPresignRequestSchema,
  ManagedCloudChatAttachmentPresignResponseSchema,
  isSupportedChatAttachment,
  resolveChatAttachmentMimeType,
  type ManagedCloudChatAttachment,
} from './chat-attachments';

export interface ManagedCloudChatAttachmentsClientConfig {
  baseUrl?: string;
  getHeaders?: () => HeadersInit | Promise<HeadersInit>;
  decorateMutationHeaders?: (headers: Headers) => HeadersInit | Promise<HeadersInit>;
  fetchImpl?: typeof globalThis.fetch;
  uploadFetchImpl?: typeof globalThis.fetch;
}

export interface ManagedCloudChatAttachmentsClient {
  upload(files: File[], options?: { signal?: AbortSignal }): Promise<ManagedCloudChatAttachment[]>;
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

function normalizeBaseUrl(baseUrl: string): string {
  return stripTrailingSlashes(baseUrl);
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

  async function mutationHeaders(): Promise<HeadersInit> {
    const headers = new Headers(await config.getHeaders?.());
    headers.set('Content-Type', 'application/json');
    return config.decorateMutationHeaders
      ? config.decorateMutationHeaders(headers)
      : Object.fromEntries(headers.entries());
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
      const { signal } = options;
      assertNotAborted(signal);
      if (files.length > MAX_CHAT_ATTACHMENT_COUNT) {
        throw new Error(`Attach at most ${MAX_CHAT_ATTACHMENT_COUNT} files per message.`);
      }
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_CHAT_ATTACHMENT_BYTES) {
        throw new Error('Chat attachments are limited to 12 MiB total per message.');
      }

      const uploaded: ManagedCloudChatAttachment[] = [];
      for (const file of files) {
        assertNotAborted(signal);
        const mimeType = resolveChatAttachmentMimeType(file.name, file.type);
        if (!mimeType || !isSupportedChatAttachment(file.name, mimeType)) {
          throw new Error(
            `${file.name} is not supported. Attach an image, PDF, or text/code file instead.`,
          );
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
          await presignResponse.json(),
        );
        const uploadUrl = new URL(presign.uploadUrl);
        if (uploadUrl.protocol !== 'https:') {
          throw new Error(`Refusing an insecure upload destination for ${file.name}.`);
        }

        const putResponse = await uploadFetchImpl(uploadUrl.toString(), {
          method: presign.uploadMethod,
          headers: presign.uploadHeaders,
          body: file,
          signal,
        });
        if (!putResponse.ok) {
          throw new ManagedCloudChatAttachmentHttpError(
            `Could not upload ${file.name} to storage.`,
            putResponse.status,
          );
        }

        const completeRequest = ManagedCloudChatAttachmentCompleteRequestSchema.parse({
          storageKey: presign.storageKey,
          fileName: file.name,
          mimeType,
          byteCount: file.size,
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
          await completionResponse.json(),
        );
        uploaded.push(completed.attachment);
      }
      return uploaded;
    },
  };
}
