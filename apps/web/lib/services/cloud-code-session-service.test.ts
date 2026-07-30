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
    });
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
    ).toThrow('Repository setup requires Trusted hosts or Full network access');
  });

  it('enforces unrestricted-egress acknowledgement at the server boundary', () => {
    expect(() =>
      validateCreateCloudCodeSession({
        requestId: 'request_123456',
        title: 'Full network',
        networkAccess: 'full',
      }),
    ).toThrow('Full network access requires explicit acknowledgement');

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
