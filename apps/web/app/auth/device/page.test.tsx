import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render as renderBare, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { baseInitOptions } from '@agiworkforce/i18n';
import type React from 'react';

import AuthDevicePage from './page';

const authState = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: true,
  signOut: vi.fn(),
  user: {
    fullName: 'Ada Lovelace',
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada',
    primaryEmailAddress: { emailAddress: 'ada@example.com' },
    emailAddresses: [{ emailAddress: 'ada@example.com' }],
  },
}));

const searchState = vi.hoisted(() => ({
  userCode: 'ABCD-1234',
  surface: null as string | null,
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    isLoaded: authState.isLoaded,
    isSignedIn: authState.isSignedIn,
    user: authState.isSignedIn ? authState.user : null,
  }),
  useClerk: () => ({ signOut: authState.signOut }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: (key: string) => {
      if (key === 'user_code') return searchState.userCode;
      if (key === 'surface') return searchState.surface;
      return null;
    },
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@shared/components/layout/Header', () => ({
  Header: ({ minimal }: { minimal?: boolean }) => (
    <header data-testid="header" data-minimal={String(minimal ?? false)}>
      Header
    </header>
  ),
}));

vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <footer>Footer</footer>,
}));

function render(ui: React.ReactElement, overrides?: Record<string, unknown>) {
  const instance = createInstance();
  void instance.use(initReactI18next).init({ ...baseInitOptions, lng: 'en' });
  if (overrides) instance.addResourceBundle('en', 'auth', overrides, true, true);
  return renderBare(<I18nextProvider i18n={instance}>{ui}</I18nextProvider>);
}

describe('/auth/device page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authState.isLoaded = true;
    authState.isSignedIn = true;
    authState.signOut.mockReset();
    authState.signOut.mockResolvedValue(undefined);
    searchState.userCode = 'ABCD-1234';
    searchState.surface = null;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/auth/device/code?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                user_code: 'ABCD-1234',
                client: { name: 'AGI for VS Code', type: 'vscode' },
                scopes: [
                  {
                    id: 'account:read',
                    label: 'Account identity and plan',
                    description:
                      'Read the account name, email, plan, and usage shown in this client.',
                  },
                  {
                    id: 'managed-cloud:use',
                    label: 'AGI Managed Cloud',
                    description:
                      'Use account-backed AGI Cloud features on this device, subject to plan and workspace permissions.',
                  },
                ],
                expires_at: '2099-08-01T00:00:00.000Z',
              }),
          } as Partial<Response>);
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }),
    );
  });

  it('does not call protected approval APIs while signed out', () => {
    authState.isSignedIn = false;
    const fetchMock = vi.mocked(fetch);

    render(<AuthDevicePage />);

    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(
      'Sign in before approving this device request.',
    );
    expect(screen.getByRole('button', { name: 'Sign in required' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('formats pasted device codes before submitting', () => {
    searchState.userCode = '';
    render(<AuthDevicePage />);

    fireEvent.change(screen.getByLabelText('Device code'), {
      target: { value: 'abcd1234' },
    });

    expect(screen.getByLabelText('Device code')).toHaveValue('ABCD-1234');
  });

  it('isolates the approval card from the full-bleed marketing section layout', () => {
    render(<AuthDevicePage />);

    const card = screen.getByRole('heading', { name: 'Connect a device.' }).closest('section');

    expect(card).toHaveClass('agi-device-auth-card');
    expect(card).not.toHaveClass('agi-section');
  });

  it('keeps the approval card readable at desktop and narrow viewport widths', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8');
    const rule = css.match(/\[data-design='agi'\] \.agi-device-auth-card\s*\{([\s\S]*?)\}/);
    const declarations = rule?.[1] ?? '';

    expect(declarations).toContain('width: 100%');
    expect(declarations).toContain('max-width: 30rem');
    expect(declarations).toContain('padding: clamp(');
  });

  it('uses focused chrome so navigation does not compete with device approval', () => {
    render(<AuthDevicePage />);

    expect(screen.getByTestId('header')).toHaveAttribute('data-minimal', 'true');
    expect(screen.getByText(/verified requesting app below/i)).toBeVisible();
  });

  it('shows the signed-in identity, verified client, requested scopes, and legal links', async () => {
    render(<AuthDevicePage />);

    expect(screen.getByLabelText('Signed-in account')).toHaveTextContent('Ada Lovelace');
    expect(screen.getByLabelText('Signed-in account')).toHaveTextContent('ada@example.com');
    expect(await screen.findByRole('heading', { name: 'AGI for VS Code' })).toBeVisible();
    expect(screen.getByText('Account identity and plan')).toBeVisible();
    expect(screen.getByText('AGI Managed Cloud')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
      'href',
      '/terms',
    );
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('signs out before switching to a different account', async () => {
    render(<AuthDevicePage />);

    fireEvent.click(screen.getByRole('button', { name: 'Use a different account' }));

    await waitFor(() => {
      expect(authState.signOut).toHaveBeenCalledWith({
        redirectUrl: '/login?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234',
      });
    });
  });

  it('renders a dedicated in-app Desktop surface and preserves it through sign-in', () => {
    authState.isSignedIn = false;
    searchState.surface = 'desktop';

    render(<AuthDevicePage />);

    expect(screen.getByTestId('desktop-device-auth-shell')).toBeVisible();
    expect(screen.queryByTestId('header')).not.toBeInTheDocument();
    expect(screen.queryByText('Footer')).not.toBeInTheDocument();
    expect(screen.getByText('Close this window to cancel.')).toBeVisible();
    expect(screen.queryByRole('link', { name: /compare plans/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?surface=desktop&redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234%26surface%3Ddesktop',
    );
  });

  it('directs the user back to the requesting app after approval', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.startsWith('/api/auth/device/code?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                user_code: 'ABCD-1234',
                client: { name: 'AGI for VS Code', type: 'vscode' },
                scopes: [
                  { id: 'account:read', label: 'Account identity', description: 'Read identity.' },
                ],
                expires_at: '2099-08-01T00:00:00.000Z',
              }),
          } as Partial<Response>);
        }
        if (url === '/api/csrf') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: 'csrf-token' }),
          } as Partial<Response>);
        }
        if (url === '/api/auth/device/approve') {
          return Promise.resolve({ ok: true } as Partial<Response>);
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      }),
    );

    render(<AuthDevicePage />);
    await screen.findByRole('heading', { name: 'AGI for VS Code' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve device' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Return to the app that opened this page; sign-in will finish automatically.',
      );
    });
  });

  it('renders structured approval errors without object text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/auth/device/code?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                user_code: 'ABCD-1234',
                client: { name: 'AGI for VS Code', type: 'vscode' },
                scopes: [
                  { id: 'account:read', label: 'Account identity', description: 'Read identity.' },
                ],
                expires_at: '2099-08-01T00:00:00.000Z',
              }),
          } as Partial<Response>);
        }
        if (url === '/api/csrf') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: 'csrf-token' }),
          } as Partial<Response>);
        }

        return Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: { message: 'Code not found or expired' } }),
        } as Partial<Response>);
      }),
    );

    render(<AuthDevicePage />);
    await screen.findByRole('heading', { name: 'AGI for VS Code' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve device' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Code not found or expired');
    });
    expect(screen.queryByText('[object Object]')).not.toBeInTheDocument();
  });

  it('offers the authenticated acceptance flow when current terms block approval', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.startsWith('/api/auth/device/code?')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                user_code: 'ABCD-1234',
                client: { name: 'AGI for VS Code', type: 'vscode' },
                scopes: [
                  { id: 'account:read', label: 'Account identity', description: 'Read identity.' },
                ],
                expires_at: '2099-08-01T00:00:00.000Z',
              }),
          } as Partial<Response>);
        }
        if (url === '/api/csrf') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ token: 'csrf-token' }),
          } as Partial<Response>);
        }

        return Promise.resolve({
          ok: false,
          json: () =>
            Promise.resolve({
              error: {
                code: 'TERMS_ACCEPTANCE_REQUIRED',
                message:
                  'Review and accept the current Terms of Service before approving a device.',
              },
              acceptanceUrl: '/login/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234',
            }),
        } as Partial<Response>);
      }),
    );

    render(<AuthDevicePage />);
    await screen.findByRole('heading', { name: 'AGI for VS Code' });
    fireEvent.click(screen.getByRole('button', { name: 'Approve device' }));

    expect(await screen.findByRole('link', { name: 'Review current policies' })).toHaveAttribute(
      'href',
      '/login/complete?redirectTo=%2Fauth%2Fdevice%3Fuser_code%3DABCD-1234',
    );
  });

  it('renders the pairing copy from the shared corpus, not from baked-in English', async () => {
    render(<AuthDevicePage />, {
      device: {
        title: 'CORPUS_TITLE',
        codeLabel: 'CORPUS_CODE_LABEL',
        useDifferentAccount: 'CORPUS_SWITCH_ACCOUNT',
        cloudNoteBody: 'CORPUS_TRUST_NOTE',
        approve: 'CORPUS_APPROVE',
      },
    });

    expect(screen.getByRole('heading', { name: 'CORPUS_TITLE' })).toBeVisible();
    expect(screen.getByLabelText('CORPUS_CODE_LABEL')).toBeVisible();
    expect(screen.getByRole('button', { name: 'CORPUS_SWITCH_ACCOUNT' })).toBeVisible();
    expect(screen.getByText(/CORPUS_TRUST_NOTE/)).toBeVisible();
    expect(await screen.findByRole('button', { name: 'CORPUS_APPROVE' })).toBeVisible();
    expect(screen.queryByText('Connect a device.')).not.toBeInTheDocument();
  });

  it('does not re-run the device lookup when the language settles after hydration', async () => {
    const fetchMock = vi.mocked(fetch);
    const instance = createInstance();
    await instance.use(initReactI18next).init({ ...baseInitOptions, lng: 'en' });

    renderBare(
      <I18nextProvider i18n={instance}>
        <AuthDevicePage />
      </I18nextProvider>,
    );

    const lookups = () =>
      fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/auth/device/code?'))
        .length;

    expect(await screen.findByRole('heading', { name: 'AGI for VS Code' })).toBeVisible();
    expect(lookups()).toBe(1);

    await act(async () => {
      await instance.changeLanguage('en');
    });

    expect(lookups()).toBe(1);
    expect(screen.getByRole('heading', { name: 'AGI for VS Code' })).toBeVisible();
    expect(screen.queryByText('Verifying the requesting app…')).not.toBeInTheDocument();
  });

  it('asks only for auth keys the English corpus actually defines', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/auth/device/page.tsx'), 'utf8');
    const authBundle = JSON.parse(
      readFileSync(resolve(process.cwd(), '../../packages/ui/i18n/locales/en/auth.json'), 'utf8'),
    ) as Record<string, unknown>;

    const referenced = [...source.matchAll(/t\('auth:([^']+)'\)/g)].map((match) => match[1]!);
    expect(referenced.length).toBeGreaterThan(0);

    for (const key of referenced) {
      const value = key
        .split('.')
        .reduce<unknown>(
          (node, segment) => (node as Record<string, unknown> | undefined)?.[segment],
          authBundle,
        );
      expect(typeof value, `auth.json is missing '${key}'`).toBe('string');
    }
  });
});
