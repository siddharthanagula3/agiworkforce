import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportWidgetMount } from '../components/SupportWidgetMount';
import {
  SUPPORT_WIDGET_BLOCKLIST,
  isSupportWidgetVisible,
  resolveSupportSurface,
} from '../lib/route-visibility';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (headers: HeadersInit = {}) => Promise.resolve(headers),
  getCsrfToken: () => Promise.resolve('test-csrf'),
}));

const mockPathname = vi.fn(() => '/');
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

/** Signed-out world: account context 401, no handoff routes, no answer route. */
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
    mockPathname.mockReturnValue('/');
    process.env['NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED'] = '1';
    installSignedOutFetch();
  });

  afterEach(() => {
    delete process.env['NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED'];
    vi.unstubAllGlobals();
  });

  it('renders nothing at all when the ship gate is off', () => {
    delete process.env['NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED'];
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

    // A 401 account context is a supported mode, not an error.
    expect(screen.queryByText(/what I can see about your account/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/I can do this for you/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('marks the marketing surface so its palette resolves, and the app surface separately', () => {
    const { container, unmount } = render(<SupportWidgetMount />);
    const marketingRoot = container.querySelector('[data-support-widget]');
    expect(marketingRoot).toHaveAttribute('data-surface', 'marketing');
    expect(marketingRoot).toHaveAttribute('data-design', 'agi');
    unmount();

    mockPathname.mockReturnValue('/settings/billing');
    const { container: appContainer } = render(<SupportWidgetMount />);
    const appRoot = appContainer.querySelector('[data-support-widget]');
    expect(appRoot).toHaveAttribute('data-surface', 'app');
    expect(appRoot).not.toHaveAttribute('data-design');
  });

  it('pairs data-design="agi" with the agi-modal-scope opt-out', () => {
    // vitest runs with `css: false`, so this cannot assert computed layout. It
    // asserts the INVARIANT instead, which is what actually regressed:
    // app/globals.css targets `[data-design='agi']:not(.agi-chrome-band):not(.agi-modal-scope)`
    // with `min-height: 100vh` (:1872) and `overflow-x: clip` (:7579). Those are
    // page-level rules. A fixed launcher that opts into the agi palette without
    // opting out of them becomes a full-viewport-height invisible box that eats
    // clicks down the right edge of every marketing page and displaces the
    // button to the top of the screen. The two must travel together.
    const { container } = render(<SupportWidgetMount />);
    const root = container.querySelector('[data-support-widget]');
    expect(root).toHaveAttribute('data-design', 'agi');
    expect(root).toHaveClass('agi-modal-scope');
  });

  it('does not apply the marketing opt-out class on the product surface', () => {
    // No `data-design="agi"`, so the globals.css page rules never match and the
    // marker would be meaningless noise.
    mockPathname.mockReturnValue('/settings/billing');
    const { container } = render(<SupportWidgetMount />);
    const root = container.querySelector('[data-support-widget]');
    expect(root).not.toHaveAttribute('data-design');
    expect(root).not.toHaveClass('agi-modal-scope');
  });

  it.each(SUPPORT_WIDGET_BLOCKLIST.map((route) => [route]))('renders nothing on %s', (route) => {
    mockPathname.mockReturnValue(route);
    const { container } = render(<SupportWidgetMount />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on a nested blocklisted route', () => {
    mockPathname.mockReturnValue('/connect/vscode');
    const { container } = render(<SupportWidgetMount />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('route visibility rules', () => {
  it('hides on decision-shaped routes and shows on ordinary marketing routes', () => {
    expect(isSupportWidgetVisible('/connect/vscode')).toBe(false);
    expect(isSupportWidgetVisible('/sign-in')).toBe(false);
    expect(isSupportWidgetVisible('/status')).toBe(false);
    expect(isSupportWidgetVisible('/')).toBe(true);
    expect(isSupportWidgetVisible('/docs')).toBe(true);
    expect(isSupportWidgetVisible(null)).toBe(false);
  });

  it('does not treat a prefix collision as a match', () => {
    // `/sharedspace` is not `/shared`.
    expect(isSupportWidgetVisible('/sharedspace')).toBe(true);
    expect(isSupportWidgetVisible('/statuses')).toBe(true);
  });

  it('resolves the product surface for signed-in routes only', () => {
    expect(resolveSupportSurface('/chat/abc')).toBe('app');
    expect(resolveSupportSurface('/settings')).toBe('app');
    expect(resolveSupportSurface('/pricing')).toBe('marketing');
    expect(resolveSupportSurface('/')).toBe('marketing');
  });
});
