import { describe, expect, it } from 'vitest';
import {
  AUTH_ROUTE_PREFIXES,
  PRODUCT_ROUTE_PREFIXES,
  SESSION_AUTH_ROUTE_PREFIXES,
  SHELL_APP_ROUTE_PREFIXES,
  SIGN_IN_ENTRY_ROUTES,
  EMBEDDABLE_ACCOUNT_PAGE_PATHS,
  EMBEDDABLE_RECOVERY_PAGE_PATHS,
  isAuthPath,
  isEmbeddableAccountPagePath,
  isEmbeddableRecoveryPagePath,
  isEmbeddablePagePath,
  isProductPath,
  isShellAppPath,
  isSignInEntryPath,
  routeMatcherPatterns,
} from '../product-routes';

describe('product routes', () => {
  it('matches a prefix, its subtree and nothing that merely starts with it', () => {
    expect(isProductPath('/chat')).toBe(true);
    expect(isProductPath('/chat/')).toBe(true);
    expect(isProductPath('/chat/abc-123')).toBe(true);
    expect(isProductPath('/chat/projects/7')).toBe(true);
    expect(isProductPath('/chatter')).toBe(false);
    expect(isProductPath('/settingsx')).toBe(false);
  });

  it('reads a path with a query string or a fragment', () => {
    expect(isProductPath('/settings?tab=general')).toBe(true);
    expect(isProductPath('/chat/abc#message-4')).toBe(true);
    expect(isProductPath('/pricing?utm_source=desktop')).toBe(false);
  });

  it('keeps the marketing site out of the product', () => {
    for (const path of ['/', '/pricing', '/about', '/blog/launch', '/terms', '/privacy']) {
      expect(isProductPath(path), path).toBe(false);
      expect(isAuthPath(path), path).toBe(false);
    }
  });

  it('keeps every sign-in surface in the auth set', () => {
    for (const path of [
      '/login',
      '/login/complete',
      '/signup',
      '/sign-in',
      '/sign-up',
      '/auth/callback',
      '/auth/sso-callback',
      '/__clerk/anything',
      '/pair/ABCD-1234',
      '/device-auth',
      '/forgot-password',
      '/session-expired',
    ]) {
      expect(isAuthPath(path), path).toBe(true);
      expect(isProductPath(path), path).toBe(false);
    }
  });

  it('keeps the two sets disjoint', () => {
    for (const prefix of PRODUCT_ROUTE_PREFIXES) {
      expect(isAuthPath(prefix), prefix).toBe(false);
    }
    for (const prefix of AUTH_ROUTE_PREFIXES) {
      expect(isProductPath(prefix), prefix).toBe(false);
    }
  });

  it('hands the proxy each prefix as itself, its subtree and its dot-suffixed forms', () => {
    expect(routeMatcherPatterns(PRODUCT_ROUTE_PREFIXES)).toEqual([
      '/chat',
      '/chat/(.*)',
      '/chat.(.*)',
      '/code',
      '/code/(.*)',
      '/code.(.*)',
      '/library',
      '/library/(.*)',
      '/library.(.*)',
      '/models',
      '/models/(.*)',
      '/models.(.*)',
      '/developers',
      '/developers/(.*)',
      '/developers.(.*)',
      '/open',
      '/open/(.*)',
      '/open.(.*)',
      '/quick-ask',
      '/quick-ask/(.*)',
      '/quick-ask.(.*)',
      '/schedules',
      '/schedules/(.*)',
      '/schedules.(.*)',
      '/tasks',
      '/tasks/(.*)',
      '/tasks.(.*)',
      '/settings',
      '/settings/(.*)',
      '/settings.(.*)',
      '/billing',
      '/billing/(.*)',
      '/billing.(.*)',
      '/upgrade',
      '/upgrade/(.*)',
      '/upgrade.(.*)',
      '/admin',
      '/admin/(.*)',
      '/admin.(.*)',
      '/workspace',
      '/workspace/(.*)',
      '/workspace.(.*)',
      '/operator',
      '/operator/(.*)',
      '/operator.(.*)',
      '/welcome',
      '/welcome/(.*)',
      '/welcome.(.*)',
    ]);
  });

  // `/open(.*)` is a suffix wildcard to the proxy's matcher: it claimed the
  // published `/openapi.json` and sent a signed-out reader to sign in.
  it('never lets a prefix run straight into a wildcard', () => {
    for (const prefixes of [
      PRODUCT_ROUTE_PREFIXES,
      AUTH_ROUTE_PREFIXES,
      SESSION_AUTH_ROUTE_PREFIXES,
    ]) {
      for (const pattern of routeMatcherPatterns(prefixes)) {
        expect(pattern, pattern).not.toMatch(/[^/.]\(/u);
      }
    }
  });

  // A route that gets an identity session but that the shell would open in a
  // browser is a sign-in that finishes outside the app.
  it('keeps the session auth routes inside the set the shell holds on to', () => {
    for (const prefix of SESSION_AUTH_ROUTE_PREFIXES) {
      expect(AUTH_ROUTE_PREFIXES).toContain(prefix);
    }
  });

  it('holds the signed-in pages outside the product prefixes for the desktop window', () => {
    for (const path of [
      '/apps',
      '/connectors',
      '/connectors/mcp-directory/github',
      '/skills',
      '/agi-work',
      '/agi-code',
      '/projects/7',
      '/customize',
      '/sites/abc',
      '/chats',
    ]) {
      expect(isShellAppPath(path), path).toBe(true);
      expect(isProductPath(path), path).toBe(false);
      expect(isAuthPath(path), path).toBe(false);
    }
    for (const path of ['/', '/pricing', '/help', '/appstore', '/skillset', '/download']) {
      expect(isShellAppPath(path), path).toBe(false);
    }
  });

  it('keeps the shell app routes apart from the product and auth sets', () => {
    for (const prefix of SHELL_APP_ROUTE_PREFIXES) {
      expect(isProductPath(prefix), prefix).toBe(false);
      expect(isAuthPath(prefix), prefix).toBe(false);
    }
  });

  it('names only the auth routes that ask someone to sign in as sign-in entries', () => {
    for (const route of SIGN_IN_ENTRY_ROUTES) {
      expect(isAuthPath(route), route).toBe(true);
    }
    for (const path of [
      '/login',
      '/login?redirectTo=%2Fchat',
      '/login/',
      '/signup',
      '/sign-in',
      '/forgot-password',
      '/session-expired',
      '/auth/reset-password',
    ]) {
      expect(isSignInEntryPath(path), path).toBe(true);
    }
    for (const path of [
      '/login/complete',
      '/login/verify',
      '/signup/complete',
      '/auth/sso-callback',
      '/auth/callback',
      '/auth/device',
      '/device-auth',
      '/pair/ABCD',
      '/__clerk/v1/client',
      '/chat',
      '/loginx',
    ]) {
      expect(isSignInEntryPath(path), path).toBe(false);
    }
  });

  it('opens only the account and security sections as embeddable account pages', () => {
    for (const path of [
      '/settings/account',
      '/settings/security/',
      '/settings/account?from=mobile',
    ]) {
      expect(isEmbeddableAccountPagePath(path), path).toBe(true);
    }
    for (const path of [
      '/settings',
      '/settings/billing',
      '/settings/usage',
      '/settings/account/billing',
      '/settings/accounts',
      '/upgrade',
      '/pricing',
    ]) {
      expect(isEmbeddableAccountPagePath(path), path).toBe(false);
    }
    for (const path of EMBEDDABLE_ACCOUNT_PAGE_PATHS) {
      expect(isProductPath(path), path).toBe(true);
      expect(isEmbeddablePagePath(path), path).toBe(false);
    }
  });

  it('opens only the signed-out recovery pages as embeddable recovery pages', () => {
    for (const path of ['/recover', '/appeal/', '/auth/reset-password?from=mobile']) {
      expect(isEmbeddableRecoveryPagePath(path), path).toBe(true);
    }
    for (const path of ['/login', '/signup', '/recover/extra', '/auth', '/pricing', '/']) {
      expect(isEmbeddableRecoveryPagePath(path), path).toBe(false);
    }
    for (const path of EMBEDDABLE_RECOVERY_PAGE_PATHS) {
      expect(isProductPath(path), path).toBe(false);
      expect(isEmbeddablePagePath(path), path).toBe(false);
      expect(isEmbeddableAccountPagePath(path), path).toBe(false);
    }
  });
});
