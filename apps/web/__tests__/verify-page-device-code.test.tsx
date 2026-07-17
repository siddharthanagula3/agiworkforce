/**
 * verify-page-device-code.test.tsx
 *
 * Guards that /verify?code=<hex> renders the device-approval UI (VerifyDeviceClient)
 * and that /verify without a code still renders the email-check UI.
 *
 * FAILS without the fix (VerifyDeviceClient was never imported into verify/page.tsx).
 * PASSES with the fix.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// next/navigation — mock useSearchParams so we can control query params
// ---------------------------------------------------------------------------
const mockGet = vi.fn((_key: string): string | null => null);

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockGet }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/verify',
}));

// ---------------------------------------------------------------------------
// next/link — render as plain anchor so we can assert link text
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// ---------------------------------------------------------------------------
// Layout components — stub out so tests are not layout-dependent
// ---------------------------------------------------------------------------
vi.mock('@shared/components/layout/Header', () => ({
  Header: () => React.createElement('header', null, 'Header'),
}));

vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => React.createElement('footer', null, 'Footer'),
}));

// ---------------------------------------------------------------------------
// VerifyDeviceClient — use a lightweight stand-in that renders the code so
// we can assert it received the right prop without needing fetch/CSRF
// ---------------------------------------------------------------------------
vi.mock('@/app/verify/verify-client', () => ({
  VerifyDeviceClient: ({ code }: { code: string }) =>
    React.createElement(
      'div',
      { 'data-testid': 'verify-device-client', 'data-code': code },
      'Approve / Deny',
    ),
}));

// ---------------------------------------------------------------------------
// Import the page component AFTER all mocks are registered
// ---------------------------------------------------------------------------
// The default export is the server shell; VerifyBody is the inner suspense
// component. We test it directly by importing the page and rendering it.
// Because `mockReset: true` is set in vitest.config, we re-establish
// mockGet in beforeEach.

const { default: VerifyPage } = await import('@/app/verify/page');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function renderWithCode(code: string | null) {
  mockGet.mockImplementation((key: string): string | null => {
    if (key === 'code') return code;
    if (key === 'email') return null;
    return null;
  });
  return render(React.createElement(VerifyPage));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('/verify page — device-code branch', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockReturnValue(null);
  });

  it('renders the email-check UI when no ?code= param is present', () => {
    renderWithCode(null);
    expect(screen.getByText(/check your inbox/i)).toBeTruthy();
    expect(screen.queryByTestId('verify-device-client')).toBeNull();
  });

  it('renders VerifyDeviceClient when ?code= is present', () => {
    renderWithCode('ABCD1234ABCD1234');
    const client = screen.getByTestId('verify-device-client');
    expect(client).toBeTruthy();
    expect(client.getAttribute('data-code')).toBe('ABCD1234ABCD1234');
  });

  it('does NOT render the email-check heading when ?code= is present', () => {
    renderWithCode('DEADBEEF');
    expect(screen.queryByText(/check your inbox/i)).toBeNull();
  });

  it('renders the device-approval heading when ?code= is present', () => {
    renderWithCode('CAFEBABE');
    expect(screen.getByText(/approve this device/i)).toBeTruthy();
  });

  it('renders the security-notice copy when ?code= is present', () => {
    renderWithCode('FEEDFACE');
    expect(screen.getByText(/security notice/i)).toBeTruthy();
    expect(screen.getByText(/did not initiate this request/i)).toBeTruthy();
  });

  it('renders a Cancel link pointing to "/" when ?code= is present', () => {
    renderWithCode('C0FFEE01');
    const cancelLink = screen.getByRole('link', { name: /cancel/i });
    expect(cancelLink.getAttribute('href')).toBe('/');
  });
});
