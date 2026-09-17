import { describe, expect, it } from 'vitest';
import { isSensitiveFile, matchSensitivePattern } from '../sensitiveFiles';

describe('isSensitiveFile', () => {
  it.each([
    ['.env'],
    ['.env.local'],
    ['.env.production'],
    ['src/config/.env.staging'],
    ['/home/u/proj/.env'],
    ['.envrc'],

    ['secrets.json'],
    ['secret.yaml'],
    ['secrets.yml'],
    ['secret.toml'],
    ['secrets.txt'],
    ['secrets.env'],
    ['secret.js'],
    ['secret.ts'],
    ['/home/u/proj/secrets.json'],

    ['.aws/credentials'],
    ['/home/u/.aws/credentials'],
    ['credentials.txt'],
    ['my-credential.json'],

    ['.netrc'],
    ['.npmrc'],
    ['.pypirc'],
    ['.dockercfg'],
    ['.docker/config.json'],
    ['.git/credentials'],
    ['.git-credentials'],
    ['.github_token'],
    ['.gitlab_token'],

    ['.ssh/id_rsa'],
    ['.ssh/id_ed25519.pub'],
    ['id_dsa'],
    ['id_ecdsa.pub'],
    ['.ssh/authorized_keys'],
    ['.ssh/known_hosts'],
    ['.gnupg/secring.gpg'],

    ['cert.pem'],
    ['cert.p12'],
    ['cert.pfx'],
    ['key.key'],
    ['cert.crt'],
    ['cert.cer'],
    ['file.gpg'],
    ['signed.asc'],

    ['.aws/config'],
    ['.gcloud/credentials.db'],
    ['.config/gcloud/active_config'],
    ['.azure/something'],
    ['.kube/config'],

    ['C:\\Users\\me\\.aws\\credentials'],
    ['Users\\me\\.env'],
  ])('flags %s as sensitive', (p) => {
    expect(isSensitiveFile(p)).toBe(true);
  });

  it.each([
    ['README.md'],
    ['src/index.ts'],
    ['package.json'],
    ['tsconfig.json'],
    ['LICENSE'],
    ['envoy.yaml'], // not .env
    ['environment.md'],
    ['credit.txt'], // not credential
    [''],
  ])('does NOT flag %s', (p) => {
    expect(isSensitiveFile(p)).toBe(false);
  });

  it('returns false for non-string input', () => {
    // @ts-expect-error, testing runtime behavior
    expect(isSensitiveFile(null)).toBe(false);
    // @ts-expect-error, testing runtime behavior
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

describe('terraform state and variables', () => {
  it('treats state files as credential material, because that is what they hold', () => {
    expect(isSensitiveFile('terraform.tfstate')).toBe(true);
    expect(isSensitiveFile('infra/prod.tfstate')).toBe(true);
    expect(isSensitiveFile('infra/terraform.tfstate.backup')).toBe(true);
    expect(isSensitiveFile('terraform.tfstate.d/prod/terraform.tfstate')).toBe(true);
    expect(isSensitiveFile('.terraform/terraform.tfstate')).toBe(true);
  });

  it('treats variable files and the CLI credentials file as sensitive', () => {
    expect(isSensitiveFile('terraform.tfvars')).toBe(true);
    expect(isSensitiveFile('prod.auto.tfvars.json')).toBe(true);
    expect(isSensitiveFile('.terraformrc')).toBe(true);
    expect(isSensitiveFile('terraform.rc')).toBe(true);
  });

  it('leaves ordinary terraform source alone', () => {
    expect(isSensitiveFile('infra/main.tf')).toBe(false);
    expect(isSensitiveFile('infra/variables.tf')).toBe(false);
  });
});
