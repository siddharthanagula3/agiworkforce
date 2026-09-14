import 'server-only';

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { objectStorageConfig } from './object-storage-runtime';
import {
  copyPrivateObjectIfUnchanged,
  deleteObject,
  deletePrivateObject,
  getBoundedObject,
  getBoundedPrivateObject,
  isObjectStorageConfigured,
  isPrivateObjectStorageConfigured,
  StoredObjectTooLargeError,
} from './object-storage';

const UPLOAD_AUTHORIZATION_TTL_MS = 5 * 60 * 1000;
const UPLOAD_TOKEN_VERSION = 2;
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

function localPathForKey(key: string): { objectPath: string; metadataPath: string } | null {
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
  return { objectPath, metadataPath };
}

async function localSigningSecret(): Promise<Buffer> {
  const root = localStorageRoot();
  const secretPath = path.resolve(root, '.upload-signing-secret');
  await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
  try {
    return await readFile(/* turbopackIgnore: true */ secretPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const secret = randomBytes(32);
  try {
    await writeFile(/* turbopackIgnore: true */ secretPath, secret, {
      flag: 'wx',
      mode: 0o600,
    });
    return secret;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return readFile(/* turbopackIgnore: true */ secretPath);
  }
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
 * The storage credential, never the raw value and never a new environment
 * variable: it is already required wherever an upload can be authorized, so a
 * deploy cannot arrive with this unset. The local file secret covers the
 * development case that has no object storage at all.
 */
async function uploadSigningSecret(): Promise<Buffer> {
  const storageSecret = objectStorageConfig().secretAccessKey;
  if (storageSecret) {
    return createHash('sha256')
      .update(
        `agi-project-knowledge-upload-authorization-v${UPLOAD_TOKEN_VERSION}\0${storageSecret}`,
      )
      .digest();
  }
  return localSigningSecret();
}

async function signPayload(payload: string): Promise<string> {
  return createHmac('sha256', await uploadSigningSecret())
    .update(payload)
    .digest('base64url');
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
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${await signPayload(payload)}`;
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
  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length > 0) {
    throw new Error('This upload authorization is invalid.');
  }
  const expectedSignature = await signPayload(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.byteLength !== expected.byteLength || !timingSafeEqual(supplied, expected)) {
    throw new Error('This upload authorization is invalid.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
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

async function sealLocalProjectKnowledgeObject(
  key: string,
  sealedKey: string,
  etag: string,
): Promise<boolean> {
  const source = localPathForKey(key);
  const destination = localPathForKey(sealedKey);
  if (!source || !destination) return false;
  let data: Buffer;
  let metadata: Buffer;
  try {
    [data, metadata] = await Promise.all([
      readFile(/* turbopackIgnore: true */ source.objectPath),
      readFile(/* turbopackIgnore: true */ source.metadataPath),
    ]);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
  if (localEtag(data) !== etag) return false;

  await mkdir(/* turbopackIgnore: true */ path.dirname(destination.objectPath), {
    recursive: true,
  });
  await mkdir(/* turbopackIgnore: true */ path.dirname(destination.metadataPath), {
    recursive: true,
  });
  const tempId = randomUUID();
  const objectTemp = `${destination.objectPath}.${tempId}.tmp`;
  const metadataTemp = `${destination.metadataPath}.${tempId}.tmp`;
  await writeFile(/* turbopackIgnore: true */ objectTemp, data, { flag: 'wx' });
  await writeFile(/* turbopackIgnore: true */ metadataTemp, metadata, { flag: 'wx', mode: 0o600 });
  await rename(/* turbopackIgnore: true */ objectTemp, destination.objectPath);
  await rename(/* turbopackIgnore: true */ metadataTemp, destination.metadataPath);
  return true;
}

/**
 * Promotes inspected bytes to a key no presign, upload authorization or
 * cleanup request can name. The presigned PUT that wrote `key` stays valid for
 * the rest of its ttl, so a copy that still matches the inspected entity tag is
 * the only evidence that what was read is what will be served. Resolves null
 * when the object changed underneath the inspection.
 */
export async function sealProjectKnowledgeObject(input: {
  key: string;
  etag: string | undefined;
}): Promise<string | null> {
  const sealedKey = sealedProjectKnowledgeKey(input.key);
  if (!sealedKey || !input.etag) return null;
  if (isPrivateObjectStorageConfigured()) {
    const copied = await copyPrivateObjectIfUnchanged({
      sourceKey: input.key,
      destinationKey: sealedKey,
      etag: input.etag,
    });
    return copied ? sealedKey : null;
  }
  return (await sealLocalProjectKnowledgeObject(input.key, sealedKey, input.etag))
    ? sealedKey
    : null;
}

export async function deleteProjectKnowledgeObject(key: string): Promise<void> {
  if (isPrivateObjectStorageConfigured()) {
    await deletePrivateObject(key);
    if (isObjectStorageConfigured()) await deleteObject(key);
    return;
  }
  const resolved = localPathForKey(key);
  if (!resolved) throw new Error('The local project knowledge path is invalid.');
  await Promise.all(
    [resolved.objectPath, resolved.metadataPath].map(async (target) => {
      try {
        await unlink(/* turbopackIgnore: true */ target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }),
  );
}
