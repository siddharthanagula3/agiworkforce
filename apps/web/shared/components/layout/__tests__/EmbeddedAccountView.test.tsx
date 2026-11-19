import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMBEDDED_PAGE_PARAM, EMBEDDED_PAGE_PARAM_VALUE } from '@agiworkforce/types';

type NavigationModule = typeof import('next/navigation');
type LoggerModule = typeof import('@shared/lib/logger');
type AppearancePreferencesModule = typeof import('@shared/components/AppearancePreferences');
type TelemetryConsentSyncModule = typeof import('@shared/components/TelemetryConsentSync');
type CloudSettingsSyncModule = typeof import('@/features/settings/components/CloudSettingsSync');

const route = vi.hoisted(() => ({ pathname: '/', search: '' }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock('@shared/lib/logger', async (importOriginal) => ({
  ...(await importOriginal<LoggerModule>()),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/app/ProductRuntimeProviders', () => ({
  default: ({ children }: { children: ReactElement }) => (
    <div data-testid="product-runtime">{children}</div>
  ),
}));
vi.mock('@shared/components/AppearancePreferences', async (importOriginal) => ({
  ...(await importOriginal<AppearancePreferencesModule>()),
  AppearancePreferences: () => null,
}));
vi.mock('@shared/components/OfflineIndicator', () => ({ OfflineIndicator: () => null }));
vi.mock('@shared/components/SessionTimeoutGuard', () => ({
  SessionTimeoutGuard: () => <span data-testid="session-timeout-guard" />,
}));
vi.mock('@shared/components/TelemetryConsentSync', async (importOriginal) => ({
  ...(await importOriginal<TelemetryConsentSyncModule>()),
  TelemetryConsentSync: () => null,
}));
vi.mock('@/features/settings/components/CloudSettingsSync', async (importOriginal) => ({
  ...(await importOriginal<CloudSettingsSyncModule>()),
  CloudSettingsSync: () => null,
}));

import RootError from '@/app/error';
import LoginError from '@/app/login/error';
import { SettingsRuntimeProviders } from '@/app/settings/SettingsRuntimeProviders';
import { AuthBrand } from '@/features/auth/AuthBrand';
import { AuthLegalFooter } from '@/features/auth/AuthLegalFooter';
import { AuthSwitchLine } from '@/features/auth/AuthSwitchLine';
import { SettingsSectionLink } from '@/features/settings/components/SettingsSectionLink';
import { HelpArticleLink } from '@/features/support/components/HelpArticleLink';
import { embeddedPageHref, embeddedSignInPath, isEmbeddedPageView } from '@/lib/embedded-page';
import { helpArticlePath } from '@/lib/support/help-paths';
import { EmbeddedPageProvider, useEmbeddedSignInPath } from '../EmbeddedPage';

const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const MARKED_ACCOUNT = `/settings/account?${MARKER}`;
const MARKED_SIGN_IN = `/login?redirectTo=${encodeURIComponent(MARKED_ACCOUNT)}`;

function at(pathAndSearch: string) {
  const url = new URL(pathAndSearch, 'https://agiworkforce.com');
  route.pathname = url.pathname;
  route.search = url.search.slice(1);
}

function renderAt(pathAndSearch: string, ui: ReactElement) {
  at(pathAndSearch);
  return render(<EmbeddedPageProvider>{ui}</EmbeddedPageProvider>);
}

function hrefs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map(
    (anchor) => anchor.getAttribute('href') ?? '',
  );
}

function SignInPathProbe() {
  return <output>{useEmbeddedSignInPath() ?? 'none'}</output>;
}

afterEach(() => {
  at('/');
});

describe('which views are marked', () => {
  it.each([
    [MARKED_ACCOUNT, true],
    [`/settings/security?${MARKER}`, true],
    ['/settings/account', false],
    [`/settings/billing?${MARKER}`, false],
    [`/settings?${MARKER}`, false],
    [`/chat?${MARKER}`, false],
    [`/upgrade?${MARKER}`, false],
    [MARKED_SIGN_IN, true],
    [`/login/complete?redirectTo=${encodeURIComponent(MARKED_ACCOUNT)}`, true],
    [`/session-expired?redirectTo=${encodeURIComponent(MARKED_ACCOUNT)}`, true],
    [`/login?next=${encodeURIComponent(MARKED_ACCOUNT)}`, true],
    [`/login?redirectTo=${encodeURIComponent('/settings/account')}`, false],
    [`/login?redirectTo=${encodeURIComponent(`/settings/billing?${MARKER}`)}`, false],
    [`/login?redirectTo=${encodeURIComponent(`https://attacker.example${MARKED_ACCOUNT}`)}`, false],
    [`/login?${MARKER}`, false],
    [`/pricing?redirectTo=${encodeURIComponent(MARKED_ACCOUNT)}`, false],
  ])('%s is marked: %s', (pathAndSearch, marked) => {
    const url = new URL(pathAndSearch, 'https://agiworkforce.com');
    expect(isEmbeddedPageView(url.pathname, url.searchParams)).toBe(marked);
  });
});

describe('links inside a marked view', () => {
  it.each([
    ['/settings/account', MARKED_ACCOUNT],
    ['/settings/security', `/settings/security?${MARKER}`],
    [MARKED_SIGN_IN, MARKED_SIGN_IN],
    ['/settings/billing', null],
    ['/settings/usage', null],
    ['/upgrade', null],
    ['/login', null],
    [`/signup?redirectTo=${encodeURIComponent('/chat')}`, null],
    ['/contact', null],
    ['/recover?lost=email', null],
  ])('%s becomes %s', (href, expected) => {
    expect(embeddedPageHref(href)).toBe(expected);
  });

  it('sends a signed-out account page back to its own sign-in page', () => {
    expect(embeddedSignInPath(MARKED_ACCOUNT)).toBe(MARKED_SIGN_IN);
  });

  it.each([
    [MARKED_ACCOUNT, MARKED_SIGN_IN],
    [MARKED_SIGN_IN, MARKED_SIGN_IN],
    [`/terms?${MARKER}`, 'none'],
    ['/settings/account', 'none'],
    ['/login', 'none'],
  ])('signing out from %s lands on %s', (pathAndSearch, expected) => {
    renderAt(pathAndSearch, <SignInPathProbe />);
    expect(screen.getByRole('status')).toHaveTextContent(expected);
  });

  it('keeps a section link outside the dialog on the marked account pages only', () => {
    const { container } = renderAt(
      MARKED_ACCOUNT,
      <>
        <SettingsSectionLink section="security">Security</SettingsSectionLink>
        <SettingsSectionLink section="billing">Billing</SettingsSectionLink>
        <HelpArticleLink docId="account-security" label="How account security works" />
      </>,
    );
    expect(hrefs(container)).toEqual([
      `/settings/security?${MARKER}`,
      `${helpArticlePath('account-security')}?${MARKER}`,
    ]);
    expect(screen.getByText('Billing').closest('a')).toBeNull();
  });

  it('leaves the same links untouched for an ordinary visitor', () => {
    const { container } = renderAt(
      '/settings/account',
      <>
        <SettingsSectionLink section="security">Security</SettingsSectionLink>
        <SettingsSectionLink section="billing">Billing</SettingsSectionLink>
        <HelpArticleLink docId="account-security" label="How account security works" />
      </>,
    );
    expect(hrefs(container)).toEqual([
      '/settings/security',
      '/settings/billing',
      helpArticlePath('account-security'),
    ]);
  });
});

describe('the sign-in page an account link lands on', () => {
  const authChrome = (
    <>
      <AuthBrand />
      <AuthSwitchLine
        mode="login"
        href={`/signup?redirectTo=${encodeURIComponent(MARKED_ACCOUNT)}`}
      />
      <AuthLegalFooter />
    </>
  );

  it('offers no home page, sign-up or contact link when it returns to a marked account page', () => {
    const { container } = renderAt(MARKED_SIGN_IN, authChrome);

    expect(screen.getByText('AGI').closest('a')).toBeNull();
    expect(screen.queryByText('Sign up')).toBeNull();
    expect(screen.queryByText('Contact')).toBeNull();
    expect(hrefs(container)).toEqual([`/help?${MARKER}`, `/privacy?${MARKER}`, `/terms?${MARKER}`]);
  });

  it('keeps every link for an ordinary sign-in', () => {
    const { container } = renderAt('/login', authChrome);

    expect(hrefs(container)).toEqual([
      '/',
      `/signup?redirectTo=${encodeURIComponent(MARKED_ACCOUNT)}`,
      '/help',
      '/privacy',
      '/terms',
      '/contact',
    ]);
    expect(container.innerHTML).not.toContain(`/help?${MARKER}`);
  });
});

describe('the settings runtime', () => {
  it('mounts none of the product runtime on a marked account page', () => {
    renderAt(MARKED_ACCOUNT, <SettingsRuntimeProviders>page</SettingsRuntimeProviders>);

    expect(screen.queryByTestId('product-runtime')).toBeNull();
    expect(screen.getByTestId('session-timeout-guard')).toBeInTheDocument();
    expect(screen.getByText('page')).toBeInTheDocument();
  });

  it.each(['/settings/account', `/settings/billing?${MARKER}`, `/settings/usage?${MARKER}`])(
    'mounts the full product runtime at %s',
    (pathAndSearch) => {
      renderAt(pathAndSearch, <SettingsRuntimeProviders>page</SettingsRuntimeProviders>);

      expect(screen.getByTestId('product-runtime')).toHaveTextContent('page');
    },
  );
});

describe('an error on the pages an account link reaches', () => {
  it('offers only a retry and the marked sign-in page', () => {
    const { container } = renderAt(
      MARKED_ACCOUNT,
      <RootError error={new Error('401 unauthorized')} reset={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(hrefs(container)).toEqual([MARKED_SIGN_IN]);
  });

  it('drops the home link from a sign-in error', () => {
    const { container } = renderAt(
      MARKED_SIGN_IN,
      <LoginError error={new Error('boom')} reset={vi.fn()} />,
    );

    expect(hrefs(container)).toEqual([]);
  });

  it('keeps the home, sign-in and contact links for an ordinary visitor', () => {
    const { container } = renderAt(
      '/settings/account',
      <RootError error={new Error('401 unauthorized')} reset={vi.fn()} />,
    );

    expect(hrefs(container)).toEqual(expect.arrayContaining(['/login', '/contact']));
    expect(hrefs(container)).toHaveLength(3);
  });
});
