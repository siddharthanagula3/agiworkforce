import {
  createManagedCloudChatAttachmentsClient,
  chatAttachmentFileReference,
  ManagedCloudChatAttachmentSchema,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENT_COUNT,
  resolveChatAttachmentMimeType,
  type ManagedCloudChatAttachment,
  type ManagedCloudChatAttachmentUploadOptions,
} from '@agiworkforce/cloud-contracts';
import { createFileReference, type FileReference } from '@agiworkforce/types';
import { configuredAgiWebOrigin } from '../../lib/webOrigin';
import { platformRequestHeaders } from '../../platformHeaders';
import { getManagedCloudAuthContext } from '../cloud-bridge/freeTrialClient';
import {
  normalizeManagedCloudOwner,
  sameManagedCloudOwner,
  type ManagedCloudOwner,
} from '../cloud-bridge/managedCloudAuthority';

export interface BrowserUploadBinding {
  requestId: string;
  runId: string;
  runGeneration: number;
  tabId: number;
  tabUrl: string;
  targetSignature: string;
  owner: ManagedCloudOwner;
}

export interface BrowserUploadedFileMetadata {
  attachment: ManagedCloudChatAttachment;
  checksumSha256: string;
}

export interface ResolvedBrowserUserFile {
  reference: FileReference;
  bytes: Uint8Array;
}

export interface ResolvedBrowserUpload {
  binding: BrowserUploadBinding;
  files: ResolvedBrowserUserFile[];
}

export interface BrowserUploadOptions {
  signal?: AbortSignal;
  assertCurrent?: () => void | Promise<void>;
  onStatus?: ManagedCloudChatAttachmentUploadOptions['onStatus'];
}

function boundedLabel(value: unknown, cap: number): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > cap) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

export function parseBrowserUploadBinding(value: unknown): BrowserUploadBinding | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const owner = normalizeManagedCloudOwner(input['owner']);
  if (
    !owner ||
    !boundedLabel(input['requestId'], 200) ||
    !boundedLabel(input['runId'], 200) ||
    !Number.isSafeInteger(input['runGeneration']) ||
    Number(input['runGeneration']) < 0 ||
    !Number.isSafeInteger(input['tabId']) ||
    Number(input['tabId']) < 0 ||
    !boundedLabel(input['tabUrl'], 4_096) ||
    !boundedLabel(input['targetSignature'], 4_096)
  )
    return null;
  try {
    const url = new URL(input['tabUrl']);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  } catch {
    return null;
  }
  return {
    requestId: input['requestId'],
    runId: input['runId'],
    runGeneration: Number(input['runGeneration']),
    tabId: Number(input['tabId']),
    tabUrl: input['tabUrl'],
    targetSignature: input['targetSignature'],
    owner,
  };
}

export function sameBrowserUploadBinding(
  left: BrowserUploadBinding,
  right: BrowserUploadBinding,
): boolean {
  return (
    left.requestId === right.requestId &&
    left.runId === right.runId &&
    left.runGeneration === right.runGeneration &&
    left.tabId === right.tabId &&
    left.tabUrl === right.tabUrl &&
    left.targetSignature === right.targetSignature &&
    sameManagedCloudOwner(left.owner, right.owner)
  );
}

export function parseBrowserUploadedFilesMetadata(
  value: unknown,
): BrowserUploadedFileMetadata[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_CHAT_ATTACHMENT_COUNT)
    return null;
  const files: BrowserUploadedFileMetadata[] = [];
  let total = 0;
  for (const input of value) {
    if (!input || typeof input !== 'object') return null;
    const metadata = input as Record<string, unknown>;
    const parsed = ManagedCloudChatAttachmentSchema.safeParse(metadata['attachment']);
    const checksum = metadata['checksumSha256'];
    if (!parsed.success || typeof checksum !== 'string' || !/^[a-f0-9]{64}$/u.test(checksum))
      return null;
    const attachment = parsed.data;
    if (
      attachment.url !== `/api/files/${attachment.id}` ||
      !boundedLabel(attachment.name, 255) ||
      /[\\/]/u.test(attachment.name) ||
      !resolveChatAttachmentMimeType(attachment.name, attachment.mimeType)
    )
      return null;
    total += attachment.byteCount;
    if (total > MAX_CHAT_ATTACHMENT_BYTES) return null;
    files.push({ attachment, checksumSha256: checksum });
  }
  return files;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted)
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('File upload cancelled.', 'AbortError');
}

async function ownedCredential(
  binding: BrowserUploadBinding,
  options: BrowserUploadOptions,
): Promise<string> {
  throwIfCancelled(options.signal);
  await options.assertCurrent?.();
  const context = await getManagedCloudAuthContext();
  throwIfCancelled(options.signal);
  await options.assertCurrent?.();
  if (!context || !sameManagedCloudOwner(context.owner, binding.owner))
    throw new Error('The account changed while file upload was pending.');
  return context.token;
}

function apiOrigin(): string {
  const origin = configuredAgiWebOrigin();
  if (!origin) throw new Error('The AGI file service origin is invalid.');
  return origin;
}

export async function browserFileChecksum(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const hash = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function uploadSelectedUserFiles(
  files: readonly File[],
  binding: BrowserUploadBinding,
  options: BrowserUploadOptions = {},
): Promise<BrowserUploadedFileMetadata[]> {
  if (!parseBrowserUploadBinding(binding)) throw new Error('The upload approval is invalid.');
  if (
    files.length === 0 ||
    files.length > MAX_CHAT_ATTACHMENT_COUNT ||
    files.reduce((sum, file) => sum + file.size, 0) > MAX_CHAT_ATTACHMENT_BYTES
  )
    throw new Error('Selected files exceed the attachment budget.');
  for (const file of files) {
    if (
      file.size <= 0 ||
      !boundedLabel(file.name, 255) ||
      /[\\/]/u.test(file.name) ||
      !resolveChatAttachmentMimeType(file.name, file.type)
    )
      throw new Error('Select a supported, nonempty file.');
  }
  const origin = apiOrigin();
  const checksums: string[] = [];
  for (const file of files) {
    await ownedCredential(binding, options);
    checksums.push(await browserFileChecksum(new Uint8Array(await file.arrayBuffer())));
    await ownedCredential(binding, options);
  }
  const ownedFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), origin);
    if (url.origin !== origin)
      throw new Error('Refusing a file API request outside the configured AGI origin.');
    const token = await ownedCredential(binding, options);
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    for (const [name, value] of Object.entries(platformRequestHeaders())) headers.set(name, value);
    const response = await fetch(url.href, {
      ...init,
      headers,
      credentials: 'omit',
      redirect: 'error',
      signal: options.signal,
    });
    await ownedCredential(binding, options);
    return response;
  };
  const client = createManagedCloudChatAttachmentsClient({
    baseUrl: origin,
    fetchImpl: ownedFetch,
    uploadFetchImpl: async (input, init) => {
      const url = new URL(String(input));
      if (url.origin === origin) return ownedFetch(input, init);
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('Refusing an insecure file storage destination.');
      await ownedCredential(binding, options);
      const response = await fetch(input, {
        ...init,
        credentials: 'omit',
        redirect: 'error',
        signal: options.signal,
      });
      await ownedCredential(binding, options);
      return response;
    },
  });
  const attachments = await client.upload([...files], {
    signal: options.signal,
    temporary: true,
    onStatus: options.onStatus,
  });
  await ownedCredential(binding, options);
  const metadata = attachments.map((attachment, index) => ({
    attachment,
    checksumSha256: checksums[index]!,
  }));
  const parsed = parseBrowserUploadedFilesMetadata(metadata);
  if (
    !parsed ||
    parsed.length !== files.length ||
    parsed.some((entry, index) => entry.attachment.byteCount !== files[index]!.size)
  )
    throw new Error('The inspected files do not match the selected files.');
  return parsed;
}

async function readBoundedFile(
  response: Response,
  expectedBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const length = response.headers.get('Content-Length');
  if (length !== null && Number(length) !== expectedBytes)
    throw new Error('Stored file size does not match the approved file.');
  if (!response.body) throw new Error('The approved file has no readable bytes.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      throwIfCancelled(signal);
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expectedBytes || total > MAX_CHAT_ATTACHMENT_BYTES)
        throw new Error('Stored file exceeds the approved size.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (total !== expectedBytes)
    throw new Error('Stored file size does not match the approved file.');
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function resolveUploadedUserFiles(
  metadata: unknown,
  binding: BrowserUploadBinding,
  options: BrowserUploadOptions = {},
): Promise<ResolvedBrowserUpload> {
  const files = parseBrowserUploadedFilesMetadata(metadata);
  if (!files || !parseBrowserUploadBinding(binding))
    throw new Error('No inspected user-selected files were approved for this action.');
  const origin = apiOrigin();
  const resolved: ResolvedBrowserUserFile[] = [];
  for (const file of files) {
    const token = await ownedCredential(binding, options);
    const response = await fetch(`${origin}/api/files/${file.attachment.id}`, {
      headers: { Authorization: `Bearer ${token}`, ...platformRequestHeaders() },
      credentials: 'omit',
      redirect: 'error',
      signal: options.signal,
    });
    await ownedCredential(binding, options);
    if (!response.ok || response.redirected)
      throw new Error('The approved file is unavailable for this account.');
    const url = response.url ? new URL(response.url) : null;
    if (url && (url.origin !== origin || url.pathname !== file.attachment.url || url.search))
      throw new Error('The file service returned a different file destination.');
    const bytes = await readBoundedFile(response, file.attachment.byteCount, options.signal);
    await ownedCredential(binding, options);
    if ((await browserFileChecksum(bytes)) !== file.checksumSha256)
      throw new Error('The inspected bytes do not match the file you approved.');
    await ownedCredential(binding, options);
    const reference = createFileReference({
      ...chatAttachmentFileReference(file.attachment, {
        sourceSurface: 'chrome',
        checksumSha256: file.checksumSha256,
      }),
      owner: { userId: binding.owner.accountId, workspaceId: null },
    });
    resolved.push({ reference, bytes });
  }
  return { binding, files: resolved };
}
