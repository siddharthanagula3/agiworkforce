import { HAND_CHECKS, type HandCheck } from '@/lib/connectors/directory/hand-checked';
import type { DirectoryRecord } from '@/lib/connectors/directory/types';

export const DEFAULT_LIST_SHORT_BELOW = 50;

const FIRST_PARTY_BADGE = 'first-party';
const FINANCIAL_CATEGORY = 'Financial services';

const MONEY_SIGNAL_PATTERN = new RegExp(
  [
    'pay(?:s|ment|ments|out|outs|er|ee)?',
    'checkout',
    'bank(?:ing)?',
    'wallet',
    'crypto\\w*',
    'bitcoin',
    'ethereum',
    'solana',
    'defi',
    'token',
    'swap',
    'trad(?:e|es|er|ing)',
    'broker\\w*',
    'exchange',
    'forex',
    'stocks?',
    'invest\\w*',
    'transfer\\w*',
    'remit\\w*',
    'withdraw\\w*',
    'deposit\\w*',
    'refund\\w*',
    'purchas\\w*',
    'buy',
    'sell',
    'order',
    'orders',
    'loan\\w*',
    'lend\\w*',
    'credit',
    'billing',
    'invoice\\w*',
    'stripe',
    'paypal',
    'plaid',
    'venmo',
    'binance',
    'coinbase',
  ]
    .map((signal) => `\\b${signal}\\b`)
    .join('|'),
  'i',
);

export function isFirstParty(record: DirectoryRecord): boolean {
  return record.badge === FIRST_PARTY_BADGE;
}

export function requiresApiKey(record: DirectoryRecord): boolean {
  return record.authMode === 'api-key' || record.connectable === 'api-key-form';
}

export function canMoveMoney(record: DirectoryRecord): boolean {
  if (record.categories.includes(FINANCIAL_CATEGORY)) return true;
  const signals = [record.id, record.name, record.description, ...record.toolNames].join(' ');
  return MONEY_SIGNAL_PATTERN.test(signals);
}

export function handCheckFor(
  record: DirectoryRecord,
  checks: ReadonlyMap<string, HandCheck> = HAND_CHECKS,
): HandCheck | undefined {
  return checks.get(record.id);
}

export function isEligibleForListing(
  record: DirectoryRecord,
  checks: ReadonlyMap<string, HandCheck> = HAND_CHECKS,
): boolean {
  if (isFirstParty(record)) return true;
  if (requiresApiKey(record)) return false;
  return handCheckFor(record, checks) !== undefined || !canMoveMoney(record);
}

export function isInDefaultListing(
  record: DirectoryRecord,
  checks: ReadonlyMap<string, HandCheck> = HAND_CHECKS,
): boolean {
  return (
    isFirstParty(record) ||
    (handCheckFor(record, checks) !== undefined && isEligibleForListing(record, checks))
  );
}
