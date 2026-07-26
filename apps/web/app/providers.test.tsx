import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('sonner', () => ({ Toaster: () => null }));
vi.mock('./i18n', () => ({ default: {} }));
vi.mock('@shared/stores/query-client', () => ({
  QueryProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="query-provider">{children}</div>
  ),
}));
vi.mock('@shared/components/CommandPalette/CommandPaletteProvider', () => ({
  CommandPaletteProvider: () => null,
}));
vi.mock('@/features/marketing/components/WaitlistModal', () => ({
  WaitlistModalProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/settings/components/SettingsModalProvider', () => ({
  SettingsModalProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@shared/components/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));
vi.mock('@agiworkforce/unified-chat', () => ({
  CapabilityProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="capability-provider">{children}</div>
  ),
}));
vi.mock('@shared/components/OfflineIndicator', () => ({ OfflineIndicator: () => null }));
vi.mock('@shared/components/SessionTimeoutGuard', () => ({ SessionTimeoutGuard: () => null }));
vi.mock('@/lib/seo/seo-optimizer', () => ({
  seoService: { initialize: vi.fn() },
}));

import Providers from './providers';

describe('Providers', () => {
  it('keeps the theme provider outside every other client provider', () => {
    const { container } = render(
      <Providers>
        <span>App content</span>
      </Providers>,
    );

    const themeProvider = screen.getByTestId('theme-provider');
    const capabilityProvider = screen.getByTestId('capability-provider');
    const queryProvider = screen.getByTestId('query-provider');

    // next-themes injects an inline bootstrap script. Under React 19 it must
    // own the outermost client boundary or the script is rendered through a
    // parent client tree and React logs a script-tag error on every reload.
    expect(themeProvider).toContainElement(capabilityProvider);
    expect(capabilityProvider).toContainElement(queryProvider);
    expect(themeProvider.parentElement).toBe(container);
  });
});
