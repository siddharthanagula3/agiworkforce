import 'server-only';

import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { logger } from '@/lib/logger';
import { withSpan } from '@/lib/observability/span';
import {
  putPrivateObject,
  getObject,
  getPrivateObject,
  getObjectStream,
  getPrivateObjectStream,
  deleteObject,
  deletePrivateObject,
  isObjectStorageConfigured,
  isPrivateObjectStorageConfigured,
} from './object-storage';
import { OBJECT_STORAGE_REQUEST_TIMEOUT_MS } from './object-storage-timeouts';

export interface StoredMedia {
  url: string;
  pathname: string;
  byteSize: number;
  contentType: string;
}

const LOCAL_MEDIA_PREFIX = 'local-dev-media/';
const PRIVATE_MEDIA_PREFIX = 'private-media/';
const PRIVATE_IMAGE_PREFIX = `${PRIVATE_MEDIA_PREFIX}image/`;
const PRIVATE_VIDEO_PREFIX = 'private-media/video/';
const PRIVATE_FILE_PREFIX = `${PRIVATE_MEDIA_PREFIX}file/`;
const PRIVATE_CHAT_ATTACHMENT_PREFIX = 'chat-attachments/';
const SEALED_CHAT_ATTACHMENT_SUFFIX = '.scanned';

/**
 * Where an attachment's bytes live once they have passed inspection. The
 * presigned PUT that wrote the upload stays valid for minutes afterwards, so
 * the scanned bytes are copied to a key no presign covers before anything can
 * serve them. Every reader of a completed attachment resolves this shape, so
 * the suffix is owned here rather than rebuilt at the upload route.
 */
export function sealedChatAttachmentPathname(storageKey: string): string {
  return `${storageKey}${SEALED_CHAT_ATTACHMENT_SUFFIX}`;
}

function isLocalDevelopmentMediaStorageEnabled(): boolean {
  return process.env['NODE_ENV'] === 'development';
}

function localMediaRoot(): string {
  return path.resolve(process.cwd(), '.agi-local-media');
}

function localPathForStoragePathname(pathname: string): string | null {
  if (!isLocalDevelopmentMediaStorageEnabled()) return null;
  if (
    !/^local-dev-media\/(?:image|video|file)\/[a-f0-9]{32}\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(
      pathname,
    )
  ) {
    return null;
  }

  const root = localMediaRoot();
  const relative = pathname.slice(LOCAL_MEDIA_PREFIX.length);
  const resolved = path.resolve(root, relative);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

export function isMediaStorageConfigured(): boolean {
  return (
    isObjectStorageConfigured() ||
    isPrivateObjectStorageConfigured() ||
    isLocalDevelopmentMediaStorageEnabled()
  );
}

export function isGeneratedMediaStorageConfigured(): boolean {
  return isPrivateObjectStorageConfigured() || isLocalDevelopmentMediaStorageEnabled();
}

export function isImageStorageConfigured(): boolean {
  return isGeneratedMediaStorageConfigured();
}

export function isVideoStorageConfigured(): boolean {
  return isGeneratedMediaStorageConfigured();
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

function extForMime(mime: string): string {
  return EXT_BY_MIME[mime] ?? mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') ?? 'bin';
}

function ownerStorageHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}

function privateVideoPathname(userId: string, objectId: string, extension: string): string {
  return `${PRIVATE_VIDEO_PREFIX}${ownerStorageHash(userId)}/${objectId}.${extension}`;
}

function privateGeneratedMediaPathname(
  userId: string,
  kind: 'image' | 'video' | 'file',
  objectId: string,
  extension: string,
): string {
  return `${PRIVATE_MEDIA_PREFIX}${kind}/${ownerStorageHash(userId)}/${objectId}.${extension}`;
}

export function videoStoragePathname(input: {
  userId: string;
  storageId: string;
  contentType: string;
}): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.storageId,
    )
  ) {
    throw new Error('Stable media storage identity must be a UUID.');
  }
  const extension = extForMime(input.contentType);
  if (isPrivateObjectStorageConfigured()) {
    return privateVideoPathname(input.userId, input.storageId, extension);
  }
  if (isLocalDevelopmentMediaStorageEnabled()) {
    return `${LOCAL_MEDIA_PREFIX}video/${ownerStorageHash(input.userId)}/${input.storageId}.${extension}`;
  }
  throw new Error('Private video storage is not configured.');
}

function isPrivateVideoPathname(pathname: string): boolean {
  return /^private-media\/video\/[a-f0-9]{32}\/[0-9a-f-]{36}\.(?:mp4|webm|mov)$/i.test(pathname);
}

function isPrivateGeneratedMediaPathname(pathname: string): boolean {
  return /^private-media\/(?:image|file)\/[a-f0-9]{32}\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(pathname);
}

/**
 * Sealing appends a second extension, and this guard once accepted only one.
 * Every completed attachment therefore stored a pathname its own reader
 * rejected: reads returned null, `/api/files/[id]` answered 404, and chat
 * reported bytes as missing while they sat in the bucket. Strip the suffix
 * before matching rather than widening the shape, so the accepted key space
 * stays exactly the presigned one plus its sealed twin.
 */
function isPrivateChatAttachmentPathname(pathname: string): boolean {
  const unsealed = pathname.endsWith(SEALED_CHAT_ATTACHMENT_SUFFIX)
    ? pathname.slice(0, -SEALED_CHAT_ATTACHMENT_SUFFIX.length)
    : pathname;
  return /^chat-attachments\/[A-Za-z0-9_-]+\/[0-9]+_[A-Za-z0-9_-]+\.[a-z0-9]+$/i.test(unsealed);
}

/**
 * The sealing copy in the upload-complete route is the only writer of this
 * shape, and it only ever writes into the private bucket. A sealed pathname
 * missing there is gone, not misfiled - trying the public bucket after it is
 * a network round trip that was always going to answer "no such key."
 */
function isPrivateOnlyChatAttachmentPathname(pathname: string): boolean {
  return pathname.endsWith(SEALED_CHAT_ATTACHMENT_SUFFIX);
}

async function attemptStorageRead<T>(
  backend: 'private' | 'public_fallback',
  pathname: string,
  read: () => Promise<T>,
): Promise<T> {
  return withSpan(
    'object_storage.read',
    {
      domain: 'retrieval',
      attributes: { 'object_storage.backend': backend, 'object_storage.pathname': pathname },
    },
    read,
  );
}

export function bytesFromBase64(b64: string): Buffer {
  const comma = b64.indexOf(',');
  const raw = b64.startsWith('data:') && comma !== -1 ? b64.slice(comma + 1) : b64;
  return Buffer.from(raw, 'base64');
}

export async function bytesFromUrl(url: string): Promise<{ data: Buffer; contentType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(OBJECT_STORAGE_REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Failed to fetch media for persistence (HTTP ${res.status})`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const data = Buffer.from(await res.arrayBuffer());
  return { data, contentType };
}

export async function storeMedia(params: {
  userId: string;
  kind: 'image' | 'video' | 'file';
  data: Buffer | Uint8Array;
  contentType: string;
  storageId?: string;
}): Promise<StoredMedia> {
  const { userId, kind, data, contentType } = params;
  const extension = extForMime(contentType);
  const objectId = params.storageId ?? randomUUID();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(objectId)
  ) {
    throw new Error('Stable media storage identity must be a UUID.');
  }

  if (isPrivateObjectStorageConfigured()) {
    const pathname = privateGeneratedMediaPathname(userId, kind, objectId, extension);
    await putPrivateObject({ key: pathname, data, contentType });
    return {
      url: pathname,
      pathname,
      byteSize: data.byteLength,
      contentType,
    };
  }

  if (!isLocalDevelopmentMediaStorageEnabled()) {
    throw new Error('Private media storage is not configured.');
  }

  const ownerHash = ownerStorageHash(userId);
  const pathname = `${LOCAL_MEDIA_PREFIX}${kind}/${ownerHash}/${objectId}.${extension}`;
  const localPath = localPathForStoragePathname(pathname);
  if (!localPath) throw new Error('Could not resolve the local media storage path.');

  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, data);
  return {
    url: pathname,
    pathname,
    byteSize: data.byteLength,
    contentType,
  };
}

export async function storeMediaFile(params: {
  userId: string;
  kind: 'video' | 'file';
  filePath: string;
  byteSize: number;
  contentType: string;
  storageId: string;
}): Promise<StoredMedia> {
  const { userId, kind, filePath, byteSize, contentType, storageId } = params;
  if (!Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error('Stored media file size is invalid.');
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storageId)
  ) {
    throw new Error('Stable media storage identity must be a UUID.');
  }
  const fileInfo = await stat(filePath);
  if (!fileInfo.isFile() || fileInfo.size !== byteSize) {
    throw new Error('Stored media file does not match its validated size.');
  }
  const extension = extForMime(contentType);

  if (isPrivateObjectStorageConfigured()) {
    const pathname = privateGeneratedMediaPathname(userId, kind, storageId, extension);
    await putPrivateObject({
      key: pathname,
      data: createReadStream(filePath),
      contentType,
      contentLength: byteSize,
    });
    return { url: pathname, pathname, byteSize, contentType };
  }

  if (!isLocalDevelopmentMediaStorageEnabled()) {
    throw new Error('Private media storage is not configured.');
  }
  const ownerHash = ownerStorageHash(userId);
  const pathname = `${LOCAL_MEDIA_PREFIX}${kind}/${ownerHash}/${storageId}.${extension}`;
  const localPath = localPathForStoragePathname(pathname);
  if (!localPath) throw new Error('Could not resolve the local media storage path.');
  await mkdir(path.dirname(localPath), { recursive: true });
  await copyFile(filePath, localPath);
  return { url: pathname, pathname, byteSize, contentType };
}

export function authenticatedMediaUrl(mediaAssetId: string): string {
  return `/api/files/${mediaAssetId}`;
}

export async function readStoredMedia(
  pathname: string,
): Promise<{ data: Buffer; contentType: string | undefined } | null> {
  if (pathname.startsWith(LOCAL_MEDIA_PREFIX)) {
    const localPath = localPathForStoragePathname(pathname);
    if (!localPath) return null;
    try {
      return {
        data: await readFile(/* turbopackIgnore: true */ localPath),
        contentType: undefined,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  if (pathname.startsWith(PRIVATE_VIDEO_PREFIX)) {
    if (!isPrivateVideoPathname(pathname) || !isPrivateObjectStorageConfigured()) return null;
    return getPrivateObject(pathname);
  }

  if (pathname.startsWith(PRIVATE_IMAGE_PREFIX) || pathname.startsWith(PRIVATE_FILE_PREFIX)) {
    if (!isPrivateGeneratedMediaPathname(pathname) || !isPrivateObjectStorageConfigured()) {
      return null;
    }
    return getPrivateObject(pathname);
  }

  if (pathname.startsWith(PRIVATE_CHAT_ATTACHMENT_PREFIX)) {
    if (!isPrivateChatAttachmentPathname(pathname) || !isPrivateObjectStorageConfigured()) {
      return null;
    }
    const privateObject = await attemptStorageRead('private', pathname, () =>
      getPrivateObject(pathname),
    );
    if (privateObject) return privateObject;
    if (isPrivateOnlyChatAttachmentPathname(pathname) || !isObjectStorageConfigured()) return null;
    return attemptStorageRead('public_fallback', pathname, () => getObject(pathname));
  }

  if (!isObjectStorageConfigured()) return null;
  return getObject(pathname);
}

export async function streamStoredMedia(
  pathname: string,
  range?: { start: number; end: number },
): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string | undefined;
  contentLength: number;
  contentRange: string | undefined;
} | null> {
  if (pathname.startsWith(LOCAL_MEDIA_PREFIX)) {
    const localPath = localPathForStoragePathname(pathname);
    if (!localPath) return null;
    try {
      const info = await stat(/* turbopackIgnore: true */ localPath);
      const start = range?.start ?? 0;
      const end = range?.end ?? info.size - 1;
      if (start < 0 || end < start || end >= info.size) return null;
      const nodeStream = createReadStream(/* turbopackIgnore: true */ localPath, { start, end });
      return {
        body: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>,
        contentType: undefined,
        contentLength: end - start + 1,
        contentRange: range ? `bytes ${start}-${end}/${info.size}` : undefined,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  if (pathname.startsWith(PRIVATE_VIDEO_PREFIX)) {
    if (!isPrivateVideoPathname(pathname) || !isPrivateObjectStorageConfigured()) return null;
    const object = await getPrivateObjectStream(
      pathname,
      range ? `bytes=${range.start}-${range.end}` : undefined,
    );
    if (!object || object.contentLength == null) return null;
    return {
      body: object.body,
      contentType: object.contentType,
      contentLength: object.contentLength,
      contentRange: object.contentRange,
    };
  }

  if (pathname.startsWith(PRIVATE_IMAGE_PREFIX) || pathname.startsWith(PRIVATE_FILE_PREFIX)) {
    if (!isPrivateGeneratedMediaPathname(pathname) || !isPrivateObjectStorageConfigured()) {
      return null;
    }
    const object = await getPrivateObjectStream(
      pathname,
      range ? `bytes=${range.start}-${range.end}` : undefined,
    );
    if (!object || object.contentLength == null) return null;
    return {
      body: object.body,
      contentType: object.contentType,
      contentLength: object.contentLength,
      contentRange: object.contentRange,
    };
  }

  if (pathname.startsWith(PRIVATE_CHAT_ATTACHMENT_PREFIX)) {
    if (!isPrivateChatAttachmentPathname(pathname) || !isPrivateObjectStorageConfigured()) {
      return null;
    }
    const object = await attemptStorageRead('private', pathname, () =>
      getPrivateObjectStream(pathname, range ? `bytes=${range.start}-${range.end}` : undefined),
    );
    if (object?.contentLength != null) {
      return {
        body: object.body,
        contentType: object.contentType,
        contentLength: object.contentLength,
        contentRange: object.contentRange,
      };
    }
    if (isPrivateOnlyChatAttachmentPathname(pathname) || !isObjectStorageConfigured()) return null;
    const legacyObject = await attemptStorageRead('public_fallback', pathname, () =>
      getObjectStream(pathname, range ? `bytes=${range.start}-${range.end}` : undefined),
    );
    if (!legacyObject || legacyObject.contentLength == null) return null;
    return {
      body: legacyObject.body,
      contentType: legacyObject.contentType,
      contentLength: legacyObject.contentLength,
      contentRange: legacyObject.contentRange,
    };
  }

  if (!isObjectStorageConfigured()) return null;
  const object = await getObjectStream(
    pathname,
    range ? `bytes=${range.start}-${range.end}` : undefined,
  );
  if (!object || object.contentLength == null) return null;
  return {
    body: object.body,
    contentType: object.contentType,
    contentLength: object.contentLength,
    contentRange: object.contentRange,
  };
}

export async function deleteStoredMedia(pathname: string): Promise<void> {
  if (pathname.startsWith(LOCAL_MEDIA_PREFIX)) {
    const localPath = localPathForStoragePathname(pathname);
    if (!localPath) throw new Error('Invalid local media storage path.');
    try {
      await unlink(localPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return;
  }

  if (pathname.startsWith(PRIVATE_VIDEO_PREFIX)) {
    if (!isPrivateVideoPathname(pathname)) {
      throw new Error('Invalid private video storage path.');
    }
    await deletePrivateObject(pathname);
    return;
  }
  if (pathname.startsWith(PRIVATE_IMAGE_PREFIX) || pathname.startsWith(PRIVATE_FILE_PREFIX)) {
    if (!isPrivateGeneratedMediaPathname(pathname)) {
      throw new Error('Invalid private generated-media storage path.');
    }
    await deletePrivateObject(pathname);
    return;
  }
  if (pathname.startsWith(PRIVATE_CHAT_ATTACHMENT_PREFIX)) {
    if (!isPrivateChatAttachmentPathname(pathname)) {
      throw new Error('Invalid private chat-attachment storage path.');
    }
    await deletePrivateObject(pathname);
    if (isObjectStorageConfigured()) await deleteObject(pathname);
    return;
  }

  await deleteObject(pathname);
}

export async function deleteStoredMediaObjects(
  pathnames: ReadonlyArray<string | null | undefined>,
): Promise<{ deleted: number; failedPathnames: string[] }> {
  const present = pathnames.filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (!isMediaStorageConfigured()) {
    if (present.length > 0) {
      logger.warn(
        { count: present.length },
        'Object storage is not configured; stored media objects were not deleted',
      );
    }
    return { deleted: 0, failedPathnames: [...present] };
  }
  let deleted = 0;
  const failedPathnames: string[] = [];
  for (const pathname of present) {
    try {
      await deleteStoredMedia(pathname);
      deleted++;
    } catch (error) {
      failedPathnames.push(pathname);
      logger.warn({ pathname, error }, 'Failed to delete stored media object');
    }
  }
  return { deleted, failedPathnames };
}
