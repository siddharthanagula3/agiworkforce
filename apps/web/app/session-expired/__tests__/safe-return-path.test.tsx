import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const params = { value: '' };
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(params.value),
}));

import { SessionExpiredActions } from '../SessionExpiredActions';

function hrefFor(query: string): string {
  params.value = query;
  const { unmount } = render(<SessionExpiredActions />);
  const href = screen.getByRole('link', { name: 'Sign in again' }).getAttribute('href') ?? '';
  unmount();
  return href;
}

describe('session-expired return path', () => {
  it('keeps a same-origin path so the user lands back where they were', () => {
    expect(hrefFor('redirectTo=/chat/abc')).toContain(encodeURIComponent('/chat/abc'));
  });

  it('refuses an absolute URL rather than becoming an open redirect', () => {
    const href = hrefFor('redirectTo=https://evil.example/steal');
    expect(href).not.toContain('evil.example');
    expect(href).toContain(encodeURIComponent('/chat'));
  });

  it('refuses a protocol-relative URL, which browsers treat as absolute', () => {
    expect(hrefFor('redirectTo=//evil.example')).not.toContain('evil.example');
  });

  it('falls back when no return path is supplied', () => {
    expect(hrefFor('')).toContain(encodeURIComponent('/chat'));
  });
});
