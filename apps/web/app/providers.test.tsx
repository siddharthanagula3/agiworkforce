import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./AppRuntimeMounts', () => ({
  default: () => <div data-testid="app-runtime-mounts" />,
}));

vi.mock('react-i18next', () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@agiworkforce/ui/sonner', () => ({
  SonnerToaster: () => null,
}));
vi.mock('./i18n', () => ({
  default: {},
  SUPPORTED_LANGUAGES: ['en'],
  selectableLanguageOrDefault: (code: string) => code,
}));
vi.mock('@shared/stores/query-client', () => ({
  QueryProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="query-provider">{children}</div>
  ),
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
vi.mock('@agiworkforce/unified-chat/capabilities', () => ({
  CapabilityProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="capability-provider">{children}</div>
  ),
}));

import Providers from './providers';
import ProductRuntimeProviders from './ProductRuntimeProviders';

describe('Providers', () => {
  it('keeps the common provider shell lightweight', () => {
    const { container } = render(
      <Providers>
        <span>App content</span>
      </Providers>,
    );

    const themeProvider = screen.getByTestId('theme-provider');

    expect(themeProvider).toHaveTextContent('App content');
    expect(screen.queryByTestId('capability-provider')).toBeNull();
    expect(screen.queryByTestId('query-provider')).toBeNull();
    expect(themeProvider.parentElement).toBe(container);
  });

  it('keeps product-only providers in the product runtime', () => {
    render(
      <ProductRuntimeProviders>
        <span>App content</span>
      </ProductRuntimeProviders>,
    );

    const capabilityProvider = screen.getByTestId('capability-provider');
    const queryProvider = screen.getByTestId('query-provider');

    expect(capabilityProvider).toContainElement(queryProvider);
    expect(screen.getByTestId('app-runtime-mounts')).toBeInTheDocument();
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
