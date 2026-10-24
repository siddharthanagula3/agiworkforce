import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signedOutRedirectUrl } from '@/lib/identity/client';
import { useHomeHref } from '../hooks/use-home-href';

function withHost(platform: string | null) {
  if (platform === null) {
    Reflect.deleteProperty(window, 'agiHost');
    return;
  }
  Object.assign(window, {
    agiHost: {
      platform,
      appVersion: '1.2.0',
      invokeRuntime: vi.fn(),
      onDeepLink: vi.fn(() => () => undefined),
      onVoiceHotkey: vi.fn(() => () => undefined),
      onRuntimeEvent: vi.fn(() => () => undefined),
      openExternal: vi.fn(async () => undefined),
      notify: vi.fn(async () => undefined),
      checkForUpdate: vi.fn(),
      openUpdateInstaller: vi.fn(async () => undefined),
    },
  });
}

afterEach(() => {
  withHost(null);
});

describe('where a sign-out lands', () => {
  it('keeps the caller choice in a browser', () => {
    expect(signedOutRedirectUrl('/', false)).toBe('/');
    expect(signedOutRedirectUrl('/login', false)).toBe('/login');
    expect(signedOutRedirectUrl(undefined, false)).toBeUndefined();
  });

  // Deleting an account used to send the shell to the marketing home, which the
  // shell hands to the browser: the window stayed on the settings screen of the
  // account that had just been deleted.
  it('replaces a marketing destination with the sign-in route in the shell', () => {
    expect(signedOutRedirectUrl('/', true)).toBe('/login');
    expect(signedOutRedirectUrl('/pricing', true)).toBe('/login');
    expect(signedOutRedirectUrl(undefined, true)).toBe('/login');
    expect(signedOutRedirectUrl('https://agiworkforce.com/', true)).toBe('/login');
  });

  it('leaves a destination that is part of signing in', () => {
    expect(signedOutRedirectUrl('/login', true)).toBe('/login');
    expect(signedOutRedirectUrl('/login?redirectTo=%2Fchat', true)).toBe(
      '/login?redirectTo=%2Fchat',
    );
    expect(signedOutRedirectUrl('/pair/ABCD', true)).toBe('/pair/ABCD');
  });
});

function HomeHref() {
  return <span data-testid="home">{useHomeHref()}</span>;
}

describe('where "go home" goes', () => {
  it('offers the marketing home in a browser', () => {
    render(<HomeHref />);
    expect(screen.getByTestId('home')).toHaveTextContent('/');
  });

  it('offers the product in the shell, which does not host the marketing site', () => {
    withHost('electron-darwin');
    render(<HomeHref />);
    expect(screen.getByTestId('home')).toHaveTextContent('/chat');
  });
});
