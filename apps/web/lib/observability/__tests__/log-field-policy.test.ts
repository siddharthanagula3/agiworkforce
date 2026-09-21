import { describe, expect, it } from 'vitest';

import { FIELDS_NEVER_LOGGED } from '@/lib/identity/log-hygiene';
import {
  IDENTIFIER_KEY_QUALIFIERS,
  DENIED_KEY_SUBSTRINGS,
  NEVER_SURVIVING_SEGMENTS,
  deniedValueSurvives,
  isDeniedFieldName,
  neverLoggedSet,
} from '@/lib/observability/log-field-policy';
import { REDACTED, redactAttributes, redactLogRecord } from '@/lib/observability/redact';

const neverLogged = neverLoggedSet(FIELDS_NEVER_LOGGED);
const denied = (key: string) => isDeniedFieldName(key, neverLogged);

/**
 * The names below are the ones the product actually logs. Each was replaced by
 * "[redacted]", so the line that named a charge, an orphaned blob or the model
 * that served a turn identified none of them.
 */
const IDENTIFIER_FIELDS = [
  'idempotencyKey',
  'objectKey',
  'resolvedModelKey',
  'priorModelKey',
  'flagKey',
  'pluginKey',
  'envKey',
  'operationKey',
  'cacheKey',
  'routeKey',
];

const CREDENTIAL_FIELDS = [
  'key',
  'apiKey',
  'privateKey',
  'secretKey',
  'encryptionKey',
  'signingKey',
  'sessionKey',
  'accessKey',
  'licenseKey',
  'vapidKey',
  'decryptionKey',
  'webhookKey',
];

describe('isDeniedFieldName', () => {
  it('keeps an identifier whose qualifier names a row, not a credential', () => {
    for (const field of IDENTIFIER_FIELDS) {
      expect(denied(field), `${field} should reach the log line`).toBe(false);
    }
  });

  it('denies a key whose qualifier is unlisted, and a bare key', () => {
    for (const field of CREDENTIAL_FIELDS) {
      expect(denied(field), `${field} must never reach a log line`).toBe(true);
    }
  });

  it('denies a credential substring even when the name ends in an exempt key', () => {
    for (const field of [
      'secretObjectKey',
      'credentialCacheKey',
      'apiKeyModelKey',
      'refresh_token_route_key',
      'fingerprintObjectKey',
    ]) {
      expect(denied(field), `${field} must never reach a log line`).toBe(true);
    }
  });

  it('no name the exemption speaks for carries a denied substring', () => {
    for (const field of [
      ...IDENTIFIER_FIELDS,
      ...IDENTIFIER_KEY_QUALIFIERS.map((q) => `${q}Key`),
    ]) {
      const lower = field.toLowerCase();
      const hit = DENIED_KEY_SUBSTRINGS.find((needle) => lower.includes(needle));
      expect(hit, `${field} would now be denied by the substring "${String(hit)}"`).toBeUndefined();
      expect(denied(field), `${field} must still reach the log line`).toBe(false);
    }
  });

  it('denies every qualifier nobody has classified', () => {
    expect(denied('providerKey')).toBe(true);
    expect(denied('tenantKey')).toBe(true);
    expect(denied('somethingNobodyHasThoughtOfYetKey')).toBe(true);
  });

  it('still denies the customer text and credential names the build check refuses', () => {
    for (const field of FIELDS_NEVER_LOGGED) expect(denied(field)).toBe(true);
    for (const field of ['email', 'customerEmail', 'phone', 'ssn', 'cookie', 'signature']) {
      expect(denied(field)).toBe(true);
    }
  });

  it('denies the device fingerprint, which the device poll route compares as an authenticator', () => {
    for (const field of [
      'fingerprint',
      'deviceFingerprint',
      'device_fingerprint',
      'expectedFingerprint',
      'providedFingerprint',
      'fingerprintHash',
    ]) {
      expect(denied(field), `${field} must never reach a log line`).toBe(true);
      expect(redactLogRecord({ [field]: 'a1b2c3d4e5f6' })[field]).toBe(REDACTED);
    }
    expect(redactAttributes({ fingerprint: 'a1b2c3d4e5f6' })['fingerprint']).toBe(REDACTED);
  });

  it('carries every name the previous redactor denied, because the list may only grow', () => {
    const previouslyDenied = [
      'arg',
      'args',
      'argument',
      'arguments',
      'authorization',
      'body',
      'completion',
      'cookie',
      'cookies',
      'credential',
      'credentials',
      'cvv',
      'email',
      'iban',
      'jwt',
      'key',
      'otp',
      'passphrase',
      'password',
      'passwd',
      'payload',
      'phone',
      'prompt',
      'pwd',
      'query',
      'secret',
      'signature',
      'ssn',
      'text',
      'token',
      'access_token',
      'api_key',
      'apikey',
      'client_secret',
      'fingerprint',
      'private_key',
      'refresh_token',
      'session_token',
    ];
    for (const field of previouslyDenied) {
      expect(denied(field), `${field} was denied before and must stay denied`).toBe(true);
    }
  });

  it('classifies every declared identifier qualifier as an identifier', () => {
    for (const qualifier of IDENTIFIER_KEY_QUALIFIERS) {
      expect(denied(`${qualifier}Key`), `${qualifier}Key`).toBe(false);
    }
  });
});

describe('deniedValueSurvives', () => {
  it('keeps a boolean under a denied name, because presence is not the value', () => {
    expect(deniedValueSurvives('hasSecret', true)).toBe(true);
    expect(deniedValueSurvives('fingerprintProvided', false)).toBe(true);
  });

  it('keeps a count or a length under a denied name that is neither credential nor personal', () => {
    expect(deniedValueSurvives('query', 42)).toBe(true);
    expect(deniedValueSurvives('body', 1024)).toBe(true);
    expect(deniedValueSurvives('prompt', 3)).toBe(true);
  });

  it('refuses a number under a personal or a credential name', () => {
    for (const segment of NEVER_SURVIVING_SEGMENTS) {
      expect(deniedValueSurvives(segment, 1234), segment).toBe(false);
    }
    expect(deniedValueSurvives('customerPhone', 5551234)).toBe(false);
    expect(deniedValueSurvives('revokedCredentials', 3)).toBe(false);
    expect(deniedValueSurvives('sessionToken', 8)).toBe(false);
  });

  it('still keeps a presence flag under a credential name, because a boolean is not the secret', () => {
    expect(deniedValueSurvives('hasSecret', true)).toBe(true);
    expect(deniedValueSurvives('hasApiKey', false)).toBe(true);
  });

  it('refuses a string and a non-finite number', () => {
    expect(deniedValueSurvives('apiKey', 'sk_live_FAKEFAKEFAKE0001')).toBe(false);
    expect(deniedValueSurvives('count', Number.NaN)).toBe(false);
  });
});

describe('the log record an operator reads', () => {
  it('names the charge, the blob and the model the turn used', () => {
    const record = redactLogRecord({
      idempotencyKey: 'idem_01HZY',
      objectKey: 'workspaces/1/uploads/2/report.pdf',
      resolvedModelKey: 'fast-tier-primary',
      hasSecret: true,
      query: 17,
      apiKey: 'sk_live_FAKEFAKEFAKE0001',
      email: 'person@example.com',
    });

    expect(record['idempotencyKey']).toBe('idem_01HZY');
    expect(record['objectKey']).toBe('workspaces/1/uploads/2/report.pdf');
    expect(record['resolvedModelKey']).toBe('fast-tier-primary');
    expect(record['hasSecret']).toBe(true);
    expect(record['query']).toBe(17);
    expect(record['apiKey']).toBe(REDACTED);
    expect(record['email']).toBe(REDACTED);
  });

  it('masks a credential that rides in under an identifier name', () => {
    const record = redactLogRecord({ objectKey: 'blob for sk_live_FAKEFAKEFAKE0001' });
    expect(record['objectKey']).toBe(`blob for ${REDACTED}`);
  });

  it('applies the same rule to span attributes', () => {
    const attributes = redactAttributes({
      idempotencyKey: 'idem_01HZY',
      apiKey: 'sk_live_FAKEFAKEFAKE0001',
      hasSecret: false,
    });
    expect(attributes['idempotencyKey']).toBe('idem_01HZY');
    expect(attributes['apiKey']).toBe(REDACTED);
    expect(attributes['hasSecret']).toBe(false);
  });
});
