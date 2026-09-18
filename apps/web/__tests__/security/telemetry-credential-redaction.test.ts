import { describe, expect, it } from 'vitest';

import { FIELDS_NEVER_LOGGED } from '@/lib/identity/log-hygiene';
import {
  MAX_ATTRIBUTE_LENGTH,
  REDACTED,
  maskSecretText,
  redactAttributes,
  redactDeepValue,
  redactLogRecord,
  redactValue,
} from '@/lib/observability/redact';

const SECRET = 'do-not-export-this-value';

/**
 * Nothing that identifies or authenticates a person may leave the process as
 * telemetry. Redaction runs on the way in, before any exporter sees the bag,
 * so every entry point that builds one is exercised here rather than only the
 * one an adjacent suite happened to cover.
 */
describe('request telemetry does not leak credentials', () => {
  const credentialKeys = [
    'apiKey',
    'api_key',
    'authToken',
    'authorization',
    'bearerToken',
    'clientSecret',
    'cookie',
    'encryptionKey',
    'idToken',
    'password',
    'privateKey',
    'refreshToken',
    'sessionToken',
    'signingKey',
    'webhookSecret',
  ];

  it.each(credentialKeys)('blanks %s in a span attribute bag', (key) => {
    expect(redactAttributes({ [key]: SECRET })[key]).toBe(REDACTED);
  });

  it.each(credentialKeys)('blanks %s anywhere in a log record', (key) => {
    const record = redactLogRecord({ request: { headers: { [key]: SECRET } } });
    const headers = (record['request'] as Record<string, Record<string, unknown>>)['headers']!;
    expect(headers[key]).toBe(REDACTED);
  });

  it('blanks every field the log-hygiene contract forbids', () => {
    for (const field of FIELDS_NEVER_LOGGED) {
      expect(redactAttributes({ [field]: SECRET })[field], field).toBe(REDACTED);
    }
  });

  it('keeps counts and sizes that merely sound like secrets', () => {
    expect(redactAttributes({ tokenCount: 4096, textLength: 12, bodyBytes: 90 })).toEqual({
      tokenCount: 4096,
      textLength: 12,
      bodyBytes: 90,
    });
  });

  it.each([
    ['bearer', 'Bearer abcdefghijklmnopqrstuvwxyz012345'],
    ['stripe live', 'sk_live_51H8xQpAbCdEfGhIjKlMnOp'],
    ['github pat', 'ghp_0123456789abcdefghijABCDEFGHIJ0123'],
    ['google', 'AIzaSyA0123456789abcdefghijklmnopqrstu'],
    ['slack', 'xoxb-1234567890-abcdefghij'],
    ['jwt', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.QssW9wZG9uZQ'],
    ['email', 'person@example.com'],
  ])('masks a %s shaped value even under an innocent key', (_label, value) => {
    const masked = redactAttributes({ note: `saw ${value} in the header` })['note'];
    expect(masked).not.toContain(value);
    expect(masked).toContain(REDACTED);
  });

  it('masks a secret inside an error message and stack', () => {
    const error = new Error(`auth failed for sk_live_51H8xQpAbCdEfGhIjKlMnOp`);
    const redacted = redactDeepValue(error) as Record<string, string>;

    expect(redacted['message']).not.toContain('sk_live_');
    expect(redacted['message']).toContain(REDACTED);
    expect(redacted['type']).toBe('Error');
  });

  it('clamps an attribute so a pasted blob cannot ride out as one value', () => {
    const long = 'a'.repeat(MAX_ATTRIBUTE_LENGTH * 4);
    expect(redactValue(long).length).toBeLessThanOrEqual(MAX_ATTRIBUTE_LENGTH + 1);
  });

  it('drops objects, arrays and functions rather than stringifying them out', () => {
    expect(
      redactAttributes({
        nested: { apiKey: SECRET },
        list: [SECRET],
        fn: () => SECRET,
        ok: 'plain',
      }),
    ).toEqual({ ok: 'plain' });
  });

  it('stops descending before a cyclic payload can exhaust the gate', () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let index = 0; index < 20; index += 1) {
      const next: Record<string, unknown> = {};
      cursor['child'] = next;
      cursor = next;
    }
    cursor['leaked'] = SECRET;

    expect(JSON.stringify(redactDeepValue(deep))).not.toContain(SECRET);
  });

  it('never returns the raw value from the free-text masker it exports', () => {
    expect(maskSecretText('contact person@example.com now')).not.toContain('person@example.com');
  });
});
