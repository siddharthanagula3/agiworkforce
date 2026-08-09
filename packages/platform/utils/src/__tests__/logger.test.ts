import { describe, expect, it } from 'vitest';
import { redactSecrets, scanSecrets } from '../logger';

/**
 * Parity suite for the TS redactor against the Rust CLI reference at
 * `apps/cli/src/secret_redaction.rs`. The TS port guards the Local→BYOK
 * handoff preview, so a pattern the CLI catches and this side misses is a
 * credential that crosses the trust boundary in cleartext.
 */
describe('secret redaction parity with the Rust CLI', () => {
  it('redacts PEM private key blocks across newlines', () => {
    const pem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEowIBAAKCAQEAvR8kL2mQ9xTfB1nJ4dYw7cZpH6sK0aVeR3gN8tXuC5iOqLmD',
      'bE7yUfWnA2jGh4KpZ1sQ3vT9xY6cR0mJ5dNbF8wLkS7uH2aOgP4eXtIrV6yQzB1n',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');

    expect(redactSecrets(pem)).toBe('[REDACTED_PRIVATE_KEY]');
    expect(scanSecrets(pem).map((f) => f.ruleId)).toContain('private-key');
  });

  it('redacts EC and OPENSSH private key blocks too', () => {
    const ec = '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIBs2\n-----END EC PRIVATE KEY-----';
    const openssh =
      '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1r\n-----END OPENSSH PRIVATE KEY-----';

    expect(redactSecrets(ec)).toBe('[REDACTED_PRIVATE_KEY]');
    expect(redactSecrets(openssh)).toBe('[REDACTED_PRIVATE_KEY]');
  });

  it('redacts ASIA temporary AWS access keys, not just AKIA long-lived ones', () => {
    expect(redactSecrets('key=ASIAIOSFODNN7EXAMPLE')).toBe('key=[REDACTED_AWS_KEY]');
    expect(redactSecrets('key=AKIAIOSFODNN7EXAMPLE')).toBe('key=[REDACTED_AWS_KEY]');
  });

  it('redacts aws_secret_access_key and aws_session_token assignments', () => {
    const secret = 'aws_secret_access_key = wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY';
    const session = 'aws_session_token: FwoGZXIvYXdzEBYaDGxhbXBsZXRva2Vu';

    expect(redactSecrets(secret)).not.toContain('wJalrXUtnFEMI');
    expect(redactSecrets(session)).not.toContain('FwoGZXIvYXdzEBYaDGxhbXBsZXRva2Vu');
  });

  it('redacts the gho_/ghu_/ghr_ GitHub token prefixes, not only ghp_/ghs_', () => {
    const body = 'abcdefghij0123456789ABCDEFGHIJ0123456789';
    for (const prefix of ['gho_', 'ghu_', 'ghr_', 'ghp_', 'ghs_']) {
      expect(redactSecrets(`${prefix}${body}`)).toBe('[REDACTED_GITHUB_TOKEN]');
    }
  });

  it('redacts variable-length AIza Google keys that do not use the Sy infix', () => {
    // Real keys are AIza + 35 chars; the infix is not always "Sy".
    const nonSy = 'AIzaB1cD3fG5hJ7kL9mN2pQ4rS6tU8vW0xY1zA3';
    const sy = 'AIzaSyD3fG5hJ7kL9mN2pQ4rS6tU8vW0xY1zA3b';

    expect(redactSecrets(nonSy)).toBe('[REDACTED_GOOGLE_KEY]');
    expect(redactSecrets(sy)).toBe('[REDACTED_GOOGLE_KEY]');
  });

  it('does not redact epoch-millisecond timestamps as payment cards', () => {
    // Regression: a generic 13-19 digit run swallowed every ms timestamp,
    // which made real logs unreadable. Fixed in the Rust desktop redactor.
    expect(redactSecrets('ts=1721469876543')).toBe('ts=1721469876543');
    expect(scanSecrets('ts=1721469876543')).toEqual([]);
    expect(redactSecrets('{"startedAt":1721469876543,"endedAt":1721469999001}')).toBe(
      '{"startedAt":1721469876543,"endedAt":1721469999001}',
    );
  });

  it('still redacts payment card numbers in the shapes cards actually take', () => {
    expect(redactSecrets('4111 1111 1111 1111')).toBe('[REDACTED]');
    expect(redactSecrets('4111-1111-1111-1111')).toBe('[REDACTED]');
    expect(redactSecrets('3782 822463 10005')).toBe('[REDACTED]');
    // Contiguous run with a plausible issuer identification number.
    expect(redactSecrets('4111111111111111')).toBe('[REDACTED]');
  });
});
