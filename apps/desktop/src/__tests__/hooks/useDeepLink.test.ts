import { describe, expect, it } from 'vitest';
import { normalizeDeepLinkPath, parseDeepLink } from '../../hooks/useDeepLink';

describe('useDeepLink parsing', () => {
  it('normalizes host-based callback routes', () => {
    const url = new URL('agiworkforce://auth/callback?code=abc');
    expect(normalizeDeepLinkPath(url)).toBe('/auth/callback');
  });

  it('accepts the auth callback route only for the app scheme', () => {
    expect(parseDeepLink('agiworkforce://auth/callback?code=abc')).toEqual({
      kind: 'auth-callback',
      detail: {
        url: 'agiworkforce://auth/callback?code=abc',
        code: 'abc',
      },
    });
  });

  it('accepts validated MCP OAuth callbacks', () => {
    expect(parseDeepLink('agiworkforce:///oauth/mcp/github?code=code-123&state=state-456')).toEqual(
      {
        kind: 'mcp-oauth-callback',
        detail: {
          provider: 'github',
          code: 'code-123',
          state: 'state-456',
          url: 'agiworkforce:///oauth/mcp/github?code=code-123&state=state-456',
        },
      },
    );
  });

  it('rejects unknown schemes and unapproved providers', () => {
    expect(parseDeepLink('https://evil.example.com/auth/callback?code=abc')).toBeNull();
    expect(parseDeepLink('agiworkforce:///oauth/mcp/unknown?code=abc&state=def')).toBeNull();
    expect(parseDeepLink('agiworkforce://malicious/path?access_token=abc')).toBeNull();
  });
});
