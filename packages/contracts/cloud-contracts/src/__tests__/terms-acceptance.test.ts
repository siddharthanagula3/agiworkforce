import { describe, expect, it } from 'vitest';

import { TERMS_ACCEPTANCE_SURFACES, TermsAcceptanceRequestSchema } from '../terms-acceptance';

describe('terms acceptance request', () => {
  it.each(TERMS_ACCEPTANCE_SURFACES)(
    'stays valid for %s without the marketing email field',
    (surface) => {
      const parsed = TermsAcceptanceRequestSchema.parse({ surface, version: '2026-09-23' });

      expect(parsed).toEqual({ surface, version: '2026-09-23' });
      expect('marketingEmailNoticeVersion' in parsed).toBe(false);
    },
  );

  it('carries the privacy notice version the person saw when they opted in', () => {
    expect(
      TermsAcceptanceRequestSchema.parse({
        surface: 'web-signup',
        version: '2026-09-23',
        marketingEmailNoticeVersion: '2026-09-29',
      }),
    ).toEqual({
      surface: 'web-signup',
      version: '2026-09-23',
      marketingEmailNoticeVersion: '2026-09-29',
    });
  });

  it('carries no opt-in under the name the field was first built with', () => {
    const parsed = TermsAcceptanceRequestSchema.parse({
      surface: 'web-signup',
      version: '2026-09-23',
      productUpdatesNoticeVersion: '2026-09-29',
    });

    expect(parsed).toEqual({ surface: 'web-signup', version: '2026-09-23' });
  });

  it.each(['', 'x'.repeat(33), null, true, 20260929])(
    'refuses %j as a notice version instead of reading it as an opt-in',
    (marketingEmailNoticeVersion) => {
      expect(
        TermsAcceptanceRequestSchema.safeParse({
          surface: 'web-signup',
          version: '2026-09-23',
          marketingEmailNoticeVersion,
        }).success,
      ).toBe(false);
    },
  );
});
