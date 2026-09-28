import 'server-only';

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const RECOVERY_KEY_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_KEY_GROUPS = 4;
const RECOVERY_KEY_GROUP_LENGTH = 5;
const RECOVERY_KEY_LENGTH = RECOVERY_KEY_GROUPS * RECOVERY_KEY_GROUP_LENGTH;
const RECOVERY_KEY_DOMAIN = 'agi:account-security:recovery-key:v1';
const HANDOFF_DOMAIN = 'agi:account-security:handoff:v1';
const HANDOFF_CODE_DOMAIN = 'agi:account-security:handoff-code:v1';
const TOKEN_BYTES = 32;

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

export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
