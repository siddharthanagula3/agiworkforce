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
// Renders null in production too. Stubbed here for the same reason as the
// other leaves below: this test asserts PROVIDER NESTING, and the real
// component calls Clerk's useAuth, which throws outside a ClerkProvider —
// which layout.tsx supplies and this structural test deliberately does not.
vi.mock('@shared/components/TelemetryConsentSync', () => ({
  TelemetryConsentSync: () => null,
}));
vi.mock('@shared/components/OfflineIndicator', () => ({ OfflineIndicator: () => null }));
vi.mock('@shared/components/SessionTimeoutGuard', () => ({ SessionTimeoutGuard: () => null }));

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

    expect(themeProvider).toContainElement(capabilityProvider);
    expect(capabilityProvider).toContainElement(queryProvider);
    expect(themeProvider.parentElement).toBe(container);
  });

  it('does not remove or replace the server-rendered structured data', () => {
    const marker = 'canary-server-rendered-organization';
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({ '@type': 'Organization', name: marker });
    document.head.appendChild(script);

    render(
      <Providers>
        <span>App content</span>
      </Providers>,
    );

    const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.textContent).toContain(marker);

    document.head.removeChild(script);
  });
});
