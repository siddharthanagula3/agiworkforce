import { describe, expect, it } from 'vitest';
import { normalizeDeepLinkPath, parseDeepLink } from '../../hooks/useDeepLink';

describe('useDeepLink parsing', () => {
  it('normalizes host-based callback routes', () => {
    const url = new URL('agiworkforce://auth/callback?code=abc');
    expect(normalizeDeepLinkPath(url)).toBe('/auth/callback');
  });

  it('rejects legacy account-auth callbacks because Desktop sign-in stays in its owned window', () => {
    expect(parseDeepLink('agiworkforce://auth/callback?code=abc')).toBeNull();
    expect(parseDeepLink('https://auth/callback?code=abc')).toBeNull();
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
