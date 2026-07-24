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
  upload(files: File[]): Promise<ManagedCloudChatAttachment[]>;
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

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
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

  async function post(path: string, body: unknown): Promise<Response> {
    return fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers: await mutationHeaders(),
      credentials: 'include',
      body: JSON.stringify(body),
    });
  }

  return {
    async upload(files) {
      if (files.length > MAX_CHAT_ATTACHMENT_COUNT) {
        throw new Error(`Attach at most ${MAX_CHAT_ATTACHMENT_COUNT} files per message.`);
      }
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      if (totalBytes > MAX_CHAT_ATTACHMENT_BYTES) {
        throw new Error('Chat attachments are limited to 12 MiB total per message.');
      }

      const uploaded: ManagedCloudChatAttachment[] = [];
      for (const file of files) {
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
