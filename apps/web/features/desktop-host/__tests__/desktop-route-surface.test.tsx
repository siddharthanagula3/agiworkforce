import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotFound from '@/app/not-found';

function withHost(present: boolean) {
  if (!present) {
    Reflect.deleteProperty(window, 'agiHost');
    return;
  }
  Object.assign(window, {
    agiHost: {
      platform: 'electron-darwin',
      appVersion: '1.2.0',
      onDeepLink: vi.fn(() => () => undefined),
      onVoiceHotkey: vi.fn(() => () => undefined),
      onRuntimeEvent: vi.fn(() => () => undefined),
      onHostCommand: vi.fn(() => () => undefined),
      invokeRuntime: vi.fn(),
      openExternal: vi.fn(),
      notify: vi.fn(),
      readPreferences: vi.fn(),
      writePreferences: vi.fn(),
      checkForUpdate: vi.fn(),
      openUpdateInstaller: vi.fn(),
    },
  });
}

afterEach(() => {
  withHost(false);
  vi.restoreAllMocks();
});

describe('a route the shell cannot render', () => {
  // The desktop hosts the product. A not-found that drew the marketing header
  // turned the app window into the website, with a nav to six marketing
  // sections and a button inviting the user to open the app they are in.
  it('shows no marketing chrome inside the shell', () => {
    withHost(true);
    render(<NotFound />);

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    for (const marketing of ['Pricing', 'Solutions', 'Developers', 'Contact sales', 'Open AGI']) {
      expect(screen.queryByText(marketing), marketing).not.toBeInTheDocument();
    }
    expect(document.querySelector('[data-surface="web"]')).toBeNull();
  });

  it('says what happened and offers the one way back', () => {
    withHost(true);
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("This page doesn't exist.");
    const actions = screen.getAllByRole('link');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toHaveAttribute('href', '/chat');
    expect(actions[0]).toHaveTextContent('Go to chat');
  });

  it('keeps the brand mark where the stylesheet can move it clear of the window buttons', () => {
    withHost(true);
    render(<NotFound />);

    expect(document.querySelector('[data-window-brand]')).not.toBeNull();
  });

  it('leaves the marketing page alone in a browser', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('That page is not here.');
    expect(document.querySelector('[data-surface="web"]')).not.toBeNull();
    expect(document.querySelector('[data-surface="desktop"]')).toBeNull();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
