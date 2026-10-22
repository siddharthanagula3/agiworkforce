import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn() }));

vi.mock('electron', () => ({ shell: { openExternal } }));
vi.mock('../config', () => ({
  CLERK_DEVELOPMENT_HOST: null,
  CLOUD_APP_ORIGIN: 'https://agiworkforce.com',
}));

const { applyRemoteWindowPolicy, decideRemoteNavigation, decideRemoteRedirect } =
  await import('../windowPolicy');

const PRODUCTION = 'https://agiworkforce.com';
const DEVELOPMENT = 'http://localhost:3100';
const OWN_CLERK_TENANT = 'sharp-cat-12.clerk.accounts.dev';
const OTHER_CLERK_TENANT = 'https://attacker-site-99.clerk.accounts.dev/sign-in';

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
    ]) {
      expect(decideRemoteNavigation(url, PRODUCTION), url).toBe('allow');
    }
  });

  it('admits no Clerk-hosted tenant in a build that names none', () => {
    for (const url of [`https://${OWN_CLERK_TENANT}/v1/oauth_callback`, OTHER_CLERK_TENANT]) {
      expect(decideRemoteNavigation(url, PRODUCTION), url).toBe('open-externally');
      expect(decideRemoteRedirect(url, PRODUCTION), url).toBe('open-externally');
    }
  });

  it('admits only its own Clerk tenant in a development build, never another one', () => {
    const own = `https://${OWN_CLERK_TENANT}/v1/oauth_callback`;
    expect(decideRemoteNavigation(own, DEVELOPMENT, OWN_CLERK_TENANT)).toBe('allow');
    expect(decideRemoteRedirect(own, DEVELOPMENT, OWN_CLERK_TENANT)).toBe('allow');
    for (const url of [
      OTHER_CLERK_TENANT,
      `https://evil.${OWN_CLERK_TENANT}/sign-in`,
      `http://${OWN_CLERK_TENANT}/v1/oauth_callback`,
      'https://clerk.accounts.dev/sign-in',
    ]) {
      expect(decideRemoteNavigation(url, DEVELOPMENT, OWN_CLERK_TENANT), url).toBe(
        'open-externally',
      );
      expect(decideRemoteRedirect(url, DEVELOPMENT, OWN_CLERK_TENANT), url).toBe('open-externally');
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

describe('remote redirects', () => {
  it('lets a redirect move between paths on our hosts and the identity providers', () => {
    for (const url of [
      'https://agiworkforce.com/chat',
      'https://agiworkforce.com/pricing',
      'https://clerk.agiworkforce.com/v1/oauth_callback',
      'https://accounts.google.com/o/oauth2/auth',
    ]) {
      expect(decideRemoteRedirect(url, PRODUCTION), url).toBe('allow');
    }
  });

  it('refuses a redirect that leaves the allowed origins', () => {
    for (const url of [
      'https://example.com/',
      'https://accounts.google.com.evil.test/o/oauth2/auth',
      'http://agiworkforce.com/chat',
      'http://accounts.google.com/o/oauth2/auth',
      'file:///etc/passwd',
      'not a url',
    ]) {
      expect(decideRemoteRedirect(url, PRODUCTION), url).toBe('open-externally');
    }
  });
});

describe('applyRemoteWindowPolicy', () => {
  function fakeWindow() {
    const webContents = Object.assign(new EventEmitter(), {
      userAgent: 'Mozilla/5.0 Electron/44.4.5',
      setWindowOpenHandler: vi.fn(),
    });
    return { win: { webContents } as unknown as BrowserWindow, webContents };
  }

  function redirect(url: string, isMainFrame = true) {
    return { url, isMainFrame, preventDefault: vi.fn() };
  }

  beforeEach(() => {
    openExternal.mockReset();
  });

  it('leaves the app name and Electron out of the user agent the site sees', () => {
    const { win, webContents } = fakeWindow();
    webContents.userAgent =
      'Mozilla/5.0 Chrome/146.0.0.0 AGI Desktop/1.4.0 Electron/44.4.5 Safari/537.36';
    applyRemoteWindowPolicy(win);
    expect(webContents.userAgent).toBe('Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36');
  });

  it("cancels a main-frame redirect to a Clerk tenant that is not this build's own", () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win);
    const event = redirect(OTHER_CLERK_TENANT);
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(OTHER_CLERK_TENANT);
  });

  it('cancels a main-frame redirect to another origin and hands it to the browser', () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win);
    const event = redirect('https://example.com/landing');
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/landing');
  });

  it('lets a main-frame redirect through the sign-in hosts continue', () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win);
    const event = redirect('https://clerk.agiworkforce.com/v1/oauth_callback');
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('leaves subframe redirects to the page content security policy', () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win);
    const event = redirect('https://hooks.stripe.com/redirect', false);
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
