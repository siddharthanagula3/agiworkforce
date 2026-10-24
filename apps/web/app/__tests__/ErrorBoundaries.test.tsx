import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../error';
import GlobalError from '../global-error';

vi.mock('@shared/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const RAW =
  'ECONNRESET calling https://api.internal.example/v1/keys?token=sk-live-secret at Object.<anonymous> (/srv/app/lib/provider.ts:42:11)';

function renderGlobalError(error: Error & { digest?: string }) {
  const html = document.createElement('div');
  document.body.appendChild(html);
  return render(<GlobalError error={error} reset={vi.fn()} />, {
    container: html,
    baseElement: document.documentElement,
  });
}

describe('app/error.tsx', () => {
  it('never renders the raw error text, host or secret', () => {
    render(<ErrorBoundary error={new Error(RAW)} reset={vi.fn()} />);
    expect(document.body.textContent).not.toContain('sk-live-secret');
    expect(document.body.textContent).not.toContain('api.internal.example');
    expect(document.body.textContent).not.toContain('provider.ts');
  });

  it('states the condition and a next step instead of a bare apology', () => {
    render(<ErrorBoundary error={new Error('403 forbidden')} reset={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Access Denied' })).toBeTruthy();
    expect(document.body.textContent).toContain('Ask a workspace admin');
  });

  it('offers a sign-in route only when the session is what failed', () => {
    const { unmount } = render(
      <ErrorBoundary error={new Error('401 unauthorized')} reset={vi.fn()} />,
    );
    expect(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
    unmount();

    render(<ErrorBoundary error={new Error('fetch failed')} reset={vi.fn()} />);
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('shows the digest as a support reference rather than an unexplained id', () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });
    render(<ErrorBoundary error={error} reset={vi.fn()} />);
    expect(document.body.textContent).toContain('Reference for support: abc123');
  });

  it('exposes a working retry affordance', () => {
    const reset = vi.fn();
    render(<ErrorBoundary error={new Error('boom')} reset={reset} />);
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe('app/global-error.tsx', () => {
  it('never renders the raw error text', () => {
    renderGlobalError(new Error(RAW));
    expect(document.documentElement.textContent).not.toContain('sk-live-secret');
    expect(document.documentElement.textContent).not.toContain('api.internal.example');
  });

  it('classifies the failure and names a next step', () => {
    renderGlobalError(new Error('fetch failed'));
    expect(document.documentElement.textContent).toContain('Connection Issue');
    expect(document.documentElement.textContent).toContain('internet connection');
  });
});
