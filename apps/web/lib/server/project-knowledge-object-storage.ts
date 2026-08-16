import 'server-only';

import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  deleteObject,
  deletePrivateObject,
  getObject,
  getPrivateObject,
  isObjectStorageConfigured,
  isPrivateObjectStorageConfigured,
} from './object-storage';

const LOCAL_UPLOAD_TTL_MS = 5 * 60 * 1000;
const LOCAL_TOKEN_VERSION = 1;

interface LocalUploadClaims {
  v: number;
  userId: string;
  key: string;
  contentType: string;
  byteCount: number;
  expiresAt: number;
  nonce: string;
}

function localStorageEnabled(): boolean {
  return process.env['NODE_ENV'] === 'development' && !isPrivateObjectStorageConfigured();
}

function localStorageRoot(): string {
  return path.resolve(process.cwd(), '.agi-local-media', 'project-knowledge');
}

function validKnowledgeKey(key: string): boolean {
  return (
    /^knowledge-files\/projects\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(key) &&
    !key.includes('//') &&
    !key.split('/').some((segment) => segment === '.' || segment === '..')
  );
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

function parseClaims(value: unknown): LocalUploadClaims | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const claims = value as Record<string, unknown>;
  if (
    claims['v'] !== LOCAL_TOKEN_VERSION ||
    typeof claims['userId'] !== 'string' ||
    !claims['userId'] ||
    typeof claims['key'] !== 'string' ||
    !validKnowledgeKey(claims['key']) ||
    typeof claims['contentType'] !== 'string' ||
    !claims['contentType'] ||
    typeof claims['byteCount'] !== 'number' ||
    !Number.isSafeInteger(claims['byteCount']) ||
    claims['byteCount'] <= 0 ||
    typeof claims['expiresAt'] !== 'number' ||
    !Number.isSafeInteger(claims['expiresAt']) ||
    typeof claims['nonce'] !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(claims['nonce'])
  ) {
    return null;
  }
  return claims as unknown as LocalUploadClaims;
}

async function signPayload(payload: string): Promise<string> {
  return createHmac('sha256', await localSigningSecret())
    .update(payload)
    .digest('base64url');
}

export function isProjectKnowledgeObjectStorageConfigured(): boolean {
  return isPrivateObjectStorageConfigured() || localStorageEnabled();
}

export async function createLocalProjectKnowledgeUploadUrl(input: {
  userId: string;
  key: string;
  contentType: string;
  byteCount: number;
}): Promise<string> {
  if (!localStorageEnabled() || !validKnowledgeKey(input.key)) {
    throw new Error('Local project knowledge storage is not available.');
  }
  const claims: LocalUploadClaims = {
    v: LOCAL_TOKEN_VERSION,
    userId: input.userId,
    key: input.key,
    contentType: input.contentType,
    byteCount: input.byteCount,
    expiresAt: Date.now() + LOCAL_UPLOAD_TTL_MS,
    nonce: randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = await signPayload(payload);
  return `/api/uploads/local-project-knowledge?token=${encodeURIComponent(`${payload}.${signature}`)}`;
}

async function verifyLocalUploadToken(token: string, userId: string): Promise<LocalUploadClaims> {
  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length > 0) {
    throw new Error('Local upload authorization is invalid.');
  }
  const expectedSignature = await signPayload(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.byteLength !== expected.byteLength || !timingSafeEqual(supplied, expected)) {
    throw new Error('Local upload authorization is invalid.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Local upload authorization is invalid.');
  }
  const claims = parseClaims(decoded);
  if (!claims || claims.userId !== userId || claims.expiresAt < Date.now()) {
    throw new Error('Local upload authorization is invalid or expired.');
  }
  return claims;
}

export async function storeLocalProjectKnowledgeUpload(input: {
  token: string;
  userId: string;
  contentType: string;
  data: Uint8Array;
}): Promise<void> {
  if (!localStorageEnabled()) throw new Error('Local project knowledge storage is disabled.');
  const claims = await verifyLocalUploadToken(input.token, input.userId);
  const contentType = input.contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== claims.contentType.trim().toLowerCase()) {
    throw new Error('The uploaded content type does not match its authorization.');
  }
  if (input.data.byteLength !== claims.byteCount) {
    throw new Error('The uploaded byte count does not match its authorization.');
  }
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
  await writeFile(
metadataTemp,
    JSON.stringify({ contentType: claims.contentType }),
    { flag: 'wx', mode: 0o600 },
  );
  await rename(/* turbopackIgnore: true */ objectTemp, resolved.objectPath);
  await rename(/* turbopackIgnore: true */ metadataTemp, resolved.metadataPath);
}

export async function getProjectKnowledgeObject(
  key: string,
): Promise<{ data: Buffer; contentType: string | undefined } | null> {
  if (isPrivateObjectStorageConfigured()) {
    const privateObject = await getPrivateObject(key);
    if (privateObject) return privateObject;
    return isObjectStorageConfigured() ? getObject(key) : null;
  }
  const resolved = localPathForKey(key);
  if (!resolved) return null;
  try {
    const [data, rawMetadata] = await Promise.all([
      readFile(/* turbopackIgnore: true */ resolved.objectPath),
      readFile(/* turbopackIgnore: true */ resolved.metadataPath, 'utf8'),
    ]);
    const metadata = JSON.parse(rawMetadata) as { contentType?: unknown };
    return {
      data,
      contentType: typeof metadata.contentType === 'string' ? metadata.contentType : undefined,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
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
