import { describe, expect, it } from 'vitest';
import { needsBrowserIdentityProvider } from './browser-provider-routes';

describe('browser identity provider routes', () => {
  it.each([
    '/chat',
    '/chat/session-1',
    '/settings/general',
    '/workspace/people',
    '/login',
    '/signup/complete',
    '/auth/device',
    '/verify?code=1',
    '/apps',
    '/connectors/mcp-directory',
    '/gallery',
    '/invite',
    '/plugins/example',
    '/skills',
  ])('mounts identity for %s', (pathname) => {
    expect(needsBrowserIdentityProvider(pathname)).toBe(true);
  });

  it.each(['/', '/terms', '/pricing', '/features/ai-chat', '/cookies', '/about'])(
    'keeps identity out of %s',
    (pathname) => {
      expect(needsBrowserIdentityProvider(pathname)).toBe(false);
    },
  );

  it('matches whole route segments rather than lookalike prefixes', () => {
    expect(needsBrowserIdentityProvider('/chatty')).toBe(false);
    expect(needsBrowserIdentityProvider('/pluginshop')).toBe(false);
  });
});
