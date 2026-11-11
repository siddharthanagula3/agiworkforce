import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readSignedUploadClaims, signUploadClaims } from './upload-signing';
import {
  createObjectCleanupPlan,
  createPrivateObjectWriter,
  getBoundedObject,
  getBoundedPrivateObject,
  isObjectStorageConfigured,
  isPrivateObjectStorageConfigured,
  StoredObjectTooLargeError,
  type ObjectCleanupPlan,
} from './object-storage';

const UPLOAD_AUTHORIZATION_TTL_MS = 5 * 60 * 1000;
const UPLOAD_TOKEN_VERSION = 2;
const UPLOAD_AUTHORIZATION_PURPOSE = `agi-project-knowledge-upload-authorization-v${UPLOAD_TOKEN_VERSION}`;
const SEALED_KNOWLEDGE_SEGMENT = 'sealed';

export interface ProjectKnowledgeUploadClaims {
  v: number;
  userId: string;
  key: string;
  contentType: string;
  byteCount: number;
  checksumSha256: string;
  expiresAt: number;
  nonce: string;
}

function localStorageEnabled(): boolean {
  return process.env['NODE_ENV'] === 'development' && !isPrivateObjectStorageConfigured();
}

function localStorageRoot(): string {
  return path.resolve(process.cwd(), '.agi-local-media', 'project-knowledge');
}

function traversalFree(key: string): boolean {
  return (
    !key.includes('//') && !key.split('/').some((segment) => segment === '.' || segment === '..')
  );
}

/**
 * What a presign, an upload authorization, and the proxy PUT may name. The
 * sealed shape is deliberately outside it: the bytes an upload can still
 * rewrite for the rest of its ttl never share a key with the bytes that passed
 * inspection.
 */
function validKnowledgeUploadKey(key: string): boolean {
  return (
    /^knowledge-files\/projects\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(key) && traversalFree(key)
  );
}

export function isSealedProjectKnowledgeKey(key: string): boolean {
  return (
    new RegExp(
      `^knowledge-files/projects/[A-Za-z0-9-]+/${SEALED_KNOWLEDGE_SEGMENT}/[A-Za-z0-9._-]+$`,
    ).test(key) && traversalFree(key)
  );
}

export function sealedProjectKnowledgeKey(key: string): string | null {
  if (!validKnowledgeUploadKey(key)) return null;
  const lastSlash = key.lastIndexOf('/');
  return `${key.slice(0, lastSlash)}/${SEALED_KNOWLEDGE_SEGMENT}${key.slice(lastSlash)}`;
}

function validKnowledgeKey(key: string): boolean {
  return validKnowledgeUploadKey(key) || isSealedProjectKnowledgeKey(key);
}

function localPathForKey(
  key: string,
): { root: string; objectPath: string; metadataPath: string } | null {
  if (!localStorageEnabled() || !validKnowledgeKey(key)) return null;
  const root = localStorageRoot();
  const objectPath = path.resolve(root, 'objects', key);
  const metadataPath = path.resolve(root, 'metadata', `${key}.json`);
  if (
    !objectPath.startsWith(`${path.resolve(root, 'objects')}${path.sep}`) ||
    !metadataPath.startsWith(`${path.resolve(root, 'metadata')}${path.sep}`)
  ) {
    return null;
  }
  return { root, objectPath, metadataPath };
}

function parseClaims(value: unknown): ProjectKnowledgeUploadClaims | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const claims = value as Record<string, unknown>;
  if (
    claims['v'] !== UPLOAD_TOKEN_VERSION ||
    typeof claims['userId'] !== 'string' ||
    !claims['userId'] ||
    typeof claims['key'] !== 'string' ||
    !validKnowledgeUploadKey(claims['key']) ||
    typeof claims['contentType'] !== 'string' ||
    !claims['contentType'] ||
    typeof claims['byteCount'] !== 'number' ||
    !Number.isSafeInteger(claims['byteCount']) ||
    claims['byteCount'] <= 0 ||
    typeof claims['checksumSha256'] !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(claims['checksumSha256']) ||
    typeof claims['expiresAt'] !== 'number' ||
    !Number.isSafeInteger(claims['expiresAt']) ||
    typeof claims['nonce'] !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(claims['nonce'])
  ) {
    return null;
  }
  return claims as unknown as ProjectKnowledgeUploadClaims;
}

/**
 * Binds an upload to the exact bytes the caller declared at presign. The key
 * comes from this token rather than from the request, and a body that hashes to
 * anything but `checksumSha256` is refused, so an object that passed content
 * inspection cannot be rewritten under the same key afterwards.
 */
export async function createProjectKnowledgeUploadAuthorization(input: {
  userId: string;
  key: string;
  contentType: string;
  byteCount: number;
  checksumSha256: string;
}): Promise<string> {
  if (!validKnowledgeUploadKey(input.key)) {
    throw new Error('The project knowledge upload destination is invalid.');
  }
  const claims: ProjectKnowledgeUploadClaims = {
    v: UPLOAD_TOKEN_VERSION,
    userId: input.userId,
    key: input.key,
    contentType: input.contentType,
    byteCount: input.byteCount,
    checksumSha256: input.checksumSha256.toLowerCase(),
    expiresAt: Date.now() + UPLOAD_AUTHORIZATION_TTL_MS,
    nonce: randomUUID(),
  };
  return signUploadClaims(UPLOAD_AUTHORIZATION_PURPOSE, claims);
}

export function isProjectKnowledgeObjectStorageConfigured(): boolean {
  return isPrivateObjectStorageConfigured() || localStorageEnabled();
}

export async function createLocalProjectKnowledgeUploadUrl(input: {
  userId: string;
  key: string;
  contentType: string;
  byteCount: number;
  checksumSha256: string;
}): Promise<string> {
  if (!localStorageEnabled()) {
    throw new Error('Local project knowledge storage is not available.');
  }
  const token = await createProjectKnowledgeUploadAuthorization(input);
  return `/api/uploads/local-project-knowledge?token=${encodeURIComponent(token)}`;
}

export async function verifyProjectKnowledgeUploadAuthorization(
  token: string,
  userId: string,
): Promise<ProjectKnowledgeUploadClaims> {
  const decoded = await readSignedUploadClaims(UPLOAD_AUTHORIZATION_PURPOSE, token);
  if (decoded === null) {
    throw new Error('This upload authorization is invalid.');
  }
  const claims = parseClaims(decoded);
  if (!claims || claims.userId !== userId || claims.expiresAt < Date.now()) {
    throw new Error('This upload authorization is invalid or expired.');
  }
  return claims;
}

export function assertUploadMatchesAuthorization(
  claims: ProjectKnowledgeUploadClaims,
  body: { contentType: string; data: Uint8Array },
): void {
  const contentType = body.contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== claims.contentType.trim().toLowerCase()) {
    throw new Error('The uploaded content type does not match its authorization.');
  }
  if (body.data.byteLength !== claims.byteCount) {
    throw new Error('The uploaded byte count does not match its authorization.');
  }
  const digest = createHash('sha256').update(body.data).digest('hex');
  if (digest !== claims.checksumSha256) {
    throw new Error('The uploaded bytes do not match the authorized content.');
  }
}

export async function storeLocalProjectKnowledgeUpload(input: {
  token: string;
  userId: string;
  contentType: string;
  data: Uint8Array;
}): Promise<void> {
  if (!localStorageEnabled()) throw new Error('Local project knowledge storage is disabled.');
  const claims = await verifyProjectKnowledgeUploadAuthorization(input.token, input.userId);
  assertUploadMatchesAuthorization(claims, { contentType: input.contentType, data: input.data });
  const resolved = localPathForKey(claims.key);
  if (!resolved) throw new Error('The local project knowledge path is invalid.');

  const claimPath = path.resolve(localStorageRoot(), 'claims', claims.nonce);
  await mkdir(/* turbopackIgnore: true */ path.dirname(claimPath), { recursive: true });
  try {
    await writeFile(/* turbopackIgnore: true */ claimPath, claims.key, {
      flag: 'wx',
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('This local upload authorization has already been used.');
    }
    throw error;
  }

  await mkdir(/* turbopackIgnore: true */ path.dirname(resolved.objectPath), { recursive: true });
  await mkdir(/* turbopackIgnore: true */ path.dirname(resolved.metadataPath), { recursive: true });
  const tempId = randomUUID();
  const objectTemp = `${resolved.objectPath}.${tempId}.tmp`;
  const metadataTemp = `${resolved.metadataPath}.${tempId}.tmp`;
  await writeFile(/* turbopackIgnore: true */ objectTemp, input.data, { flag: 'wx' });
  await writeFile(metadataTemp, JSON.stringify({ contentType: claims.contentType }), {
    flag: 'wx',
    mode: 0o600,
  });
  await rename(/* turbopackIgnore: true */ objectTemp, resolved.objectPath);
  await rename(/* turbopackIgnore: true */ metadataTemp, resolved.metadataPath);
}

export interface ProjectKnowledgeObject {
  data: Buffer;
  contentType: string | undefined;
  etag: string | undefined;
}

function localEtag(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function getProjectKnowledgeObject(
  key: string,
  maxBytes: number,
): Promise<ProjectKnowledgeObject | null> {
  if (isPrivateObjectStorageConfigured()) {
    const privateObject = await getBoundedPrivateObject(key, maxBytes);
    if (privateObject) return privateObject;
    if (!isObjectStorageConfigured()) return null;
    const publicObject = await getBoundedObject(key, maxBytes);
    // Only the private bucket can be sealed, so a fallback read reports no
    // entity tag rather than one no copy of ours could ever match.
    return publicObject ? { ...publicObject, etag: undefined } : null;
  }
  const resolved = localPathForKey(key);
  if (!resolved) return null;
  try {
    const stats = await stat(/* turbopackIgnore: true */ resolved.objectPath);
    if (stats.size > maxBytes) throw new StoredObjectTooLargeError(key, maxBytes, stats.size);
    const [data, rawMetadata] = await Promise.all([
      readFile(/* turbopackIgnore: true */ resolved.objectPath),
      readFile(/* turbopackIgnore: true */ resolved.metadataPath, 'utf8'),
    ]);
    const metadata = JSON.parse(rawMetadata) as { contentType?: unknown };
    return {
      data,
      contentType: typeof metadata.contentType === 'string' ? metadata.contentType : undefined,
      etag: localEtag(data),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function sealLocalProjectKnowledgeObject(input: {
  sealedKey: string;
  etag: string;
  bytes: Buffer;
  contentType: string;
}): Promise<SealedProjectKnowledgeObject | null> {
  const destination = localPathForKey(input.sealedKey);
  if (!destination) return null;
  if (localEtag(input.bytes) !== input.etag) return null;

  await mkdir(/* turbopackIgnore: true */ path.dirname(destination.objectPath), {
    recursive: true,
  });
  await mkdir(/* turbopackIgnore: true */ path.dirname(destination.metadataPath), {
    recursive: true,
  });
  const tempId = randomUUID();
  const objectTemp = `${destination.objectPath}.${tempId}.tmp`;
  const metadataTemp = `${destination.metadataPath}.${tempId}.tmp`;
  const metadata = Buffer.from(JSON.stringify({ contentType: input.contentType }));
  await writeFile(/* turbopackIgnore: true */ objectTemp, input.bytes, { flag: 'wx' });
  await writeFile(/* turbopackIgnore: true */ metadataTemp, metadata, { flag: 'wx', mode: 0o600 });
  await rename(/* turbopackIgnore: true */ objectTemp, destination.objectPath);
  await rename(/* turbopackIgnore: true */ metadataTemp, destination.metadataPath);
  return Object.freeze({
    key: input.sealedKey,
    targets: localCleanupPlan(destination.root).targets,
  });
}

export interface SealedProjectKnowledgeObject {
  readonly key: string;
  readonly targets: Readonly<Record<string, string>>;
}

/**
 * Promotes the bytes that passed inspection to a key no presign, upload
 * authorization or cleanup request can name. The presigned PUT that wrote
 * `key` stays valid for the rest of its ttl, so the sealed object is the
 * buffer that was scanned, not a later copy of the live key. Resolves null
 * when that read had no entity tag. A local seal also requires the buffer's
 * sha256 to be that tag.
 */
export async function sealProjectKnowledgeObject(input: {
  key: string;
  etag: string | undefined;
  bytes: Buffer;
  contentType: string;
}): Promise<SealedProjectKnowledgeObject | null> {
  const sealedKey = sealedProjectKnowledgeKey(input.key);
  if (!sealedKey || !input.etag) return null;
  if (isPrivateObjectStorageConfigured()) {
    const writer = createPrivateObjectWriter();
    await writer.put({
      key: sealedKey,
      data: input.bytes,
      contentType: input.contentType,
      contentLength: input.bytes.byteLength,
    });
    return Object.freeze({ key: sealedKey, targets: Object.freeze({ private: writer.target }) });
  }
  return sealLocalProjectKnowledgeObject({
    sealedKey,
    etag: input.etag,
    bytes: input.bytes,
    contentType: input.contentType,
  });
}

export function createProjectKnowledgeCleanupPlan(): ObjectCleanupPlan {
  if (isPrivateObjectStorageConfigured()) {
    return createObjectCleanupPlan();
  }
  if (!localStorageEnabled()) throw new Error('Project knowledge cleanup is not configured.');
  return localCleanupPlan(localStorageRoot());
}

function localCleanupPlan(root: string): ObjectCleanupPlan {
  const roots = new Map([
    ['local-bytes', path.join(root, 'objects')],
    ['local-metadata', path.join(root, 'metadata')],
  ]);
  const targets = Object.freeze(Object.fromEntries(roots));
  return {
    targets,
    async remove({ name, location, objectKey }) {
      const targetRoot = roots.get(name);
      if (!targetRoot || location !== targetRoot || !validKnowledgeKey(objectKey)) {
        throw new Error('Object cleanup does not match its pinned local storage target.');
      }
      const target = path.join(
        targetRoot,
        name === 'local-metadata' ? `${objectKey}.json` : objectKey,
      );
      try {
        await unlink(/* turbopackIgnore: true */ target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },
  };
}

export async function deleteProjectKnowledgeObject(key: string): Promise<void> {
  const plan = createProjectKnowledgeCleanupPlan();
  for (const [name, location] of Object.entries(plan.targets)) {
    await plan.remove({ name, location, objectKey: key });
  }
}
