import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/lib/e2b/runtime', () => ({
  getE2BExecutor: vi.fn(),
  killE2BSession: vi.fn(),
}));

import {
  CloudCodeNotFoundError,
  CloudCodeValidationError,
  isCloudCodeSchemaUnavailable,
  validateCloudCodeSessionId,
  validateCreateCloudCodeSession,
} from './cloud-code-session-service';

describe('cloud-code-session-service schema detection', () => {
  it('treats an absent table and an absent column alike', () => {
    // A half-migrated deployment - table present, column not - is the case a
    // real deploy hits, and it used to fall through to "An unexpected error
    // occurred". Reproduced live before this was widened.
    const missingTable = Object.assign(new Error('relation does not exist'), { code: '42P01' });
    const missingColumn = Object.assign(
      new Error('column "runtime_id" of relation "cloud_code_sessions" does not exist'),
      { code: '42703' },
    );

    expect(isCloudCodeSchemaUnavailable(missingTable)).toBe(true);
    expect(isCloudCodeSchemaUnavailable(missingColumn)).toBe(true);
  });

  it('finds the code through a wrapped cause', () => {
    const wrapped = Object.assign(new Error('query failed'), {
      cause: Object.assign(new Error('inner'), { code: '42703' }),
    });
    expect(isCloudCodeSchemaUnavailable(wrapped)).toBe(true);
  });

  it('does not swallow an unrelated database error', () => {
    expect(
      isCloudCodeSchemaUnavailable(Object.assign(new Error('deadlock'), { code: '40P01' })),
    ).toBe(false);
    expect(isCloudCodeSchemaUnavailable(new Error('plain'))).toBe(false);
    expect(isCloudCodeSchemaUnavailable(null)).toBe(false);
  });
});

describe('cloud-code-session-service validation', () => {
  it('defaults to a credential-free home workspace', () => {
    expect(
      validateCreateCloudCodeSession({
        requestId: 'request_123456',
        title: '  My workspace  ',
        networkAccess: 'none',
      }),
    ).toEqual({
      requestId: 'request_123456',
      title: 'My workspace',
      repositoryUrl: null,
      networkAccess: 'none',
      workspacePath: '/home/user',
      runtimeId: null,
      repositoryBranch: null,
      extraHosts: [],
      harnessCredential: null,
    });
  });

  it('refuses a branch that git would read as an option', () => {
    // `--branch <ref>` precedes the `--` guarding the URL, so the ref reaches
    // git as its own argv element and shell quoting does not disarm it.
    for (const branch of [
      '--upload-pack=touch /tmp/pwned',
      '-x',
      '--exec=whoami',
      '..',
      'feature/../../etc',
      'feature//x',
      'ends-with-slash/',
      'ends-with-dot.',
      'refs/heads/x.lock',
      'has space',
      'semi;colon',
      'back`tick`',
      '$(whoami)',
    ]) {
      expect(
        () =>
          validateCreateCloudCodeSession({
            requestId: 'request_123456',
            title: 'Repository workspace',
            repositoryUrl: 'https://github.com/acme/widgets',
            repositoryBranch: branch,
            networkAccess: 'trusted',
          }),
        `branch ${branch} must be refused`,
      ).toThrow();
    }
  });

  it('accepts ordinary refs', () => {
    for (const branch of ['main', 'release/2.1', 'feature/add-thing', 'v1.2.3', 'a']) {
      expect(
        validateCreateCloudCodeSession({
          requestId: 'request_123456',
          title: 'Repository workspace',
          repositoryUrl: 'https://github.com/acme/widgets',
          repositoryBranch: branch,
          networkAccess: 'trusted',
        }).repositoryBranch,
      ).toBe(branch);
    }
  });

  it('refuses a branch with no repository to clone it from', () => {
    expect(() =>
      validateCreateCloudCodeSession({
        requestId: 'request_123456',
        title: 'No repo',
        repositoryBranch: 'main',
        networkAccess: 'trusted',
      }),
    ).toThrow(/needs a repository/i);
  });

  it('accepts only public owner/repository GitHub URLs and normalizes clone syntax', () => {
    expect(
      validateCreateCloudCodeSession({
        requestId: 'request_123456',
        title: 'Repository workspace',
        repositoryUrl: 'https://github.com/acme/widgets',
        networkAccess: 'trusted',
      }),
    ).toMatchObject({
      repositoryUrl: 'https://github.com/acme/widgets.git',
      workspacePath: '/home/user/project',
    });

    for (const repositoryUrl of [
      'http://github.com/acme/widgets',
      'https://person:token@github.com/acme/widgets',
      'https://gitlab.com/acme/widgets',
      'https://github.com/acme/widgets/issues',
      'https://github.com/acme/widgets?token=secret',
    ]) {
      expect(() =>
        validateCreateCloudCodeSession({
          requestId: 'request_123456',
          title: 'Unsafe repo',
          repositoryUrl,
          networkAccess: 'trusted',
        }),
      ).toThrow(CloudCodeValidationError);
    }
  });

  it('does not silently widen network access for repository setup', () => {
    expect(() =>
      validateCreateCloudCodeSession({
        requestId: 'request_123456',
        title: 'Repository workspace',
        repositoryUrl: 'https://github.com/acme/widgets',
        networkAccess: 'none',
      }),
    ).toThrow('Repository setup requires Trusted hosts or Full internet access');
  });

  it('enforces unrestricted-egress acknowledgement at the server boundary', () => {
    expect(() =>
      validateCreateCloudCodeSession({
        requestId: 'request_123456',
        title: 'Full network',
        networkAccess: 'full',
      }),
    ).toThrow('Full internet access requires explicit acknowledgement');

    expect(
      validateCreateCloudCodeSession({
        requestId: 'request_123456',
        title: 'Full network',
        networkAccess: 'full',
        fullNetworkAcknowledged: true,
      }).networkAccess,
    ).toBe('full');
  });

  it('rejects malformed session identifiers as not found', () => {
    expect(() => validateCloudCodeSessionId('../other-user')).toThrow(CloudCodeNotFoundError);
    expect(validateCloudCodeSessionId('11111111-1111-4111-8111-111111111111')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('recognizes a missing migration through a wrapped Postgres error', () => {
    expect(isCloudCodeSchemaUnavailable({ code: '42P01' })).toBe(true);
    expect(isCloudCodeSchemaUnavailable({ cause: { code: '42P01' } })).toBe(true);
    expect(isCloudCodeSchemaUnavailable({ code: '23505' })).toBe(false);
  });
});
