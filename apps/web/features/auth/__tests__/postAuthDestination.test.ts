import { describe, expect, it } from 'vitest';
import { postAuthDestination } from '../postAuthDestination';

describe('the destination after authentication', () => {
  it.each([
    undefined,
    '/',
    '/login',
    '/signup/',
    '/signup/complete?redirectTo=%2F',
    '/login/complete',
    '/auth/sso-callback',
    '/register',
    '//elsewhere.example',
    'https://elsewhere.example/login',
  ])('finishes at chat for %s', (value) => {
    expect(postAuthDestination(value)).toBe('/chat');
  });
  it.each([
    '/chat/projects?from=share',
    '/auth/device?user_code=fixture',
    '/login/verify?handoff=fixture',
    '/settings',
    '/welcome',
  ])('preserves the requested destination %s', (value) => {
    expect(postAuthDestination(value)).toBe(value);
  });
  it('keeps a chat action on the home alias', () =>
    expect(postAuthDestination('/?q=hello#composer')).toBe('/chat?q=hello#composer'));
});
