import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }));
vi.mock('../config', () => ({
  CLOUD_APP_ORIGIN: 'https://agiworkforce.com',
  RENDERER_MODE: 'remote',
  RENDERER_ORIGIN: 'agi://cloud',
}));

const { decideRemoteNavigation } = await import('../windowPolicy');

const PRODUCTION = 'https://agiworkforce.com';
const DEVELOPMENT = 'http://localhost:3100';

describe('remote navigation', () => {
  it('keeps the product in the window', () => {
    for (const path of [
      '/chat',
      '/chat/1f0a',
      '/chat/projects/7',
      '/code',
      '/settings',
      '/billing',
      '/admin/usage',
      '/workspace',
      '/welcome',
    ]) {
      expect(decideRemoteNavigation(`${PRODUCTION}${path}`, PRODUCTION), path).toBe('allow');
    }
  });

  it('keeps the sign-in flow in the window', () => {
    for (const path of [
      '/login',
      '/login/complete?redirectTo=%2Fchat',
      '/signup',
      '/auth/sso-callback',
      '/__clerk/handshake',
      '/pair/ABCD',
      '/session-expired',
    ]) {
      expect(decideRemoteNavigation(`${PRODUCTION}${path}`, PRODUCTION), path).toBe('allow');
    }
  });

  it('sends the marketing site to the browser', () => {
    for (const path of ['/', '/pricing', '/about', '/blog/launch', '/terms', '/privacy', '/docs']) {
      expect(decideRemoteNavigation(`${PRODUCTION}${path}`, PRODUCTION), path).toBe(
        'open-externally',
      );
    }
  });

  it('decides a development origin the same way', () => {
    expect(decideRemoteNavigation(`${DEVELOPMENT}/chat`, DEVELOPMENT)).toBe('allow');
    expect(decideRemoteNavigation(`${DEVELOPMENT}/pricing`, DEVELOPMENT)).toBe('open-externally');
  });

  it('keeps the identity providers a top-level sign-in navigates through', () => {
    for (const url of [
      'https://accounts.google.com/o/oauth2/auth',
      'https://login.microsoftonline.com/common/oauth2/authorize',
      'https://login.live.com/oauth20_authorize.srf',
      'https://appleid.apple.com/auth/authorize',
      'https://sharp-cat-12.clerk.accounts.dev/v1/oauth_callback',
    ]) {
      expect(decideRemoteNavigation(url, PRODUCTION), url).toBe('allow');
    }
  });

  it('sends every other origin to the browser', () => {
    for (const url of [
      'https://example.com/',
      'https://accounts.google.com.evil.test/o/oauth2/auth',
      'https://notagiworkforce.com/chat',
      'http://agiworkforce.com/chat',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(decideRemoteNavigation(url, PRODUCTION), url).toBe('open-externally');
    }
  });

  it('holds on to an app subdomain serving the product', () => {
    expect(decideRemoteNavigation('https://app.agiworkforce.com/chat', PRODUCTION)).toBe('allow');
    expect(decideRemoteNavigation('https://app.agiworkforce.com/pricing', PRODUCTION)).toBe(
      'open-externally',
    );
  });
});
