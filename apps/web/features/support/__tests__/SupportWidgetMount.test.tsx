import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportWidgetMount } from '../components/SupportWidgetMount';
import { isSupportWidgetVisible } from '../lib/route-visibility';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (headers: HeadersInit = {}) => Promise.resolve(headers),
  getCsrfToken: () => Promise.resolve('test-csrf'),
}));

const mockPathname = vi.fn(() => '/help');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function installSignedOutFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/support/account/context')) {
        return Promise.resolve(jsonResponse({ error: 'unauthorized' }, 401));
      }
      if (url.includes('/api/support/handoff/availability')) {
        return Promise.resolve(jsonResponse({}, 404));
      }
      if (url.includes('/api/support/ask')) {
        return Promise.resolve(
          jsonResponse({
            kind: 'answer',
            text: 'You can bring your own provider key in Settings.',
            citations: [{ id: 'byok', title: 'Bring your own key', url: '/byok' }],
          }),
        );
      }
      return Promise.resolve(jsonResponse({}, 404));
    }),
  );
}

describe('SupportWidgetMount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname.mockReturnValue('/help');
    process.env['NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED'] = '1';
    installSignedOutFetch();
  });

  afterEach(() => {
    delete process.env['NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED'];
    vi.unstubAllGlobals();
  });

  it('renders nothing at all when the kill switch is set', () => {
    process.env['NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED'] = '0';
    const { container } = render(<SupportWidgetMount />);
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes a labelled launcher with dialog semantics', () => {
    render(<SupportWidgetMount />);
    const launcher = screen.getByRole('button', { name: /open product support/i });
    expect(launcher).toHaveAttribute('aria-haspopup', 'dialog');
    expect(launcher).toHaveAttribute('aria-expanded', 'false');
    expect(launcher.getAttribute('aria-controls')).toBeTruthy();
  });

  it('opens a dialog whose id matches aria-controls, and Escape returns focus to the launcher', async () => {
    const user = userEvent.setup();
    render(<SupportWidgetMount />);

    const launcher = screen.getByRole('button', { name: /open product support/i });
    const panelId = launcher.getAttribute('aria-controls');
    await user.click(launcher);

    const dialog = await screen.findByRole('dialog', { name: /product support/i });
    expect(dialog).toHaveAttribute('id', panelId);

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /open product support/i }),
    );
  });

  it('works signed-out: answers with citations, shows no account facts and no action controls', async () => {
    const user = userEvent.setup();
    render(<SupportWidgetMount />);
    await user.click(screen.getByRole('button', { name: /open product support/i }));
    await screen.findByRole('dialog');

    await user.type(screen.getByLabelText(/ask a support question/i), 'how do I use my own key');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(
      await screen.findByText('You can bring your own provider key in Settings.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bring your own key' })).toHaveAttribute(
      'href',
      '/byok',
    );

    expect(screen.queryByText(/what I can see about your account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/I can do this for you/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('carries the public page palette on the help and support pages', () => {
    for (const route of ['/help', '/support']) {
      mockPathname.mockReturnValue(route);
      const { container, unmount } = render(<SupportWidgetMount />);
      const root = container.querySelector('[data-support-widget]');
      expect(root).toHaveAttribute('data-surface', 'marketing');
      expect(root).toHaveAttribute('data-design', 'agi');
      expect(root).toHaveClass('agi-modal-scope');
      unmount();
    }
  });

  it.each([
    ['/chat'],
    ['/chat/abc'],
    ['/settings/billing'],
    ['/pricing'],
    ['/'],
    ['/login'],
    ['/status'],
    ['/connect/vscode'],
  ])('renders nothing on %s', (route) => {
    mockPathname.mockReturnValue(route);
    const { container } = render(<SupportWidgetMount />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('route visibility rules', () => {
  it('shows only inside the help and support sections', () => {
    expect(isSupportWidgetVisible('/help')).toBe(true);
    expect(isSupportWidgetVisible('/help/getting-started')).toBe(true);
    expect(isSupportWidgetVisible('/support')).toBe(true);
    expect(isSupportWidgetVisible('/')).toBe(false);
    expect(isSupportWidgetVisible('/docs')).toBe(false);
    expect(isSupportWidgetVisible('/pricing')).toBe(false);
    expect(isSupportWidgetVisible(null)).toBe(false);
  });

  it('stays off the signed-in product and every decision-shaped route', () => {
    expect(isSupportWidgetVisible('/chat/abc')).toBe(false);
    expect(isSupportWidgetVisible('/settings/billing')).toBe(false);
    expect(isSupportWidgetVisible('/connect/vscode')).toBe(false);
    expect(isSupportWidgetVisible('/sign-in')).toBe(false);
    expect(isSupportWidgetVisible('/status')).toBe(false);
  });

  it('does not treat a prefix collision as a match', () => {
    expect(isSupportWidgetVisible('/helpful')).toBe(false);
    expect(isSupportWidgetVisible('/supporting')).toBe(false);
  });
});
