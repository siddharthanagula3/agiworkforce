/**
 * telemetryRedaction.test.ts — D3 fix coverage
 *
 * Locks in the secret-redaction patterns so a future regression that adds
 * a new error path won't leak credentials to the telemetry endpoint.
 */

import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../services/telemetry';

describe('redactSecrets', () => {
  it('returns input unchanged when no secret matches', () => {
    expect(redactSecrets('hello world')).toBe('hello world');
    expect(redactSecrets('')).toBe('');
    expect(redactSecrets('error: file not found at /repo/src/x.ts')).toBe(
      'error: file not found at /repo/src/x.ts',
    );
  });

  it('redacts a JWT', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    expect(redactSecrets(`401 Unauthorized: token=${jwt}`)).toBe(
      '401 Unauthorized: token=[REDACTED]',
    );
  });

  it('redacts Bearer tokens (case-insensitive)', () => {
    expect(redactSecrets('Authorization: Bearer abcDEF1234567890')).toBe(
      'Authorization: [REDACTED]',
    );
    expect(redactSecrets('header: bearer XXXXXXXXXXXX')).toBe('header: [REDACTED]');
  });

  it('redacts Anthropic API keys', () => {
    expect(redactSecrets('failed: sk-ant-api03-abcdefghijklmnopqrstuvwxyz123')).toBe(
      'failed: [REDACTED]',
    );
  });

  it('redacts OpenAI project keys', () => {
    expect(redactSecrets('key=sk-proj-abcdefghijklmnopqrstuvwx')).toBe('key=[REDACTED]');
  });

  it('redacts generic OpenAI sk- keys', () => {
    expect(redactSecrets('OPENAI_API_KEY=sk-AbCdEfGhIjKlMnOpQrStUvWxYz')).toBe(
      'OPENAI_API_KEY=[REDACTED]',
    );
  });

  it('redacts Stripe / live/test keys', () => {
    expect(redactSecrets('STRIPE=sk_live_TELEMETRY_TEST_FIXTURE_REDACTED')).toBe('STRIPE=[REDACTED]');
    expect(redactSecrets('STRIPE=sk_test_abcdefghijklmnop')).toBe('STRIPE=[REDACTED]');
  });

  it('redacts Slack tokens', () => {
    expect(redactSecrets('SLACK=xoxb-1234567890-abcdefg')).toBe('SLACK=[REDACTED]');
    expect(redactSecrets('SLACK=xoxp-1234567890-abc')).toBe('SLACK=[REDACTED]');
  });

  it('redacts GitHub PATs', () => {
    expect(redactSecrets('GH=ghp_1234567890abcdefghijklmnopqrstuvwxyz')).toBe('GH=[REDACTED]');
  });

  it('redacts Google API keys', () => {
    expect(redactSecrets('GOOGLE=AIzaSyA1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R')).toBe(
      'GOOGLE=[REDACTED]',
    );
  });

  it('redacts AWS access keys', () => {
    expect(redactSecrets('AWS=AKIAIOSFODNN7EXAMPLE')).toBe('AWS=[REDACTED]');
  });

  it('redacts multiple secrets in one string', () => {
    const input =
      'multi: Bearer abc123XYZ + sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaa + ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const result = redactSecrets(input);
    expect(result).not.toContain('Bearer');
    expect(result).not.toContain('sk-ant');
    expect(result).not.toContain('ghp_');
    expect(result).toMatch(/\[REDACTED\].*\[REDACTED\].*\[REDACTED\]/);
  });

  it('does not redact innocuous strings that resemble keys', () => {
    expect(redactSecrets('this is a long string with sk- prefix')).toBe(
      'this is a long string with sk- prefix',
    );
    expect(redactSecrets('AKIA-too-short')).toBe('AKIA-too-short');
  });

  it('handles non-string defensively', () => {
    // @ts-expect-error intentional type abuse
    expect(redactSecrets(undefined)).toBeUndefined();
    // @ts-expect-error intentional type abuse
    expect(redactSecrets(123)).toBe(123);
  });
});
