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

  it('redacts the dash-spelled, JSON-quoted and short AWS secret assignments', () => {
    // The CLI writes `aws_`, the SDK env vars and most YAML write `aws-`, and
    // a JSON config puts a quote between the name and the colon.
    const dashed = 'aws-secret-access-key = wJalrXUtnFEMI/K7MDENG+bPxRfiCY';
    const json = '{"aws_session_token": "FwoGZXIvYXdzEBYaDGxhbXBs"}';
    const short = 'aws_secret_access_key=shortish12';

    expect(redactSecrets(dashed)).not.toContain('wJalrXUtnFEMI');
    expect(redactSecrets(json)).not.toContain('FwoGZXIvYXdzEBYaDGxhbXBs');
    expect(redactSecrets(short)).not.toContain('shortish12');
  });

  it('redacts the gho_/ghu_/ghr_ GitHub token prefixes, not only ghp_/ghs_', () => {
    const body = 'abcdefghij0123456789ABCDEFGHIJ0123456789';
    for (const prefix of ['gho_', 'ghu_', 'ghr_', 'ghp_', 'ghs_']) {
      expect(redactSecrets(`${prefix}${body}`)).toBe('[REDACTED_GITHUB_TOKEN]');
    }
  });

  it('redacts GitHub tokens shorter than the 36-char user-to-server body', () => {
    expect(redactSecrets(`ghs_${'a'.repeat(30)}`)).toBe('[REDACTED_GITHUB_TOKEN]');
  });

  it('redacts variable-length AIza Google keys that do not use the Sy infix', () => {
    // Real keys are AIza + 35 chars; the infix is not always "Sy".
    const nonSy = 'AIzaB1cD3fG5hJ7kL9mN2pQ4rS6tU8vW0xY1zA3';
    const sy = 'AIzaSyD3fG5hJ7kL9mN2pQ4rS6tU8vW0xY1zA3b';

    expect(redactSecrets(nonSy)).toBe('[REDACTED_GOOGLE_KEY]');
    expect(redactSecrets(sy)).toBe('[REDACTED_GOOGLE_KEY]');
  });

  it('redacts AIza keys whose body is not exactly 35 characters', () => {
    // A fixed quantifier misses the short one outright and leaves the tail of
    // the long one in the preview, which is the worse of the two failures.
    expect(redactSecrets(`AIza${'a'.repeat(30)}`)).toBe('[REDACTED_GOOGLE_KEY]');
    expect(redactSecrets(`AIza${'b'.repeat(45)}`)).toBe('[REDACTED_GOOGLE_KEY]');
  });

  it('redacts postgresql:// and mongodb+srv:// credentials, not just the short schemes', () => {
    expect(redactSecrets('postgresql://alice:hunter2@db.example.com:5432/app')).toBe(
      'postgresql://[CREDENTIALS_REDACTED]@db.example.com:5432/app',
    );
    expect(redactSecrets('mongodb+srv://alice:hunter2@cluster.example.com/app')).toBe(
      'mongodb+srv://[CREDENTIALS_REDACTED]@cluster.example.com/app',
    );
    expect(redactSecrets('postgres://alice:hunter2@db.example.com:5432/app')).toBe(
      'postgres://[CREDENTIALS_REDACTED]@db.example.com:5432/app',
    );
  });

  it('redacts DB passwords that carry base64 punctuation, not just word characters', () => {
    // Generated passwords are base64, so `/` and `+` are routine. A password
    // class that excluded them read as a widening and was a live leak on the
    // Local -> BYOK handoff preview.
    expect(redactSecrets('postgres://alice:hun/ter2@db.example.com:5432/app')).toBe(
      'postgres://[CREDENTIALS_REDACTED]@db.example.com:5432/app',
    );
    expect(
      redactSecrets('DATABASE_URL=postgres://neondb_owner:npg_x9Kq/L2mZ@ep-1.aws.neon.tech/neondb'),
    ).not.toContain('npg_x9Kq/L2mZ');
    expect(redactSecrets('redis://default:aB3/xY9zQ1@redis.example.com:6379')).not.toContain(
      'aB3/xY9zQ1',
    );
    expect(redactSecrets('postgresql://alice:AbC/dEf+gH1@db.example.com:5432/app')).not.toContain(
      'AbC/dEf+gH1',
    );
    expect(redactSecrets('mongodb+srv://u:pa/ss@cluster0.example.net/db')).not.toContain('pa/ss');
  });

  it('redacts a bracketed named-secret value but leaves a placeholder alone', () => {
    // Rust admits `[` and `]` in the value class, so `token=[abc…]` is a
    // secret like any other; only a `[REDACTED…]` placeholder is exempt.
    expect(redactSecrets('token=[abcdefghij12345]')).toBe('token=[REDACTED]');
    expect(redactSecrets('aws_session_token=[FwoGZXIvYXdzEBYaDGxhbXBs]')).not.toContain(
      'FwoGZXIvYXdzEBYaDGxhbXBs',
    );
  });

  it('redacts bare secret/token assignments and JSON-quoted named secrets', () => {
    expect(redactSecrets('secret=abcdefghij12')).toBe('secret=[REDACTED]');
    expect(redactSecrets('token: abcdefghij12')).toBe('token=[REDACTED]');
    expect(redactSecrets('{"api_key": "abcdefghij123456"}')).not.toContain('abcdefghij123456');
    // Short bearer tokens count too — the Rust rule stops at 8 characters.
    expect(redactSecrets('Authorization: Bearer abcdefghij123')).toBe(
      'Authorization: Bearer [REDACTED_TOKEN]',
    );
  });

  it('does not re-redact a placeholder an earlier rule already substituted', () => {
    // Rule order means the vendor rules fire first; the named-secret rule then
    // sees `NAME=[REDACTED_*]` and must leave the attribution intact.
    expect(redactSecrets('OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456')).toBe(
      'OPENAI_API_KEY=[REDACTED_API_KEY]',
    );
    expect(redactSecrets(`GOOGLE_API_KEY=AIza${'a'.repeat(35)}`)).toBe(
      'GOOGLE_API_KEY=[REDACTED_GOOGLE_KEY]',
    );
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
