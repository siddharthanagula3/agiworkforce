import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveCheckoutReturnOrigin } from '../checkout-return-origin';

const CONFIGURED = 'https://agiworkforce.com';

function requestFrom(origin: string | null): NextRequest {
  const headers = new Headers();
  if (origin !== null) headers.set('origin', origin);
  return new NextRequest('https://agiworkforce.com/api/checkout', { headers });
}

describe('resolveCheckoutReturnOrigin', () => {
  const previous = { ...process.env };

  beforeEach(() => {
    process.env['NEXT_PUBLIC_APP_URL'] = CONFIGURED;
    process.env['ALLOWED_ORIGINS'] = 'https://agiworkforce.com,http://localhost:3000';
  });

  afterEach(() => {
    process.env = { ...previous };
  });

  // A buyer who started checkout on localhost used to be returned to production
  // on confirm, landing on a page that knew nothing about their session.
  it('returns the caller to the allowlisted origin it started from', () => {
    expect(resolveCheckoutReturnOrigin(requestFrom('http://localhost:3000'))).toBe(
      'http://localhost:3000',
    );
  });

  it('keeps production callers on production', () => {
    expect(resolveCheckoutReturnOrigin(requestFrom('https://agiworkforce.com'))).toBe(CONFIGURED);
  });

  it('refuses an origin the allowlist does not vouch for', () => {
    expect(resolveCheckoutReturnOrigin(requestFrom('https://evil.example'))).toBe(CONFIGURED);
  });

  it('refuses a look-alike suffix of an allowed host', () => {
    expect(resolveCheckoutReturnOrigin(requestFrom('https://agiworkforce.com.evil.test'))).toBe(
      CONFIGURED,
    );
  });

  it('falls back to the configured origin when no Origin header is sent', () => {
    expect(resolveCheckoutReturnOrigin(requestFrom(null))).toBe(CONFIGURED);
  });
});
