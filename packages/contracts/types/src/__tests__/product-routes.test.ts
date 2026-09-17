import { describe, expect, it } from 'vitest';
import {
  AUTH_ROUTE_PREFIXES,
  PRODUCT_ROUTE_PREFIXES,
  SESSION_AUTH_ROUTE_PREFIXES,
  isAuthPath,
  isProductPath,
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
      '/verify',
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

  it('hands the proxy the pattern dialect it speaks', () => {
    expect(routeMatcherPatterns(PRODUCT_ROUTE_PREFIXES)).toEqual([
      '/chat(.*)',
      '/code(.*)',
      '/library(.*)',
      '/models(.*)',
      '/open(.*)',
      '/schedules(.*)',
      '/tasks(.*)',
      '/settings(.*)',
      '/billing(.*)',
      '/upgrade(.*)',
      '/admin(.*)',
      '/workspace(.*)',
      '/operator(.*)',
      '/welcome(.*)',
    ]);
  });

  // A route that gets an identity session but that the shell would open in a
  // browser is a sign-in that finishes outside the app.
  it('keeps the session auth routes inside the set the shell holds on to', () => {
    for (const prefix of SESSION_AUTH_ROUTE_PREFIXES) {
      expect(AUTH_ROUTE_PREFIXES).toContain(prefix);
    }
  });
});
