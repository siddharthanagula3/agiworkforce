import type { ComponentProps } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { documentationIndex } from '@/app/docs/doc-index';
import { getSupportCorpus } from '@/lib/support/agent/corpus';
import { retrieveSupportChunks } from '@/lib/support/agent/retrieval/retrieve';
import { helpResultPath } from '@/lib/support/help-articles';
import type { HelpSearchResult } from '@/app/api/help/search/route';
import { docsSearchLinks, type DocsNavGroup } from '../lib/docs-nav';
import { DocsNavigation } from './DocsNavigation';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('next/navigation', () => ({ usePathname: () => '/docs' }));
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...props }: ComponentProps<'a'>) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </a>
  ),
}));

const groups: readonly DocsNavGroup[] = [
  {
    id: 'overview',
    label: 'Documentation',
    links: [
      { href: '/docs', title: 'Overview' },
      { href: '/help/search', title: 'Web search' },
    ],
  },
];

function response(results: HelpSearchResult[], status = 200): Response {
  return new Response(JSON.stringify({ results }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const results: HelpSearchResult[] = [
  {
    docId: 'search',
    title: 'Web search, How it works',
    url: 'http://localhost/help/search#how-it-works',
    path: '/help/search#how-it-works',
    category: 'search',
    snippet: 'Web search is ambient when a search path is available.',
  },
  {
    docId: 'privacy',
    title: 'Privacy controls',
    url: 'http://localhost/help/privacy',
    path: '/help/privacy',
    category: 'privacy',
    snippet: 'Review privacy controls.',
  },
];

const geometryObservers: NavigationResizeObserver[] = [];

class NavigationResizeObserver implements ResizeObserver {
  readonly observe = vi.fn<ResizeObserver['observe']>();
  readonly unobserve = vi.fn<ResizeObserver['unobserve']>();
  readonly disconnect = vi.fn<ResizeObserver['disconnect']>();

  constructor(private readonly callback: ResizeObserverCallback) {
    geometryObservers.push(this);
  }

  emit() {
    this.callback([], this);
  }
}

describe('documentation search navigation', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let phone: boolean;

  beforeEach(() => {
    fetchMock.mockReset();
    navigate.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    geometryObservers.length = 0;
    vi.stubGlobal('ResizeObserver', NavigationResizeObserver);
    phone = false;
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (
      this: HTMLElement,
    ) {
      const hidden =
        (this.matches('.dx-menu') && !phone) || (this.closest('.dx-side-static') !== null && phone);
      const rects = hidden ? [] : [new DOMRect(0, 0, 200, 44)];
      return {
        ...rects,
        length: rects.length,
        item: (index: number) => rects[index] ?? null,
        [Symbol.iterator]: rects[Symbol.iterator].bind(rects),
      };
    });
    const readStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = readStyle(element, pseudo);
      if (element.matches('.dx-menu')) style.display = phone ? 'flex' : 'none';
      return style;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', '⌘K'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Ctrl K'],
  ])('shows the search shortcut for %s without changing the control name', (agent, hint) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(agent);
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    const opener = screen.getAllByRole('button', { name: 'Search documentation' }).at(-1);
    if (!opener) throw new Error('Desktop documentation search is missing');
    expect(opener).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K');
    const shortcut = opener.querySelector('kbd');
    expect(shortcut).toHaveTextContent(hint);
    expect(shortcut).toHaveAttribute('aria-hidden', 'true');
  });

  it('labels the phone trigger with text and hides its icon from assistive technology', () => {
    phone = true;
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    const trigger = screen.getByRole('button', { name: 'Browse documentation' });
    expect(trigger.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(['ctrlKey', 'metaKey'] as const)(
    'opens one dialog with %s+K and restores the original focus after repeated shortcuts',
    async (modifier) => {
      render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
      const overview = screen.getAllByRole('link', { name: 'Overview' }).at(-1);
      if (!overview) throw new Error('Desktop documentation link is missing');
      expect(overview).toHaveAttribute('aria-current', 'page');
      overview.focus();
      fireEvent.keyDown(document, { key: 'k', [modifier]: true });
      expect(screen.getAllByRole('dialog', { name: 'Search documentation' })).toHaveLength(1);
      const input = screen.getByRole('searchbox', { name: 'Search the help centre' });
      expect(input).toHaveFocus();
      fireEvent.keyDown(input, { key: 'K', [modifier]: true });
      expect(input).toHaveFocus();
      const user = userEvent.setup();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(overview).toHaveFocus();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('searches article bodies once, passes through canonical paths, and navigates results by keyboard', async () => {
    fetchMock.mockResolvedValue(response(results));
    const user = userEvent.setup();
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    const opener = screen.getAllByRole('button', { name: 'Search documentation' }).at(-1);
    if (!opener) throw new Error('Desktop documentation search is missing');
    await user.click(opener);
    const input = screen.getByRole('searchbox');
    await user.type(input, 'ambient');
    const first = await screen.findByRole('link', { name: results[0]?.title });
    const last = screen.getByRole('link', { name: 'Privacy controls' });
    expect(first).toHaveAttribute('href', '/help/search#how-it-works');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/help/search?q=ambient', expect.any(Object));
    expect(within(screen.getByRole('dialog')).getByRole('status')).toHaveTextContent(
      '2 pages match.',
    );
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Close documentation search' })).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(last).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(last).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(first).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(input).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('/help/search#how-it-works');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('returns focus to the phone navigation trigger when search is closed', async () => {
    phone = true;
    const user = userEvent.setup();
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    const trigger = screen.getByRole('button', { name: 'Browse documentation' });
    await user.click(trigger);
    const drawer = screen.getByRole('dialog', { name: 'Documentation' });
    expect(drawer.parentElement).toBe(document.body);
    expect(drawer.previousElementSibling).toHaveAttribute('data-state', 'open');
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    const opener = within(drawer).getByRole('button', { name: 'Search documentation' });
    await user.click(opener);
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
    expect(screen.queryByRole('dialog', { name: 'Documentation' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Close documentation search' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it.each([1, 2])(
    'traps drawer focus, preserves canonical links and restores Escape focus, run %s',
    async () => {
      phone = true;
      const user = userEvent.setup();
      render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
      const trigger = screen.getByRole('button', { name: 'Browse documentation' });
      await user.click(trigger);
      const drawer = screen.getByRole('dialog', { name: 'Documentation' });
      const nav = within(drawer).getByRole('navigation', { name: 'Documentation pages' });
      expect(
        within(nav)
          .getAllByRole('link')
          .map((link) => ({ href: link.getAttribute('href'), title: link.textContent })),
      ).toEqual(
        groups
          .flatMap((group) => group.links)
          .map((link) => ({ href: link.href, title: link.title })),
      );
      expect(within(drawer).getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const first = within(drawer).getByRole('button', { name: 'Search documentation' });
      expect(first).toHaveFocus();
      await user.tab({ shift: true });
      expect(within(drawer).getByRole('button', { name: 'Close' })).toHaveFocus();
      await user.tab();
      expect(first).toHaveFocus();
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(trigger).toHaveFocus();
    },
  );

  it('closes the drawer on normal guide navigation while preserving the real destination', async () => {
    phone = true;
    const user = userEvent.setup();
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    await user.click(screen.getByRole('button', { name: 'Browse documentation' }));
    const link = within(screen.getByRole('dialog', { name: 'Documentation' })).getByRole('link', {
      name: 'Web search',
    });
    expect(link).toHaveAttribute('href', '/help/search');
    await user.click(link);
    expect(navigate).toHaveBeenCalledWith('/help/search');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('leaves modified guide clicks in their native navigation context', async () => {
    phone = true;
    const user = userEvent.setup();
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    await user.click(screen.getByRole('button', { name: 'Browse documentation' }));
    const drawer = screen.getByRole('dialog', { name: 'Documentation' });
    fireEvent.click(within(drawer).getByRole('link', { name: 'Web search' }), { ctrlKey: true });
    expect(drawer).toBeInTheDocument();
  });

  it('hands the drawer shortcut to one search trap and restores its visible trigger', async () => {
    phone = true;
    const user = userEvent.setup();
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    const trigger = screen.getByRole('button', { name: 'Browse documentation' });
    await user.click(trigger);
    const search = within(screen.getByRole('dialog', { name: 'Documentation' })).getByRole(
      'button',
      { name: 'Search documentation' },
    );
    fireEvent.keyDown(search, { key: 'k', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('dialog', { name: 'Documentation' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('releases the drawer trap when its phone trigger becomes hidden at the desktop breakpoint', async () => {
    phone = true;
    const user = userEvent.setup();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    await user.click(screen.getByRole('button', { name: 'Browse documentation' }));
    expect(screen.getByRole('dialog', { name: 'Documentation' })).toBeInTheDocument();
    phone = false;
    fireEvent.resize(window);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Search documentation' })).toHaveFocus();
    unmount();
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('restores desktop search focus if the breakpoint changes during phone search', async () => {
    phone = true;
    const user = userEvent.setup();
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    await user.click(screen.getByRole('button', { name: 'Browse documentation' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Documentation' })).getByRole('button', {
        name: 'Search documentation',
      }),
    );
    await waitFor(() => expect(screen.getByRole('searchbox')).toHaveFocus());
    phone = false;
    fireEvent.resize(window);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Search documentation' })).toHaveFocus();
  });

  it('closes on observed trigger geometry changes and disconnects on unmount', async () => {
    phone = true;
    const user = userEvent.setup();
    const { unmount } = render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    const trigger = screen.getByRole('button', { name: 'Browse documentation' });
    await user.click(trigger);
    const observer = geometryObservers.find((candidate) =>
      candidate.observe.mock.calls.some(([element]) => element === trigger),
    );
    if (!observer) throw new Error('Phone trigger geometry is not observed');
    phone = false;
    act(() => observer.emit());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Search documentation' })).toHaveFocus();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
    phone = true;
    await user.click(trigger);
    const activeObserver = geometryObservers.at(-1);
    if (!activeObserver) throw new Error('Reopened drawer geometry observer is missing');
    unmount();
    expect(activeObserver.disconnect).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'no matching article', status: 200, message: /Nothing here covers that yet/u },
    { label: 'unavailable corpus', status: 503, message: /Search is not answering right now/u },
    { label: 'failed request', status: 500, message: /That search did not go through/u },
  ])('keeps $label distinct and announces it accessibly', async ({ status, message }) => {
    fetchMock.mockResolvedValue(response([], status));
    const user = userEvent.setup();
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    await user.type(screen.getByRole('searchbox'), 'zznomatch');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(message));
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    if (status === 503) {
      const browse = within(screen.getByRole('navigation', { name: 'Browse documentation' }));
      const links = browse.getAllByRole('link');
      expect(
        links.map((link) => ({ title: link.textContent, href: link.getAttribute('href') })),
      ).toEqual(docsSearchLinks().map((link) => ({ title: link.title, href: link.href })));
      expect(links.length).toBeGreaterThan(0);
    }
    const input = screen.getByRole('searchbox');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(input).toHaveFocus();
    expect(navigate).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('aborts a pending search on close and removes the shortcut handler on unmount', async () => {
    let resolveResponse: ((value: Response) => void) | undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const user = userEvent.setup();
    const { unmount } = render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    await user.type(screen.getByRole('searchbox'), 'ambient');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent('Searching');
    const signal = fetchMock.mock.calls[0]?.[1]?.signal;
    expect(signal?.aborted).toBe(false);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(signal?.aborted).toBe(true));
    await act(async () => {
      resolveResponse?.(response(results));
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores composing, repeated, modified, and already-claimed shortcuts', () => {
    render(<DocsNavigation groups={groups} searchLinks={docsSearchLinks()} />);
    for (const extra of [
      { isComposing: true },
      { repeat: true },
      { altKey: true },
      { shiftKey: true },
    ]) {
      fireEvent.keyDown(document, { key: 'k', ctrlKey: true, ...extra });
    }
    const claimed = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true });
    claimed.preventDefault();
    document.dispatchEvent(claimed);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('canonical documentation search coverage', () => {
  it('includes every published article and retrieves text absent from page titles', () => {
    const corpus = getSupportCorpus();
    if (!corpus.available) throw new Error(corpus.reason);
    const articles = corpus.chunks.filter((chunk) => chunk.origin === 'markdown');
    const indexed = documentationIndex().groups.flatMap((group) => group.entries);
    expect(new Set(articles.map((chunk) => chunk.docId))).toEqual(
      new Set(indexed.map((entry) => entry.docId)),
    );
    expect(indexed.length).toBeGreaterThan(0);
    expect(indexed.every((entry) => !entry.title.toLowerCase().includes('ambient'))).toBe(true);
    const matches = retrieveSupportChunks('ambient').chunks;
    const articleMatch = matches.find(
      (hit) => hit.chunk.docId === 'search' && hit.chunk.origin === 'markdown',
    );
    expect(articleMatch).toBeDefined();
    if (!articleMatch) throw new Error('Body-only query did not find the canonical search article');
    expect(articleMatch.chunk.text.toLowerCase()).toContain('ambient');
    expect(helpResultPath(articleMatch.chunk)).toBe('/help/search');
  });
});

describe('documentation print controls', () => {
  it.each([1, 2])('keeps printed content flowing and hides navigation controls, run %s', () => {
    const css = postcss.parse(readFileSync(join(process.cwd(), 'features/docs/docs.css'), 'utf8'));
    const printRules = new Map<string, Map<string, string>>();
    css.walkAtRules('media', (media) => {
      if (media.params !== 'print') return;
      media.walkRules((rule) => {
        const declarations = new Map<string, string>();
        rule.walkDecls((declaration) => {
          declarations.set(
            declaration.prop,
            `${declaration.value}${declaration.important ? ' !important' : ''}`,
          );
        });
        for (const selector of rule.selectors) printRules.set(selector, declarations);
      });
    });
    const declarations = (selector: string) => {
      const rule = printRules.get(selector);
      expect(rule, `Scoped print rule for ${selector}`).toBeDefined();
      if (!rule) throw new Error(`Scoped print rule missing: ${selector}`);
      return rule;
    };
    for (const selector of [
      '.dx > header',
      '.dx > footer',
      '.dx-side',
      '.dx-toc',
      '.dx-actions',
      '.dx-pager',
      '.dx-code-bar .dx-action',
    ]) {
      expect(declarations(selector).get('display')).toBe('none !important');
    }
    expect(declarations('.dx .dx-shell').get('display')).toBe('block');
    expect(declarations('.dx .dx-main').get('overflow')).toBe('visible !important');
    expect(declarations('.dx .dx-code-block pre').get('white-space')).toBe('pre-wrap');
    expect(declarations('.dx .dx-code-block pre').get('overflow')).toBe('visible !important');
    expect(declarations('.dx .dx-table').get('overflow')).toBe('visible !important');
    expect(declarations('.dx .dx-prose table').get('table-layout')).toBe('fixed');
    expect(declarations('.dx .dx-prose thead').get('display')).toBe('table-header-group');
    expect(declarations("body:has([data-design='agi'].dx) > [role='dialog']").get('display')).toBe(
      'none !important',
    );
  });

  it('resolves drawer and print variable references through existing token owners', () => {
    const css = postcss.parse(readFileSync(join(process.cwd(), 'features/docs/docs.css'), 'utf8'));
    const owners = [
      readFileSync(require.resolve('@agiworkforce/design-tokens/foundation.css'), 'utf8'),
      readFileSync(require.resolve('@agiworkforce/design-tokens/chat.css'), 'utf8'),
      readFileSync(require.resolve('@agiworkforce/design-tokens/tailwind.css'), 'utf8'),
      readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8'),
      css.toString(),
    ];
    const declared = new Set<string>();
    for (const owner of owners) {
      postcss.parse(owner).walkDecls((declaration) => {
        if (declaration.prop.startsWith('--')) declared.add(declaration.prop);
      });
    }
    const missing: string[] = [];
    css.walkRules((rule) => {
      const print = rule.parent?.type === 'atrule' && rule.parent.params === 'print';
      if (!print && !rule.selector.includes('dx-nav-drawer') && rule.selector !== '.dx-menu')
        return;
      rule.walkDecls((declaration) => {
        for (const match of declaration.value.matchAll(/var\((--[\w-]+)/gu)) {
          const name = match[1];
          if (!name) throw new Error('CSS variable reference cannot be read');
          if (!declared.has(name)) missing.push(`${rule.selector}: ${name}`);
        }
      });
    });
    expect(missing).toEqual([]);
  });
});
