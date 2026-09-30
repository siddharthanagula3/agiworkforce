import 'server-only';

import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

const RECOVERY_KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_KEY_GROUPS = 4;
const RECOVERY_KEY_GROUP_LENGTH = 5;
const RECOVERY_KEY_LENGTH = RECOVERY_KEY_GROUPS * RECOVERY_KEY_GROUP_LENGTH;
const RECOVERY_KEY_DOMAIN = 'agi:account-security:recovery-key:v1';
const HANDOFF_DOMAIN = 'agi:account-security:handoff:v1';
const HANDOFF_CODE_DOMAIN = 'agi:account-security:handoff-code:v1';
const UNDO_DOMAIN = 'agi:account-security:undo:v1';
const ENROLLMENT_CODE_KEY_INFO = 'agi:account-security:enrollment-code:v1';
const MIN_SECRET_BYTES = 32;
const TOKEN_BYTES = 32;
const UNUSABLE_PASSWORD_BYTES = 36;

function sha256Hex(domain: string, value: string): string {
  return createHash('sha256').update(`${domain}:${value}`).digest('hex');
}

function generateRecoveryKey(): string {
  const characters = Array.from(
    { length: RECOVERY_KEY_LENGTH },
    () => RECOVERY_KEY_ALPHABET[randomInt(RECOVERY_KEY_ALPHABET.length)],
  ).join('');
  const groups: string[] = [];
  for (let index = 0; index < RECOVERY_KEY_LENGTH; index += RECOVERY_KEY_GROUP_LENGTH) {
    groups.push(characters.slice(index, index + RECOVERY_KEY_GROUP_LENGTH));
  }
  return groups.join('-');
}

export function normalizeRecoveryKey(input: string): string | null {
  const compact = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (compact.length !== RECOVERY_KEY_LENGTH) return null;
  for (const character of compact) {
    if (!RECOVERY_KEY_ALPHABET.includes(character)) return null;
  }
  return compact;
}

export function hashRecoveryKey(normalized: string): string {
  return sha256Hex(RECOVERY_KEY_DOMAIN, normalized);
}

export function generateRecoveryKeys(count: number): { keys: string[]; hashes: string[] } {
  const keys = Array.from({ length: count }, generateRecoveryKey);
  const hashes = keys.map((key) => {
    const normalized = normalizeRecoveryKey(key);
    if (!normalized) throw new Error('generated recovery key does not normalize');
    return hashRecoveryKey(normalized);
  });
  return { keys, hashes };
}

export function newOpaqueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashHandoffToken(token: string): string {
  return sha256Hex(HANDOFF_DOMAIN, token);
}

export function hashHandoffCode(code: string): string {
  return sha256Hex(HANDOFF_CODE_DOMAIN, code);
}

export function newUnusablePassword(): string {
  return randomBytes(UNUSABLE_PASSWORD_BYTES).toString('base64url');
}

export function hashUndoToken(token: string): string {
  return sha256Hex(UNDO_DOMAIN, token);
}

export function generateEnrollmentCode(length: number): string {
  return Array.from({ length }, () => String(randomInt(10))).join('');
}

let enrollmentCodeKey: Buffer | null = null;

function enrollmentCodeSigningKey(): Buffer {
  if (enrollmentCodeKey) return enrollmentCodeKey;
  const secret = process.env['CSRF_SECRET'];
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    throw new Error(
      'Advanced Account Security needs CSRF_SECRET (at least 32 bytes) to hash codes',
    );
  }
  enrollmentCodeKey = Buffer.from(
    hkdfSync('sha256', secret, Buffer.alloc(0), ENROLLMENT_CODE_KEY_INFO, 32),
  );
  return enrollmentCodeKey;
}

export function hashEnrollmentCode(userId: string, code: string): string {
  return createHmac('sha256', enrollmentCodeSigningKey()).update(`${userId}:${code}`).digest('hex');
}

export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
