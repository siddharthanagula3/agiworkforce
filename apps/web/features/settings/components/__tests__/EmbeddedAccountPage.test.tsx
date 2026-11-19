import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_PENDING_ACCOUNT_DELETION } from '@agiworkforce/cloud-contracts';
import {
  EMBEDDABLE_ACCOUNT_PAGE_PATHS,
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  isAuthPath,
  isEmbeddableAccountPagePath,
  isEmbeddablePagePath,
} from '@agiworkforce/types';

type NavigationModule = typeof import('next/navigation');
type AuthenticationStoreModule = typeof import('@shared/stores/authentication-store');
type CsrfModule = typeof import('@/lib/client/csrf');

const mocks = vi.hoisted(() => ({
  route: { pathname: '/settings/account', search: '' },
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
  signOut: vi.fn(),
  logout: vi.fn(),
  user: { id: 'user-1', passwordEnabled: true },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => mocks.route.pathname,
  useSearchParams: () => new URLSearchParams(mocks.route.search),
  useRouter: () => ({ replace: mocks.routerReplace, push: mocks.routerPush }),
}));

vi.mock('@clerk/nextjs', async () => {
  const { createClerkSessionFixture } =
    await import('@/lib/identity/__tests__/clerk-session-fixture');
  return {
    ...createClerkSessionFixture(
      () => ({
        isLoaded: true,
        isSignedIn: true,
        userId: mocks.user.id,
        sessionId: 'session-1',
        getToken: async () => 'token',
      }),
      { signOut: mocks.signOut },
    ),
    useUser: () => ({ isLoaded: true, isSignedIn: true, user: mocks.user }),
  };
});

vi.mock('@shared/stores/authentication-store', async (importOriginal) => ({
  ...(await importOriginal<AuthenticationStoreModule>()),
  useAuthStore: Object.assign(
    (selector: (state: unknown) => unknown) =>
      selector({ user: { id: 'user-1', email: 'reviewer@example.com' }, logout: mocks.logout }),
    { getState: () => ({ user: { id: 'user-1' }, updateUser: vi.fn() }) },
  ),
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      initialized: true,
      subscription: {
        tier: 'premium',
        display_name: 'Premium',
        status: 'active',
        current_period_end: null,
        cancel_at_period_end: false,
        plan_name: 'Premium',
        subscription_source: 'stripe',
      },
      capabilityDocument: null,
    }),
}));

vi.mock('@/lib/client/csrf', async (importOriginal) => ({
  ...(await importOriginal<CsrfModule>()),
  addCsrfHeaders: vi.fn(async (headers?: Record<string, string>) => headers ?? {}),
}));

import AccountSettingsPage from '@/app/settings/account/page';
import SecuritySettingsPage from '@/app/settings/security/page';
import { queryKeys } from '@shared/stores/query-client';
import { helpArticlePath } from '@/lib/support/help-paths';
import { settingsSectionPath } from '@/features/settings/lib/web-settings-sections';
import { EMBEDDED_ACCOUNT_SECTIONS } from '../EmbeddedAccountPage';
import { EmbeddedPageProvider } from '@shared/components/layout/EmbeddedPage';

const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const SITE = 'https://agiworkforce.com';
const PURCHASE_PATHS = ['/', '/pricing', '/upgrade', '/checkout', '/billing', '/settings/billing'];
const PURCHASE_WORDS = /upgrade|pricing|compare plans|buy|purchase|checkout|subscribe|top.?up/i;

function at(pathname: string, marked: boolean) {
  mocks.route.pathname = pathname;
  mocks.route.search = marked ? MARKER : '';
}

function renderPage(page: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(queryKeys.settings.accountDeletionStatus(), NO_PENDING_ACCOUNT_DELETION);
  return render(
    <QueryClientProvider client={client}>
      <EmbeddedPageProvider>{page}</EmbeddedPageProvider>
    </QueryClientProvider>,
  );
}

function siteLinks(container: HTMLElement): URL[] {
  return Array.from(container.ownerDocument.querySelectorAll('a[href]'))
    .map((anchor) => new URL(anchor.getAttribute('href') ?? '', SITE))
    .filter((url) => url.origin === SITE);
}

function staysInMarkedView(url: URL): boolean {
  const marked = url.searchParams.get(EMBEDDED_PAGE_PARAM) === EMBEDDED_PAGE_PARAM_VALUE;
  if (isEmbeddablePagePath(url.pathname) || isEmbeddableAccountPagePath(url.pathname)) {
    return marked;
  }
  if (!isAuthPath(url.pathname)) return false;
  const back = new URL(url.searchParams.get('redirectTo') ?? '/', SITE);
  return (
    isEmbeddableAccountPagePath(back.pathname) &&
    back.searchParams.get(EMBEDDED_PAGE_PARAM) === EMBEDDED_PAGE_PARAM_VALUE
  );
}

function controlNames(): string[] {
  return [...screen.queryAllByRole('link'), ...screen.queryAllByRole('button')].map(
    (control) => control.getAttribute('aria-label') ?? control.textContent ?? '',
  );
}

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = url.includes('/api/settings/sessions')
      ? { sessions: [], totalCount: 0 }
      : url.includes('/api/me')
        ? { error: 'not in this test' }
        : {};
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => {
  at('/settings/account', false);
  mocks.routerReplace.mockReset();
  mocks.routerPush.mockReset();
  vi.restoreAllMocks();
});

describe('the account pages the phone app opens', () => {
  it('renders a section for every account page the route registry names, and no other', () => {
    expect(EMBEDDED_ACCOUNT_SECTIONS.map(settingsSectionPath)).toEqual([
      ...EMBEDDABLE_ACCOUNT_PAGE_PATHS,
    ]);
  });

  it.each([
    ['/settings/account', () => <AccountSettingsPage />, 'Account', 'Delete account'],
    ['/settings/security', () => <SecuritySettingsPage />, 'Security', 'Log out of all devices'],
  ])(
    '%s renders on its own with no route to a plan or a purchase',
    async (path, page, title, row) => {
      at(path, true);
      const { container } = renderPage(page());

      expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
      expect(screen.getAllByText(row).length).toBeGreaterThan(0);
      await waitFor(() => expect(screen.queryByText(/loading active sessions/i)).toBeNull());

      expect(mocks.routerReplace).not.toHaveBeenCalled();
      expect(mocks.routerPush).not.toHaveBeenCalled();
      const links = siteLinks(container);
      expect(links.map((url) => `${url.pathname}${url.search}`)).toEqual(
        expect.arrayContaining([
          `/settings/account?${MARKER}`,
          `/settings/security?${MARKER}`,
          `${helpArticlePath('account-security')}?${MARKER}`,
        ]),
      );
      expect(links.filter((url) => !staysInMarkedView(url)).map((url) => url.href)).toEqual([]);
      expect(
        links.filter((url) =>
          PURCHASE_PATHS.some(
            (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
          ),
        ),
      ).toEqual([]);
      expect(controlNames().filter((name) => PURCHASE_WORDS.test(name))).toEqual([]);
    },
  );

  it('switches between Account and Security without leaving the marked view', async () => {
    at('/settings/account', true);
    renderPage(<AccountSettingsPage />);

    const nav = await screen.findByRole('navigation', { name: 'Settings' });
    const tabs = within(nav).getAllByRole('link');
    expect(tabs.map((tab) => tab.getAttribute('href'))).toEqual([
      `/settings/account?${MARKER}`,
      `/settings/security?${MARKER}`,
    ]);
    expect(within(nav).getByRole('link', { name: 'Account' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the plan as a fact where the account page already names it', async () => {
    at('/settings/account', true);
    renderPage(<AccountSettingsPage />);

    expect(await screen.findByTestId('delete-account-plan-note')).toHaveTextContent('Premium');
  });
});

describe('the same addresses for an ordinary visitor', () => {
  it.each([
    ['/settings/account', () => <AccountSettingsPage />, 'account'],
    ['/settings/security', () => <SecuritySettingsPage />, 'security'],
  ])('%s still opens the settings dialog in the chat app', async (path, page, section) => {
    at(path, false);
    const { container } = renderPage(page());

    await waitFor(() =>
      expect(mocks.routerReplace).toHaveBeenCalledWith(`/chat?settings=${section}`),
    );
    expect(screen.queryByRole('navigation', { name: 'Settings' })).toBeNull();
    expect(container.innerHTML).not.toContain(MARKER);
  });

  it('ignores the marker on a settings section the phone app does not open', () => {
    at('/settings/billing', true);
    renderPage(<AccountSettingsPage />);

    expect(screen.queryByRole('navigation', { name: 'Settings' })).toBeNull();
  });
});
