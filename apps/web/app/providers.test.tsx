import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }));
vi.mock('./AppRuntimeMounts', () => ({
  default: () => <div data-testid="app-runtime-mounts" />,
}));

vi.mock('react-i18next', () => ({
  I18nextProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@agiworkforce/ui', async (importActual) => ({
  ...(await importActual<typeof import('@agiworkforce/ui')>()),
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

  it('mounts the app runtime on an app route and nowhere else', async () => {
    navigation.pathname = '/pricing';
    const marketing = render(
      <Providers>
        <span>App content</span>
      </Providers>,
    );
    expect(marketing.queryByTestId('app-runtime-mounts')).toBeNull();
    marketing.unmount();

    navigation.pathname = '/chat';
    const app = render(
      <Providers>
        <span>App content</span>
      </Providers>,
    );
    expect(await app.findByTestId('app-runtime-mounts')).toBeInTheDocument();
    app.unmount();
    navigation.pathname = '/';
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
