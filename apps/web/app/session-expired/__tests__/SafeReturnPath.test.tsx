import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SessionExpiredActions } from '../SessionExpiredActions';
import { sameOriginReturnPath } from '../sameOriginReturnPath';

function hrefFor(redirectTo: string | undefined): string {
  const { unmount } = render(
    <SessionExpiredActions returnPath={sameOriginReturnPath(redirectTo)} />,
  );
  const href = screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href') ?? '';
  unmount();
  return href;
}

describe('session-expired return path', () => {
  it('passes through the existing stale-session recovery before showing sign-in', () => {
    expect(hrefFor('/chat/abc')).toBe(
      `/login/complete?redirectTo=${encodeURIComponent('/chat/abc')}`,
    );
  });

  it('keeps a same-origin path with its query so the user lands back where they were', () => {
    expect(sameOriginReturnPath('/chat/abc?tab=files')).toBe('/chat/abc?tab=files');
  });

  it('refuses an absolute URL rather than becoming an open redirect', () => {
    expect(sameOriginReturnPath('https://evil.example/steal')).toBeNull();
    const href = hrefFor('https://evil.example/steal');
    expect(href).not.toContain('evil.example');
    expect(href).toContain(encodeURIComponent('/chat'));
  });

  it('refuses a protocol-relative URL, which browsers treat as absolute', () => {
    expect(sameOriginReturnPath('//evil.example')).toBeNull();
    expect(sameOriginReturnPath('/\\evil.example')).toBeNull();
    expect(hrefFor('//evil.example')).not.toContain('evil.example');
  });

  it('refuses a script URL', () => {
    expect(sameOriginReturnPath('javascript:alert(1)')).toBeNull();
  });

  it('falls back when no return path is supplied', () => {
    expect(sameOriginReturnPath(undefined)).toBeNull();
    expect(hrefFor(undefined)).toContain(encodeURIComponent('/chat'));
  });
});
