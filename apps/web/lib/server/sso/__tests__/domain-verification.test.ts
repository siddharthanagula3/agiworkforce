import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  domainVerificationInstructions,
  issueDomainVerificationToken,
  verifyDomainOwnership,
  type TxtResolver,
} from '../domain-verification';

function resolverReturning(records: string[][]): TxtResolver {
  return { resolveTxt: async () => records };
}

function resolverThrowing(code: string): TxtResolver {
  return {
    resolveTxt: async () => {
      const error = new Error(`dns failure ${code}`) as Error & { code: string };
      error.code = code;
      throw error;
    },
  };
}

describe('issueDomainVerificationToken', () => {
  it('issues a high-entropy hex token that satisfies the database constraint', () => {
    const token = issueDomainVerificationToken();
    expect(token).toMatch(/^[a-f0-9]{48}$/);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token.length).toBeLessThanOrEqual(64);
  });

  it('does not repeat', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => issueDomainVerificationToken()));
    expect(tokens.size).toBe(200);
  });
});

describe('domainVerificationInstructions', () => {
  it('names a record scoped to the claimed domain', () => {
    expect(domainVerificationInstructions('example.com', 'abc123')).toEqual({
      recordType: 'TXT',
      recordName: '_agiworkforce-sso.example.com',
      recordValue: 'agiworkforce-sso-verification=abc123',
    });
  });
});

describe('verifyDomainOwnership', () => {
  const token = 'a'.repeat(48);
  const value = `agiworkforce-sso-verification=${token}`;

  it('verifies when the published record matches', async () => {
    await expect(
      verifyDomainOwnership('example.com', token, resolverReturning([[value]])),
    ).resolves.toEqual({ verified: true });
  });

  it('queries the challenge record, not the bare domain', async () => {
    const resolveTxt = vi.fn(async () => [[value]]);
    await verifyDomainOwnership('example.com', token, { resolveTxt });
    expect(resolveTxt).toHaveBeenCalledWith('_agiworkforce-sso.example.com');
  });

  it('joins the chunks of a TXT record longer than 255 bytes', async () => {
    const split = [value.slice(0, 10), value.slice(10)];
    await expect(
      verifyDomainOwnership('example.com', token, resolverReturning([split])),
    ).resolves.toEqual({ verified: true });
  });

  it('finds the matching record among unrelated TXT records', async () => {
    await expect(
      verifyDomainOwnership('example.com', token, resolverReturning([['v=spf1 -all'], [value]])),
    ).resolves.toEqual({ verified: true });
  });

  it('does NOT verify when another connection’s token is published', async () => {
    const other = `agiworkforce-sso-verification=${'b'.repeat(48)}`;
    await expect(
      verifyDomainOwnership('example.com', token, resolverReturning([[other]])),
    ).resolves.toEqual({ verified: false, reason: 'token_mismatch' });
  });

  it('does NOT verify on a token that merely shares a prefix', async () => {
    const truncated = `agiworkforce-sso-verification=${token.slice(0, 40)}`;
    await expect(
      verifyDomainOwnership('example.com', token, resolverReturning([[truncated]])),
    ).resolves.toEqual({ verified: false, reason: 'token_mismatch' });
  });

  it('reports a missing record when nothing is published', async () => {
    await expect(
      verifyDomainOwnership('example.com', token, resolverReturning([])),
    ).resolves.toEqual({ verified: false, reason: 'no_record' });
  });

  it('reports a missing record when only unrelated TXT records exist', async () => {
    await expect(
      verifyDomainOwnership('example.com', token, resolverReturning([['v=spf1 -all']])),
    ).resolves.toEqual({ verified: false, reason: 'no_record' });
  });

  it.each(['ENOTFOUND', 'ENODATA'])(
    'treats %s as a not-yet-published record rather than an outage',
    async (code) => {
      await expect(
        verifyDomainOwnership('example.com', token, resolverThrowing(code)),
      ).resolves.toEqual({ verified: false, reason: 'no_record' });
    },
  );

  it('distinguishes a genuine resolver failure so an operator is not told to add a record', async () => {
    await expect(
      verifyDomainOwnership('example.com', token, resolverThrowing('ESERVFAIL')),
    ).resolves.toEqual({ verified: false, reason: 'lookup_failed' });
  });

  it('never verifies against an empty expected token', async () => {
    await expect(
      verifyDomainOwnership(
        'example.com',
        '',
        resolverReturning([['agiworkforce-sso-verification=']]),
      ),
    ).resolves.toEqual({ verified: false, reason: 'no_record' });
  });
});
