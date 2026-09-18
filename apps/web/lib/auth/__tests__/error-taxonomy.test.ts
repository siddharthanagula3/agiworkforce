import { describe, expect, it } from 'vitest';

import {
  AUTH_ERROR_KINDS,
  AUTH_NOTICE_KINDS,
  classifyAuthError,
  classifyProviderCallbackError,
  isAuthNoticeKind,
  isRetryableAuthError,
} from '../error-taxonomy';
import {
  AUTH_ERROR_LOCALIZED_COPY,
  AUTH_ERROR_SOURCE_COPY,
  authErrorCopyKey,
  authErrorResourceBundle,
} from '../error-taxonomy.copy';

function vendor(first: Record<string, unknown>, envelope: Record<string, unknown> = {}) {
  return { code: 'api_response_error', ...envelope, errors: [first] };
}

describe('auth error taxonomy', () => {
  it('separates an expired code from an incorrect one', () => {
    expect(classifyAuthError(vendor({ code: 'verification_expired' })).kind).toBe('code_expired');
    expect(classifyAuthError(vendor({ code: 'form_code_incorrect' })).kind).toBe('code_incorrect');
  });

  it('reads a spent sign-in link as its own state, not a generic failure', () => {
    expect(classifyAuthError(vendor({ code: 'verification_already_verified' })).kind).toBe(
      'link_already_used',
    );
    expect(classifyAuthError(vendor({ code: 'client_state_invalid' })).kind).toBe('link_expired');
  });

  it('takes a 429 as a rate limit whatever code rides with it', () => {
    const descriptor = classifyAuthError(
      vendor({ code: 'form_password_incorrect', retryAfter: 30 }, { status: 429 }),
    );

    expect(descriptor.kind).toBe('rate_limited');
    expect(descriptor.retryAfterSeconds).toBe(30);
  });

  it('tells a cancelled provider window from a provider that is down', () => {
    expect(classifyAuthError(vendor({ code: 'oauth_access_denied' })).kind).toBe(
      'provider_cancelled',
    );
    expect(classifyAuthError(vendor({ code: 'oauth_fetch_user_error' })).kind).toBe(
      'provider_outage',
    );
    expect(classifyAuthError(vendor({}, { status: 503 })).kind).toBe('provider_outage');
  });

  it('separates a dismissed passkey prompt from a passkey this device does not hold', () => {
    expect(classifyAuthError(vendor({ code: 'passkey_retrieval_cancelled' })).kind).toBe(
      'passkey_dismissed',
    );
    expect(classifyAuthError(vendor({ code: 'passkey_not_registered' })).kind).toBe(
      'passkey_unrecognized',
    );
  });

  it('reads a suspended or locked account as a terminal state', () => {
    expect(isAuthNoticeKind(classifyAuthError(vendor({ code: 'user_banned' })).kind)).toBe(true);
    expect(isAuthNoticeKind(classifyAuthError(vendor({ code: 'user_locked' })).kind)).toBe(true);
  });

  it('treats a fetch failure as offline rather than as a provider fault', () => {
    expect(classifyAuthError(new TypeError('Failed to fetch')).kind).toBe('network_unreachable');
  });

  it('keeps a form-validation sentence, and drops every other vendor sentence', () => {
    const kept = classifyAuthError(
      vendor({ code: 'form_password_pwned', longMessage: 'Found in a breach.' }),
    );
    const dropped = classifyAuthError(
      vendor({ code: 'unmapped_internal_code', longMessage: 'shard 7 of user_pii lookup failed' }),
    );

    expect(kept.vendorMessage).toBe('Found in a breach.');
    expect(dropped.vendorMessage).toBeUndefined();
    expect(dropped.kind).toBe('unexpected');
  });

  it('maps the parameter a vendor names to the field the form owns', () => {
    expect(classifyAuthError(vendor({ meta: { paramName: 'identifier' } })).field).toBe('email');
    expect(classifyAuthError(vendor({ meta: { paramName: 'emailAddress' } })).field).toBe('email');
    expect(classifyAuthError(vendor({ meta: { paramName: 'code' } })).field).toBe('code');
  });

  it('reads the OAuth2 parameter the provider redirects back with', () => {
    expect(classifyProviderCallbackError('access_denied')).toBe('provider_cancelled');
    expect(classifyProviderCallbackError('server_error')).toBe('provider_outage');
    expect(classifyProviderCallbackError('something_new')).toBe('provider_outage');
    expect(classifyProviderCallbackError(undefined)).toBeNull();
    expect(classifyProviderCallbackError('  ')).toBeNull();
  });

  it('offers a retry only where retrying can change the answer', () => {
    expect(isRetryableAuthError('passkey_dismissed')).toBe(true);
    expect(isRetryableAuthError('provider_outage')).toBe(true);
    expect(isRetryableAuthError('identifier_not_found')).toBe(false);
  });
});

describe('auth error copy', () => {
  it('carries a title, a message and an action for every kind in every locale', () => {
    for (const [locale, table] of Object.entries(AUTH_ERROR_LOCALIZED_COPY)) {
      for (const kind of AUTH_ERROR_KINDS) {
        const entry = table[kind];
        expect(entry, `${locale}/${kind}`).toBeDefined();
        for (const part of ['title', 'message', 'action'] as const) {
          expect(entry[part].trim().length, `${locale}/${kind}/${part}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('names every notice kind among the kinds it can classify', () => {
    for (const kind of AUTH_NOTICE_KINDS) {
      expect(AUTH_ERROR_KINDS).toContain(kind);
    }
  });

  it('builds a resource bundle keyed the way the catalogue is read', () => {
    const bundle = authErrorResourceBundle('es');

    expect(Object.keys(bundle).sort()).toEqual([...AUTH_ERROR_KINDS].sort());
    expect(authErrorCopyKey('rate_limited', 'title')).toBe('errorTaxonomy.rate_limited.title');
    expect(bundle['rate_limited']?.title).not.toBe(AUTH_ERROR_SOURCE_COPY.rate_limited.title);
  });

  it('never leaks an identifier or a vendor internal into the copy', () => {
    for (const table of Object.values(AUTH_ERROR_LOCALIZED_COPY)) {
      for (const kind of AUTH_ERROR_KINDS) {
        expect(table[kind].message).not.toMatch(/clerk|@|\bid\b/i);
      }
    }
  });
});
