import 'server-only';

import { createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { objectStorageConfig } from './object-storage-runtime';

const SIGNING_KEY_BYTES = 32;

function localSigningSecretPath(): { root: string; secretPath: string } {
  const root = path.resolve(process.cwd(), '.agi-local-media', 'project-knowledge');
  return { root, secretPath: path.resolve(root, '.upload-signing-secret') };
}

async function localSigningSecret(): Promise<Buffer> {
  const { root, secretPath } = localSigningSecretPath();
  await mkdir(/* turbopackIgnore: true */ root, { recursive: true });
  try {
    return await readFile(/* turbopackIgnore: true */ secretPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const secret = randomBytes(SIGNING_KEY_BYTES);
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

async function uploadSigningKey(purpose: string): Promise<Buffer> {
  const storageSecret = objectStorageConfig().secretAccessKey;
  if (storageSecret) {
    return Buffer.from(hkdfSync('sha256', storageSecret, '', purpose, SIGNING_KEY_BYTES));
  }
  return localSigningSecret();
}

async function signature(purpose: string, payload: string): Promise<string> {
  return createHmac('sha256', await uploadSigningKey(purpose))
    .update(payload)
    .digest('base64url');
}

export async function signUploadClaims(purpose: string, claims: object): Promise<string> {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${await signature(purpose, payload)}`;
}

export async function readSignedUploadClaims(purpose: string, token: string): Promise<unknown> {
  const [payload, suppliedSignature, ...extra] = token.split('.');
  if (!payload || !suppliedSignature || extra.length > 0) return null;
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(await signature(purpose, payload));
  if (supplied.byteLength !== expected.byteLength || !timingSafeEqual(supplied, expected)) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown;
  } catch {
    return null;
  }
}
