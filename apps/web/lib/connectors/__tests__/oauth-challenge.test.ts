import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  detectConnectorAuthChallenge,
  parseChallengeParam,
  parseInsufficientScope,
  parseResourceMetadataUrl,
} from '../oauth-challenge';

describe('WWW-Authenticate parsing (RFC 6750 §3 / RFC 9728 §5.1)', () => {
  it('extracts a quoted parameter value', () => {
    const header = 'Bearer realm="mcp", resource_metadata="https://example.com/.well-known/x"';
    expect(parseResourceMetadataUrl(header)).toBe('https://example.com/.well-known/x');
    expect(parseChallengeParam(header, 'realm')).toBe('mcp');
  });

  it('extracts a bare value up to the next comma or space', () => {
    expect(parseChallengeParam('Bearer error=invalid_token, realm="mcp"', 'error')).toBe(
      'invalid_token',
    );
    expect(parseChallengeParam('Bearer error=invalid_token realm="mcp"', 'error')).toBe(
      'invalid_token',
    );
  });

  it('matches the parameter name case-insensitively', () => {
    expect(parseResourceMetadataUrl('Bearer RESOURCE_METADATA="https://a.test/m"')).toBe(
      'https://a.test/m',
    );
  });

  it('returns null when the pointer is absent', () => {
    expect(parseResourceMetadataUrl('Bearer realm="mcp"')).toBeNull();
    expect(parseResourceMetadataUrl(null)).toBeNull();
    expect(parseResourceMetadataUrl(undefined)).toBeNull();
  });

  it('returns the step-up scope ONLY for error="insufficient_scope"', () => {
    expect(
      parseInsufficientScope('Bearer error="insufficient_scope", scope="read:issues write:issues"'),
    ).toBe('read:issues write:issues');
    expect(parseInsufficientScope('Bearer error="invalid_token", scope="read:issues"')).toBeNull();
    expect(parseInsufficientScope('Bearer scope="read:issues"')).toBeNull();
  });
});

describe('detectConnectorAuthChallenge', () => {
  it('classifies the MCP SDK 401 transport error', () => {
    const error = Object.assign(new Error('Streamable HTTP error: Error POSTing to endpoint: {}'), {
      code: 401,
    });
    const challenge = detectConnectorAuthChallenge(error);
    expect(challenge).not.toBeNull();
    expect(challenge?.status).toBe(401);
    expect(challenge?.wwwAuthenticate).toBeNull();
  });

  it('classifies the SDK UnauthorizedError, which carries no status', () => {
    const error = Object.assign(new Error('Unauthorized'), { name: 'UnauthorizedError' });
    expect(detectConnectorAuthChallenge(error)?.status).toBe(401);
  });

  it('reads a challenge embedded in the error message when the server echoed one', () => {
    const error = Object.assign(
      new Error(
        'Error POSTing to endpoint: WWW-Authenticate: Bearer resource_metadata="https://a.test/m"',
      ),
      { code: 401 },
    );
    const challenge = detectConnectorAuthChallenge(error);
    expect(challenge?.resourceMetadataUrl).toBe('https://a.test/m');
  });

  it('treats a 403 as a challenge only when it demands more scope', () => {
    const plain403 = Object.assign(new Error('forbidden'), { code: 403 });
    expect(detectConnectorAuthChallenge(plain403)).toBeNull();

    const stepUp = Object.assign(
      new Error('Bearer error="insufficient_scope", scope="write:issues"'),
      { code: 403 },
    );
    const challenge = detectConnectorAuthChallenge(stepUp);
    expect(challenge?.status).toBe(403);
    expect(challenge?.requiredScope).toBe('write:issues');
  });

  it('does not mistake tool OUTPUT that mentions 401 for an auth challenge', () => {
    expect(
      detectConnectorAuthChallenge(new Error('server replied 401 to the upstream')),
    ).toBeNull();
    expect(detectConnectorAuthChallenge('401')).toBeNull();
    expect(detectConnectorAuthChallenge(null)).toBeNull();
    expect(detectConnectorAuthChallenge({ code: 500 })).toBeNull();
  });
});
