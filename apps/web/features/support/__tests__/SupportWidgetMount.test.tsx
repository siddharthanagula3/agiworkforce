import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import postcss from 'postcss';
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
    expect(launcher).not.toHaveAttribute('aria-controls');
  });

  it('opens a dialog whose id matches aria-controls, and Escape returns focus to the launcher', async () => {
    const user = userEvent.setup();
    render(<SupportWidgetMount />);

    const launcher = screen.getByRole('button', { name: /open product support/i });
    await user.click(launcher);

    const dialog = await screen.findByRole('dialog', { name: /product support/i });
    expect(dialog.id).not.toBe('');
    expect(launcher).toHaveAttribute('aria-controls', dialog.id);
    expect(document.getElementById(launcher.getAttribute('aria-controls')!)).toBe(dialog);

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /open product support/i }),
    );
    expect(launcher).not.toHaveAttribute('aria-controls');
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

describe('support launcher clearance', () => {
  const MINIMUM_TARGET_PX = 24;
  const MINIMUM_TOUCH_TARGET_PX = 44;
  // The half pixel against the viewport edge does not hit-test, so a launcher
  // docked there at exactly the floor measures under it in a browser.
  const EDGE_LOSS_PX = 0.5;
  const ICON_ONLY_BELOW = '(max-width: 80rem)';
  const DOCKED_BELOW = '(max-width: 72.25rem)';
  const DOCKED_ON_TOUCH = '(max-width: 72.25rem) and (pointer: coarse)';
  const SINGLE_COLUMN_ARTICLE = '(max-width: 56rem)';
  const SINGLE_COLUMN_ARTICLE_ON_TOUCH = '(max-width: 56rem) and (pointer: coarse)';
  const ARTICLE_GUTTER = '.dx-main:where(:has(#help-article-title))';

  const widgetCss = postcss.parse(
    readFileSync(join(__dirname, '..', 'components', 'SupportWidget.module.css'), 'utf8'),
  );
  const docsCss = postcss.parse(
    readFileSync(join(__dirname, '..', '..', 'docs', 'docs.css'), 'utf8'),
  );
  const spaceTokens = new Map<string, number>();
  postcss
    .parse(
      readFileSync(
        createRequire(__filename).resolve('@agiworkforce/design-tokens/foundation.css'),
        'utf8',
      ),
    )
    .walkDecls(/^--space-\d+$/u, (declaration) => {
      spaceTokens.set(declaration.prop, Number.parseFloat(declaration.value));
    });

  function declarations(css: postcss.Root, media: string | null, selector: string) {
    const found = new Map<string, string>();
    css.walkRules((rule) => {
      const parent = rule.parent;
      const ruleMedia =
        parent instanceof postcss.AtRule && parent.name === 'media' ? parent.params : null;
      if (ruleMedia !== media || !rule.selectors.includes(selector)) return;
      rule.walkDecls((declaration) => {
        found.set(declaration.prop, declaration.value);
      });
    });
    return found;
  }

  function pixels(value: string | undefined): number {
    if (value === undefined) throw new Error('The length is not declared');
    const resolved = value.replace(/var\((--space-\d+)\)/gu, (_match, name: string) => {
      const token = spaceTokens.get(name);
      if (token === undefined) throw new Error(`Unknown spacing token ${name}`);
      return `${token}px`;
    });
    const terms = resolved
      .replace(/^calc\((.*)\)$/u, '$1')
      .split('+')
      .map((term) => term.trim());
    if (!terms.every((term) => /^\d+(?:\.\d+)?px$/u.test(term))) {
      throw new Error(`Cannot resolve the length ${value}`);
    }
    return terms.reduce((sum, term) => sum + Number.parseFloat(term), 0);
  }

  it('lets the page show through and take clicks everywhere but the launcher and the panel', () => {
    const root = declarations(widgetCss, null, '.root[data-support-widget]');
    expect(root.get('background')).toBe('transparent');
    expect(root.get('pointer-events')).toBe('none');
    expect(declarations(widgetCss, null, '.launcher').get('pointer-events')).toBe('auto');
    expect(declarations(widgetCss, null, '.panel').get('pointer-events')).toBe('auto');
  });

  it('drops the label while the documentation is one column, so the pill cannot reach the article', () => {
    const label = declarations(widgetCss, ICON_ONLY_BELOW, '.launcherLabel');
    expect(label.get('position')).toBe('absolute');
    expect(label.get('clip')).toBe('rect(0, 0, 0, 0)');
    expect(declarations(widgetCss, ICON_ONLY_BELOW, '.launcher').get('padding')).toBe('0');
  });

  it('docks to the screen edge at no less than the minimum target width', () => {
    const docked = declarations(widgetCss, DOCKED_BELOW, '.launcher');
    expect(pixels(docked.get('min-width')) - EDGE_LOSS_PX).toBeGreaterThanOrEqual(
      MINIMUM_TARGET_PX,
    );
    expect(docked.get('margin-right')).toBe('calc(-1 * var(--support-edge))');
    expect(declarations(widgetCss, null, '.root').get('right')).toBe('var(--support-edge)');
    expect(
      pixels(declarations(widgetCss, null, '.launcher').get('min-height')),
    ).toBeGreaterThanOrEqual(MINIMUM_TARGET_PX);
  });

  it('docks as a full touch target on a coarse pointer', () => {
    const docked = declarations(widgetCss, DOCKED_ON_TOUCH, '.launcher');
    expect(pixels(docked.get('min-width')) - EDGE_LOSS_PX).toBeGreaterThanOrEqual(
      MINIMUM_TOUCH_TARGET_PX,
    );
    expect(
      pixels(declarations(widgetCss, null, '.launcher').get('min-height')),
    ).toBeGreaterThanOrEqual(MINIMUM_TOUCH_TARGET_PX);
  });

  it('draws the focus ring of the docked launcher inside it, clear of the screen edge', () => {
    const ring = declarations(widgetCss, null, '.launcher:focus-visible');
    const docked = declarations(widgetCss, DOCKED_BELOW, '.launcher:focus-visible');
    const width = Number.parseFloat(ring.get('outline') ?? '');
    const offset = Number.parseFloat(docked.get('outline-offset') ?? '');
    expect(width).toBeGreaterThan(0);
    expect(width + offset).toBeLessThanOrEqual(0);
  });

  it('keeps a gutter beside a help article wider than the docked launcher', () => {
    const docked = pixels(declarations(widgetCss, DOCKED_BELOW, '.launcher').get('min-width'));
    const gutter = pixels(
      declarations(docsCss, SINGLE_COLUMN_ARTICLE, ARTICLE_GUTTER).get('padding-inline-end'),
    );
    expect(gutter).toBeGreaterThan(docked);
  });

  it('keeps that gutter wider than the touch launcher at every width it docks', () => {
    const docked = pixels(declarations(widgetCss, DOCKED_ON_TOUCH, '.launcher').get('min-width'));
    const singleColumn = pixels(
      declarations(docsCss, SINGLE_COLUMN_ARTICLE_ON_TOUCH, ARTICLE_GUTTER).get(
        'padding-inline-end',
      ),
    );
    const shell = pixels(declarations(docsCss, null, '.dx-shell').get('padding-inline'));
    const besideTheRail = pixels(
      declarations(docsCss, DOCKED_ON_TOUCH, ARTICLE_GUTTER).get('padding-inline-end'),
    );
    expect(singleColumn).toBeGreaterThan(docked);
    expect(shell + besideTheRail).toBeGreaterThan(docked);
  });

  it('orders the article gutters so the narrowest touch layout is decided last', () => {
    const order: (string | null)[] = [];
    docsCss.walkRules((rule) => {
      if (!rule.selector.includes('#help-article-title')) return;
      const parent = rule.parent;
      order.push(
        parent instanceof postcss.AtRule && parent.name === 'media' ? parent.params : null,
      );
    });
    expect(order).toEqual([SINGLE_COLUMN_ARTICLE, DOCKED_ON_TOUCH, SINGLE_COLUMN_ARTICLE_ON_TOUCH]);
  });

  it('leaves a printed help article to the print reset, which a launcher gutter must not outrank', () => {
    expect(declarations(docsCss, 'print', '.dx .dx-main').get('padding')).toBe('0');
    const gutterSelectors: string[] = [];
    docsCss.walkRules((rule) => {
      if (rule.selector.includes('#help-article-title')) gutterSelectors.push(...rule.selectors);
    });
    expect(gutterSelectors.length).toBeGreaterThan(0);
    for (const selector of gutterSelectors) {
      expect(selector).toBe(ARTICLE_GUTTER);
      expect(selector.replace(/:where\(.*\)$/u, '')).toBe('.dx-main');
    }
  });
});
