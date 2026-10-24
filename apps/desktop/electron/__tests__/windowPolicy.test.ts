import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { openExternal } = vi.hoisted(() => ({ openExternal: vi.fn() }));

vi.mock('electron', () => ({ shell: { openExternal } }));
vi.mock('../config', () => ({
  CLERK_DEVELOPMENT_HOST: null,
  CLOUD_APP_ORIGIN: 'https://agiworkforce.com',
}));

const {
  NO_PUBLIC_PAGE_BOUNCE,
  PUBLIC_PAGE_REPEAT_MS,
  applyRemoteWindowPolicy,
  decideCommittedPage,
  decideRemoteNavigation,
  decideRemoteRedirect,
  isSignedInProductPage,
  planPublicPageReturn,
} = await import('../windowPolicy');

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

  it('keeps the steps that finish or verify a sign-in in the window', () => {
    for (const path of [
      '/login/complete?redirectTo=%2Fchat',
      '/login/verify?redirectTo=%2Fchat',
      '/signup/complete',
      '/auth/sso-callback',
      '/auth/desktop/complete',
      '/__clerk/handshake',
      '/pair/ABCD',
      '/device-auth',
    ]) {
      expect(decideRemoteNavigation(`${PRODUCTION}${path}`, PRODUCTION), path).toBe('allow');
    }
  });

  it('hands every page that asks someone to sign in to the shell sign-in screen', () => {
    for (const path of [
      '/login',
      '/login?redirectTo=%2Fchat',
      '/signup',
      '/sign-in',
      '/sign-up',
      '/register',
      '/forgot-password',
      '/session-expired',
      '/auth/desktop',
      '/auth/desktop?challenge=abc',
      '/auth/reset-password',
    ]) {
      expect(decideRemoteNavigation(`${PRODUCTION}${path}`, PRODUCTION), path).toBe('sign-in');
    }
  });

  it('keeps the signed-in pages outside the product prefixes in the window', () => {
    for (const path of [
      '/apps',
      '/connectors',
      '/connectors/mcp-directory/github',
      '/skills',
      '/agi-work',
      '/agi-code',
      '/projects/7',
      '/customize',
      '/sites',
      '/chats',
    ]) {
      expect(decideRemoteNavigation(`${PRODUCTION}${path}`, PRODUCTION), path).toBe('allow');
    }
  });

  it('sends the marketing site to the browser', () => {
    for (const path of [
      '/',
      '/pricing',
      '/about',
      '/blog/launch',
      '/terms',
      '/privacy',
      '/docs',
      '/help',
      '/features',
      '/download',
    ]) {
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
  it('lets a redirect reach the product, our identity hosts and the identity providers', () => {
    for (const url of [
      'https://agiworkforce.com/chat',
      'https://agiworkforce.com/apps',
      'https://agiworkforce.com/login/complete?redirectTo=%2Fchat',
      'https://agiworkforce.com/auth/desktop/complete',
      'https://clerk.agiworkforce.com/v1/oauth_callback',
      'https://clerk.agiworkforce.com/v1/client/handshake?redirect_url=x',
      'https://accounts.google.com/o/oauth2/auth',
    ]) {
      expect(decideRemoteRedirect(url, PRODUCTION), url).toBe('allow');
    }
  });

  it('judges a redirect onto the app origin by its path', () => {
    for (const url of [
      'https://agiworkforce.com/pricing',
      'https://agiworkforce.com/',
      'https://agiworkforce.com/help',
    ]) {
      expect(decideRemoteRedirect(url, PRODUCTION), url).toBe('open-externally');
    }
    expect(
      decideRemoteRedirect('https://agiworkforce.com/login?redirectTo=%2Fchat', PRODUCTION),
    ).toBe('sign-in');
    expect(decideRemoteRedirect(`${DEVELOPMENT}/pricing`, DEVELOPMENT)).toBe('open-externally');
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

describe('committed pages', () => {
  it('judges a page the site router reached on the app origin', () => {
    expect(decideCommittedPage(`${PRODUCTION}/chat/abc`, PRODUCTION)).toBe('allow');
    expect(decideCommittedPage(`${PRODUCTION}/connectors`, PRODUCTION)).toBe('allow');
    expect(decideCommittedPage(`${PRODUCTION}/help`, PRODUCTION)).toBe('open-externally');
    expect(decideCommittedPage(`${PRODUCTION}/`, PRODUCTION)).toBe('open-externally');
    expect(decideCommittedPage(`${PRODUCTION}/login`, PRODUCTION)).toBe('sign-in');
    expect(decideCommittedPage(`${PRODUCTION}/auth/desktop/complete`, PRODUCTION)).toBe('allow');
  });

  it('leaves pages on other origins and the shell screens to the navigation that reached them', () => {
    expect(decideCommittedPage('https://accounts.google.com/o/oauth2/auth', PRODUCTION)).toBe(
      'allow',
    );
    expect(decideCommittedPage('data:text/html,hello', PRODUCTION)).toBe('allow');
  });

  it('names the signed-in product pages a signed-out window must leave', () => {
    expect(isSignedInProductPage(`${PRODUCTION}/chat`, PRODUCTION)).toBe(true);
    expect(isSignedInProductPage(`${PRODUCTION}/skills`, PRODUCTION)).toBe(true);
    expect(isSignedInProductPage(`${PRODUCTION}/auth/desktop/complete`, PRODUCTION)).toBe(false);
    expect(isSignedInProductPage(`${PRODUCTION}/login/complete`, PRODUCTION)).toBe(false);
    expect(isSignedInProductPage('data:text/html,x', PRODUCTION)).toBe(false);
  });
});

describe('a public page the window landed on', () => {
  const HELP = `${PRODUCTION}/help`;

  it('goes to the browser while the window returns to the product page it left', () => {
    const plan = planPublicPageReturn(NO_PUBLIC_PAGE_BOUNCE, HELP, '/chat/abc', 1_000);
    expect(plan.openExternally).toBe(true);
    expect(plan.returnTo).toBe('/chat/abc');
  });

  it('never loops when the page it returns to sends it straight back', () => {
    const first = planPublicPageReturn(NO_PUBLIC_PAGE_BOUNCE, HELP, '/upgrade/team', 1_000);
    const second = planPublicPageReturn(first.bounce, HELP, '/upgrade/team', 1_500);
    expect(second).toMatchObject({ openExternally: false, returnTo: '/chat' });
    const third = planPublicPageReturn(second.bounce, HELP, '/chat', 2_000);
    expect(third).toMatchObject({ openExternally: false, returnTo: null });
    const fourth = planPublicPageReturn(third.bounce, HELP, '/chat', 2_500);
    expect(fourth).toMatchObject({ openExternally: false, returnTo: null });
  });

  it('stops at once when the page that bounced was already a new chat', () => {
    const first = planPublicPageReturn(NO_PUBLIC_PAGE_BOUNCE, HELP, '/chat', 1_000);
    const second = planPublicPageReturn(first.bounce, HELP, '/chat', 1_200);
    expect(second).toMatchObject({ openExternally: false, returnTo: null });
  });

  it('treats a later click, or a different page, as a fresh request', () => {
    const first = planPublicPageReturn(NO_PUBLIC_PAGE_BOUNCE, HELP, '/chat', 1_000);
    const later = planPublicPageReturn(first.bounce, HELP, '/chat', 1_000 + PUBLIC_PAGE_REPEAT_MS);
    expect(later).toMatchObject({ openExternally: true, returnTo: '/chat' });
    const other = planPublicPageReturn(first.bounce, `${PRODUCTION}/pricing`, '/chat', 1_100);
    expect(other).toMatchObject({ openExternally: true, returnTo: '/chat' });
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

  const onSignInRequired = vi.fn();
  const handlers = { onSignInRequired };

  beforeEach(() => {
    openExternal.mockReset();
    onSignInRequired.mockReset();
  });

  it('leaves the app name and Electron out of the user agent the site sees', () => {
    const { win, webContents } = fakeWindow();
    webContents.userAgent =
      'Mozilla/5.0 Chrome/146.0.0.0 AGI Desktop/1.4.0 Electron/44.4.5 Safari/537.36';
    applyRemoteWindowPolicy(win, handlers);
    expect(webContents.userAgent).toBe('Mozilla/5.0 Chrome/146.0.0.0 Safari/537.36');
  });

  it("cancels a main-frame redirect to a Clerk tenant that is not this build's own", () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win, handlers);
    const event = redirect(OTHER_CLERK_TENANT);
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith(OTHER_CLERK_TENANT);
  });

  it('cancels a main-frame redirect to another origin and hands it to the browser', () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win, handlers);
    const event = redirect('https://example.com/landing');
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://example.com/landing');
  });

  it('lets a main-frame redirect through the sign-in hosts continue', () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win, handlers);
    const event = redirect('https://clerk.agiworkforce.com/v1/oauth_callback');
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('leaves subframe redirects to the page content security policy', () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win, handlers);
    const event = redirect('https://hooks.stripe.com/redirect', false);
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('cancels a main-frame redirect to a public page on the app origin', () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win, handlers);
    const event = redirect('https://agiworkforce.com/pricing');
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://agiworkforce.com/pricing');
  });

  it('turns a redirect or a navigation to a sign-in page into the shell sign-in screen', () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win, handlers);
    const event = redirect('https://agiworkforce.com/login?redirectTo=%2Fchat');
    webContents.emit('will-redirect', event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(onSignInRequired).toHaveBeenCalledWith(
      'https://agiworkforce.com/login?redirectTo=%2Fchat',
    );

    const navigation = { preventDefault: vi.fn() };
    webContents.emit('will-navigate', navigation, 'https://agiworkforce.com/signup');
    expect(navigation.preventDefault).toHaveBeenCalledTimes(1);
    expect(onSignInRequired).toHaveBeenLastCalledWith('https://agiworkforce.com/signup');
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('cancels a sign-in page outright in a window that has no sign-in screen', () => {
    const { win, webContents } = fakeWindow();
    applyRemoteWindowPolicy(win);
    const navigation = { preventDefault: vi.fn() };
    webContents.emit('will-navigate', navigation, 'https://agiworkforce.com/login');
    expect(navigation.preventDefault).toHaveBeenCalledTimes(1);
    expect(openExternal).not.toHaveBeenCalled();
  });
});
