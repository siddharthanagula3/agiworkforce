import { describe, expect, it } from 'vitest';

import { directoryRecord } from './fixtures';
import {
  parseHandChecks,
  HAND_CHECKS,
  type HandCheck,
} from '@/lib/connectors/directory/hand-checked';
import {
  canMoveMoney,
  isEligibleForListing,
  isInDefaultListing,
  requiresApiKey,
} from '@/lib/connectors/directory/listing';

const CHECK: HandCheck = {
  id: 'com.example/checked',
  checkedOn: '2026-10-08',
  checkedBy: 'owner',
  moneyMoving: false,
  note: 'Signed in with a test account and ran every tool.',
};
const CHECKS = parseHandChecks([CHECK]);

describe('hand-check list', () => {
  it('ships empty so nothing is vouched for until a person checks it', () => {
    expect(HAND_CHECKS.size).toBe(0);
  });

  it('rejects an entry with a missing field, a bad date, an extra key or a duplicate id', () => {
    const { note: _note, ...withoutNote } = CHECK;
    for (const bad of [
      [withoutNote],
      [{ ...CHECK, checkedOn: 'yesterday' }],
      [{ ...CHECK, checkedOn: '2026-13-45' }],
      [{ ...CHECK, moneyMoving: 'no' }],
      [{ ...CHECK, extra: true }],
      [CHECK, CHECK],
    ]) {
      expect(() => parseHandChecks(bad)).toThrow();
    }
  });
});

describe('canMoveMoney', () => {
  it('flags the financial category, and payment or trading wording in name, description or tools', () => {
    expect(canMoveMoney(directoryRecord({ id: 'a', categories: ['Financial services'] }))).toBe(
      true,
    );
    expect(canMoveMoney(directoryRecord({ id: 'b', description: 'Place trades for you.' }))).toBe(
      true,
    );
    expect(canMoveMoney(directoryRecord({ id: 'c', toolNames: ['transfer_funds'] }))).toBe(true);
    expect(canMoveMoney(directoryRecord({ id: 'd', name: 'Crypto Desk' }))).toBe(true);
  });

  it('does not flag a plain notes or code connector', () => {
    expect(
      canMoveMoney(
        directoryRecord({ id: 'e', description: 'Sync notes.', toolNames: ['list_notes'] }),
      ),
    ).toBe(false);
  });
});

describe('listing eligibility', () => {
  const unchecked = directoryRecord({ id: 'com.example/unchecked', authMode: 'oauth' });

  it('treats an API-key server as unlistable unless it is first-party', () => {
    const keyed = directoryRecord({ id: 'k', authMode: 'api-key', connectable: 'api-key-form' });
    expect(requiresApiKey(keyed)).toBe(true);
    expect(isEligibleForListing(keyed, CHECKS)).toBe(false);
    expect(isEligibleForListing({ ...keyed, badge: 'first-party' }, CHECKS)).toBe(true);
  });

  it('puts only first-party and hand-checked entries in the default view', () => {
    const checked = directoryRecord({ id: CHECK.id, authMode: 'oauth' });
    expect(isInDefaultListing(unchecked, CHECKS)).toBe(false);
    expect(isInDefaultListing(checked, CHECKS)).toBe(true);
    expect(isInDefaultListing({ ...unchecked, badge: 'first-party' }, CHECKS)).toBe(true);
  });

  it('lets a hand-checked money-moving entry through and holds back an unchecked one', () => {
    const money = directoryRecord({ id: CHECK.id, categories: ['Financial services'] });
    expect(isEligibleForListing({ ...money, id: 'com.example/other' }, CHECKS)).toBe(false);
    expect(isEligibleForListing(money, CHECKS)).toBe(true);
  });
});
