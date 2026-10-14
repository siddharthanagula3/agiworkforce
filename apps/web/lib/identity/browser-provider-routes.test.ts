import { describe, expect, it } from 'vitest';
import { needsBrowserIdentityProvider, routeNeedsBrowserIdentity } from './browser-provider-routes';

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
    '/pricing',
    '/pricing?seats=5#pricing-team-title',
    '/refund-policy',
    '/refund-policy/',
    '/refund-policy#request',
    '/skills',
    '/slack/link',
    '/slack/link?token=link-code',
  ])('mounts identity for %s', (pathname) => {
    expect(needsBrowserIdentityProvider(pathname)).toBe(true);
  });

  it.each(['/', '/terms', '/features/ai-chat', '/cookies', '/about'])(
    'keeps identity out of %s',
    (pathname) => {
      expect(needsBrowserIdentityProvider(pathname)).toBe(false);
    },
  );

  it('matches whole route segments rather than lookalike prefixes', () => {
    expect(needsBrowserIdentityProvider('/chatty')).toBe(false);
    expect(needsBrowserIdentityProvider('/pluginshop')).toBe(false);
    expect(needsBrowserIdentityProvider('/pricing-history')).toBe(false);
    expect(needsBrowserIdentityProvider('/refund-policy-history')).toBe(false);
    expect(needsBrowserIdentityProvider('/shared-artifact-history')).toBe(false);
    expect(needsBrowserIdentityProvider('/slack/linkage')).toBe(false);
    expect(needsBrowserIdentityProvider('/slack')).toBe(false);
  });

  it('mounts identity for the rendered Slack account-link route behind a rewrite', () => {
    expect(routeNeedsBrowserIdentity('/', ['(public)', 'slack', 'link'])).toBe(true);
  });

  it('mounts identity for the rendered refund request route behind a rewrite', () => {
    expect(routeNeedsBrowserIdentity('/', ['(public)', 'refund-policy'])).toBe(true);
  });

  it('mounts identity for a published artifact viewer that reads the session', () => {
    const path = `/shared-artifact/${'a'.repeat(24)}`;
    expect(needsBrowserIdentityProvider(path)).toBe(true);
    expect(needsBrowserIdentityProvider(`${path}/?view=source#main-content`)).toBe(true);
  });

  it('mounts identity for the rendered published artifact route behind a rewrite', () => {
    expect(routeNeedsBrowserIdentity('/', ['shared-artifact', 'a'.repeat(24)])).toBe(true);
  });
});
