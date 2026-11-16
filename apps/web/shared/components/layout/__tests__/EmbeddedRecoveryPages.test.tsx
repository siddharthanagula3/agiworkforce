import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMBEDDABLE_RECOVERY_PAGE_PATHS,
  EMBEDDED_PAGE_PARAM,
  EMBEDDED_PAGE_PARAM_VALUE,
  isEmbeddableAccountPagePath,
  isEmbeddablePagePath,
} from '@agiworkforce/types';

type NavigationModule = typeof import('next/navigation');

const route = vi.hoisted(() => ({ pathname: '/', search: '' }));
const mockReplace = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<NavigationModule>()),
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

vi.mock('@shared/components/layout/Header', () => ({
  Header: () => (
    <header data-testid="site-header">
      <a href="/pricing">Pricing</a>
    </header>
  ),
}));

vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => (
    <footer data-testid="site-footer">
      <a href="/pricing">Pricing</a>
    </footer>
  ),
}));

import ResetPasswordPage from '@/app/auth/reset-password/page';
import { AuthBrand } from '@/features/auth/AuthBrand';
import { AuthLegalFooter } from '@/features/auth/AuthLegalFooter';
import { embeddedRecoverySignInPath, isEmbeddedPageView } from '@/lib/embedded-page';
import { EmbeddedPageProvider } from '../EmbeddedPage';

const MARKER = `${EMBEDDED_PAGE_PARAM}=${EMBEDDED_PAGE_PARAM_VALUE}`;
const SALES_PATHS = ['/', '/pricing', '/contact', '/contact-sales', '/signup', '/chat'];

function renderAt(pathAndSearch: string, ui: ReactElement) {
  const url = new URL(pathAndSearch, 'https://agiworkforce.com');
  route.pathname = url.pathname;
  route.search = url.search.slice(1);
  return render(<EmbeddedPageProvider>{ui}</EmbeddedPageProvider>);
}

function sitePaths(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('a[href]')).map(
    (anchor) => new URL(anchor.getAttribute('href') ?? '', 'https://agiworkforce.com').pathname,
  );
}

function RecoveryChrome() {
  return (
    <>
      <AuthBrand />
      <AuthLegalFooter />
    </>
  );
}

beforeEach(() => {
  mockReplace.mockReset();
});

afterEach(() => {
  route.pathname = '/';
  route.search = '';
});

describe('the recovery pages the phone app opens', () => {
  it('are signed-out pages outside the content and account lists', () => {
    for (const path of EMBEDDABLE_RECOVERY_PAGE_PATHS) {
      expect(isEmbeddablePagePath(path)).toBe(false);
      expect(isEmbeddableAccountPagePath(path)).toBe(false);
    }
  });

  it.each(EMBEDDABLE_RECOVERY_PAGE_PATHS.map((path) => [path]))(
    'mark %s only when the app marks it',
    (path) => {
      expect(isEmbeddedPageView(path, new URLSearchParams(MARKER))).toBe(true);
      expect(isEmbeddedPageView(path, new URLSearchParams())).toBe(false);
      expect(isEmbeddedPageView(path, new URLSearchParams(`${EMBEDDED_PAGE_PARAM}=web`))).toBe(
        false,
      );
    },
  );

  it.each([['/recover'], ['/appeal']])(
    'offer no home, sign-up, contact or pricing link on a marked %s',
    (path) => {
      const { container } = renderAt(`${path}?${MARKER}`, <RecoveryChrome />);

      expect(sitePaths(container).filter((href) => SALES_PATHS.includes(href))).toEqual([]);
      expect(screen.getByText('AGI').closest('a')).toBeNull();
    },
  );

  it.each([['/recover'], ['/appeal']])('keep every link on %s for an ordinary visitor', (path) => {
    const { container } = renderAt(path, <RecoveryChrome />);

    expect(sitePaths(container)).toEqual(expect.arrayContaining(['/', '/contact']));
  });
});

describe('the old reset-password address', () => {
  it('sends a marked visit to the sign-in page that returns to the marked account page', () => {
    const { container } = renderAt(`/auth/reset-password?${MARKER}`, <ResetPasswordPage />);

    expect(mockReplace).toHaveBeenCalledWith(embeddedRecoverySignInPath());
    expect(embeddedRecoverySignInPath()).toBe(
      `/login?redirectTo=${encodeURIComponent(`/settings/account?${MARKER}`)}`,
    );
    expect(screen.queryByTestId('site-header')).toBeNull();
    expect(screen.queryByTestId('site-footer')).toBeNull();
    expect(sitePaths(container)).toEqual([]);
  });

  it('sends an ordinary visitor to the ordinary sign-in page with the site around it', () => {
    renderAt('/auth/reset-password', <ResetPasswordPage />);

    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(screen.getByTestId('site-header')).toBeTruthy();
    expect(screen.getByTestId('site-footer')).toBeTruthy();
  });
});
