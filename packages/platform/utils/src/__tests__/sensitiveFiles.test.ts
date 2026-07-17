import { describe, expect, it } from 'vitest';
import { isSensitiveFile, matchSensitivePattern } from '../sensitiveFiles';

describe('isSensitiveFile', () => {
  it.each([
    // dotenv
    ['.env'],
    ['.env.local'],
    ['.env.production'],
    ['src/config/.env.staging'],
    ['/home/u/proj/.env'],
    ['.envrc'],

    // secrets files
    ['secrets.json'],
    ['secret.yaml'],
    ['secrets.yml'],
    ['secret.toml'],
    ['secrets.txt'],
    ['secrets.env'],
    ['secret.js'],
    ['secret.ts'],
    ['/home/u/proj/secrets.json'],

    // credentials
    ['.aws/credentials'],
    ['/home/u/.aws/credentials'],
    ['credentials.txt'],
    ['my-credential.json'],

    // dotfile credentials
    ['.netrc'],
    ['.npmrc'],
    ['.pypirc'],
    ['.dockercfg'],
    ['.docker/config.json'],
    ['.git/credentials'],
    ['.git-credentials'],
    ['.github_token'],
    ['.gitlab_token'],

    // SSH / GPG
    ['.ssh/id_rsa'],
    ['.ssh/id_ed25519.pub'],
    ['id_dsa'],
    ['id_ecdsa.pub'],
    ['.ssh/authorized_keys'],
    ['.ssh/known_hosts'],
    ['.gnupg/secring.gpg'],

    // Cert / key extensions
    ['cert.pem'],
    ['cert.p12'],
    ['cert.pfx'],
    ['key.key'],
    ['cert.crt'],
    ['cert.cer'],
    ['file.gpg'],
    ['signed.asc'],

    // Cloud vendor dirs
    ['.aws/config'],
    ['.gcloud/credentials.db'],
    ['.config/gcloud/active_config'],
    ['.azure/something'],
    ['.kube/config'],

    // Windows paths (backslash)
    ['C:\\Users\\me\\.aws\\credentials'],
    ['Users\\me\\.env'],
  ])('flags %s as sensitive', (p) => {
    expect(isSensitiveFile(p)).toBe(true);
  });

  it.each([
    // Non-sensitive files
    ['README.md'],
    ['src/index.ts'],
    ['package.json'],
    ['tsconfig.json'],
    ['LICENSE'],
    ['envoy.yaml'], // not .env
    ['environment.md'],
    ['credit.txt'], // not credential
    // Empty / invalid
    [''],
  ])('does NOT flag %s', (p) => {
    expect(isSensitiveFile(p)).toBe(false);
  });

  it('returns false for non-string input', () => {
    // @ts-expect-error — testing runtime behavior
    expect(isSensitiveFile(null)).toBe(false);
    // @ts-expect-error — testing runtime behavior
    expect(isSensitiveFile(undefined)).toBe(false);
  });

  it('matchSensitivePattern returns the matching pattern', () => {
    const match = matchSensitivePattern('.env.production');
    expect(match).toBeDefined();
    expect(match instanceof RegExp).toBe(true);
  });

  it('matchSensitivePattern returns undefined for safe files', () => {
    expect(matchSensitivePattern('README.md')).toBeUndefined();
  });
});
