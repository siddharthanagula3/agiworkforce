/**
 * BIZ-046 — the privacy retention schedule must describe what happens to
 * billing records, and must keep agreeing with the erasure code.
 *
 * The schedule at app/privacy/page.tsx §05 listed the account, conversations,
 * temporary chats, files, sandboxes, the security audit log and vendor backups,
 * and nothing about money. That omission is not neutral: `account-erasure.ts`
 * deliberately KEEPS `credit_idempotency_keys` and `credit_settlement_jobs`
 * after an account is erased, and keeps the `organization_usage_ledger` row with
 * the user id nulled — retention a policy is required to disclose.
 *
 * These assertions are two-sided on purpose. The copy assertion fails if the
 * disclosure is deleted; the code assertions fail if erasure changes so that the
 * disclosure becomes false (e.g. someone starts deleting the idempotency keys),
 * which is the moment the sentence has to be rewritten rather than kept.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect } from 'vitest';

import {
  ANONYMIZED_USER_COLUMNS,
  UNDELETED_USER_TABLES,
  USER_SCOPED_TABLES,
} from '../lib/server/account-erasure';

function readNormalized(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf-8').replace(/\s+/g, ' ');
}

const privacySource = readNormalized('../app/privacy/page.tsx');

describe('BIZ-046 billing-record retention disclosure', () => {
  it('gives billing records their own row in the retention schedule', () => {
    expect(privacySource).toContain('Billing records');
  });

  it('discloses that some billing rows outlive the account', () => {
    expect(privacySource).toMatch(/survive on purpose/i);
    expect(privacySource).toMatch(/double-charge protection keys/i);
  });

  it('does not claim a maximum age no job enforces', () => {
    expect(privacySource).toMatch(/No maximum age is enforced on billing rows today/i);
  });

  it('matches erasure: subscription, credit and usage rows are deleted', () => {
    const deleted = new Set(USER_SCOPED_TABLES.map((entry) => entry.table));
    for (const table of ['subscriptions', 'credit_transactions', 'token_credits', 'usage_events']) {
      expect(deleted.has(table)).toBe(true);
    }
  });

  it('matches erasure: double-charge and in-flight settlement rows are kept', () => {
    expect(Object.keys(UNDELETED_USER_TABLES)).toEqual(
      expect.arrayContaining(['credit_idempotency_keys', 'credit_settlement_jobs']),
    );
  });

  it('matches erasure: organization billing history is kept with the user id removed', () => {
    const anonymized = ANONYMIZED_USER_COLUMNS.find(
      (entry) => entry.table === 'organization_usage_ledger',
    );
    expect(anonymized?.column).toBe('user_id');
  });
});
