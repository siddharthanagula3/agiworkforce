import 'server-only';

import { randomBytes } from 'node:crypto';
import { absoluteUrl } from '@/lib/seo/site';
import { BONUS_CREDIT_EXPIRY_DAYS } from '@/lib/services/bonus-credit-service';

export const REFERRAL_PROGRAM = Object.freeze({
  friendTrialDays: 7,
  rewardCredits: 500,
  holdDays: 14,
  attributionDays: 30,
  networkMatchDays: 30,
  newAccountWindowHours: 24,
  monthlyRewardCap: 10,
  yearlyRewardCap: 50,
  bonusExpiryDays: BONUS_CREDIT_EXPIRY_DAYS,
});

export type ReferralProgramTerms = typeof REFERRAL_PROGRAM;

export const REFERRAL_ATTRIBUTION_COOKIE = 'agi_referral';

export const REFERRAL_STATUSES = [
  'signed_up',
  'converted',
  'rewarded',
  'capped',
  'blocked',
  'clawed_back',
] as const;

export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export type ReferralBlockReason =
  'same_card' | 'same_device' | 'same_network' | 'email_alias' | 'disposable_email';

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

export function isReferralStatus(value: unknown): value is ReferralStatus {
  return typeof value === 'string' && (REFERRAL_STATUSES as readonly string[]).includes(value);
}

export function generateReferralCode(): string {
  let code = '';
  for (const byte of randomBytes(REFERRAL_CODE_LENGTH)) {
    code += CROCKFORD_ALPHABET[byte % CROCKFORD_ALPHABET.length];
  }
  return code;
}

export function normalizeReferralCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/-/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  return REFERRAL_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function referralLink(code: string): string {
  return absoluteUrl(`/r/${code}`);
}
