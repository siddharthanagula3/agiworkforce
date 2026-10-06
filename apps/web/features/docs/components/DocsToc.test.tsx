import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocsToc, type DocsTocItem } from './DocsToc';

const items: readonly DocsTocItem[] = [
  { id: 'alpha', title: 'Alpha section' },
  { id: 'beta', title: 'Beta section' },
  { id: 'gamma', title: 'Gamma section' },
];

const intersections: ControlledIntersectionObserver[] = [];
const resizes: ControlledResizeObserver[] = [];

class ControlledIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null;
  readonly rootMargin: string;
  readonly thresholds = [0];
  readonly observe = vi.fn<(target: Element) => void>();
  readonly unobserve = vi.fn<(target: Element) => void>();
  readonly disconnect = vi.fn<() => void>();
  readonly takeRecords = vi.fn<() => IntersectionObserverEntry[]>(() => []);

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.root = options.root ?? null;
    this.rootMargin = options.rootMargin ?? '0px';
    intersections.push(this);
  }

  deliver(changes: readonly { target: HTMLElement; isIntersecting: boolean }[]) {
    const entries = changes.map(({ target, isIntersecting }): IntersectionObserverEntry => {
      const rect = target.getBoundingClientRect();
      return {
        target,
        isIntersecting,
        boundingClientRect: rect,
        intersectionRect: rect,
        rootBounds: null,
        intersectionRatio: isIntersecting ? 1 : 0,
        time: 0,
      };
    });
    act(() => this.callback(entries, this));
  }
}

class ControlledResizeObserver implements ResizeObserver {
  readonly observe = vi.fn<(target: Element) => void>();
  readonly unobserve = vi.fn<(target: Element) => void>();
  readonly disconnect = vi.fn<() => void>();

  constructor(private readonly callback: ResizeObserverCallback) {
    resizes.push(this);
  }

  deliver() {
    act(() => this.callback([], this));
  }
}

describe('documentation contents follows reading geometry', () => {
  const frames = new Map<number, FrameRequestCallback>();
  const tops = new Map<string, number>();
  let article: HTMLElement;
  let margin: number;
  let nextFrame: number;
  const requestFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  const cancelFrame = vi.fn((id: number) => frames.delete(id));

  function heading(id: string): HTMLElement {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing fixture heading ${id}`);
    return node;
  }

  function observer(): ControlledIntersectionObserver {
    const instance = intersections.at(-1);
    if (!instance) throw new Error('No contents observer was registered');
    return instance;
  }

  function resizeObserver(): ControlledResizeObserver {
    const instance = resizes.at(-1);
    if (!instance) throw new Error('No geometry observer was registered');
    return instance;
  }

  function flushFrames() {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(0);
    });
  }

  function expectActive(title: string | null) {
    const links = screen.getAllByRole('link');
    expect(links.filter((link) => link.getAttribute('aria-current') === 'true')).toEqual(
      title === null ? [] : [screen.getByRole('link', { name: title })],
    );
  }

  beforeEach(() => {
    intersections.length = 0;
    resizes.length = 0;
    frames.clear();
    tops.clear();
    nextFrame = 0;
    margin = 88;
    requestFrame.mockClear();
    cancelFrame.mockClear();
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);
    vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver);
    vi.stubGlobal('ResizeObserver', ControlledResizeObserver);
    const readStyle = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = readStyle(element, pseudo);
      style.scrollMarginTop = `${margin}px`;
      return style;
    });
    article = document.createElement('article');
    document.body.append(article);
    for (const [index, item] of items.entries()) {
      const node = document.createElement('h2');
      node.id = item.id;
      node.textContent = item.title;
      tops.set(item.id, 200 + index * 300);
      vi.spyOn(node, 'getBoundingClientRect').mockImplementation(
        () => new DOMRect(0, tops.get(item.id) ?? 0, 300, 40),
      );
      article.append(node);
    }
  });

  afterEach(() => {
    cleanup();
    article.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the existing native destinations and the first section before headings are reached', () => {
    render(<DocsToc items={items} />);
    flushFrames();
    expect(screen.getByRole('navigation', { name: 'On this page' })).toBeInTheDocument();
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
      items.map((item) => `#${item.id}`),
    );
    expectActive('Alpha section');
  });

  it('provides one compact contents disclosure with native section destinations', () => {
    render(<DocsToc items={items} />);
    flushFrames();
    const navigation = screen.getByRole('navigation', { name: 'On this page' });
    const trigger = screen.getByRole('button', { name: /^On this page\b/ });
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const listId = trigger.getAttribute('aria-controls');
    expect(listId).toBeTruthy();
    const list = document.getElementById(listId ?? '');
    expect(list).toBeInstanceOf(HTMLUListElement);
    expect(navigation.querySelectorAll('ul')).toHaveLength(1);
    expect(list?.querySelectorAll('a').length).toBe(items.length);
    expect(
      Array.from(list?.querySelectorAll('a') ?? [], (link) => link.getAttribute('href')),
    ).toEqual(items.map((item) => `#${item.id}`));
  });

  it('opens and closes the same contents list with the native button keyboard behavior', async () => {
    const user = userEvent.setup();
    render(<DocsToc items={items} />);
    flushFrames();
    const trigger = screen.getByRole('button', { name: /^On this page\b/ });
    const list = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    trigger.focus();
    await user.keyboard(' ');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(trigger.getAttribute('aria-controls') ?? '')).toBe(list);
    expect(screen.getAllByRole('navigation', { name: 'On this page' })).toHaveLength(1);
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(list?.querySelectorAll('a')).toHaveLength(items.length);
  });

  it('closes after selecting a section without cancelling its native fragment navigation', () => {
    render(<DocsToc items={items} />);
    flushFrames();
    const trigger = screen.getByRole('button', { name: /^On this page\b/ });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const destination = screen.getByRole('link', { name: 'Beta section' });
    expect(destination).toHaveAttribute('href', '#beta');
    expect(fireEvent.click(destination)).toBe(true);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(destination).toHaveAttribute('href', '#beta');
  });

  it('closes compact contents with Escape and restores focus to its disclosure', () => {
    render(<DocsToc items={items} />);
    flushFrames();
    const trigger = screen.getByRole('button', { name: /^On this page\b/ });
    fireEvent.click(trigger);
    const destination = screen.getByRole('link', { name: 'Gamma section' });
    destination.focus();
    expect(destination).toHaveFocus();
    fireEvent.keyDown(destination, { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('keeps tracking reading geometry while compact contents is collapsed', () => {
    render(<DocsToc items={items} />);
    flushFrames();
    const trigger = screen.getByRole('button', { name: /^On this page\b/ });
    const list = document.getElementById(trigger.getAttribute('aria-controls') ?? '');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    tops.set('alpha', -1000);
    tops.set('beta', -400);
    tops.set('gamma', margin);
    fireEvent.scroll(window);
    flushFrames();
    expect(Array.from(list?.querySelectorAll('[aria-current="true"]') ?? [])).toEqual([
      screen.getByRole('link', { name: 'Gamma section' }),
    ]);
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Gamma section' })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it.each([0.0625, 0.375])(
    'marks a native fragment target within its rounded CSS pixel, offset %s',
    (offset) => {
      margin = 89;
      tops.set('alpha', -1000);
      tops.set('beta', margin + offset);
      tops.set('gamma', margin + 200);
      render(<DocsToc items={items} />);
      flushFrames();
      expectActive('Beta section');
      tops.set('beta', margin + 1.01);
      fireEvent.scroll(window);
      flushFrames();
      expectActive('Alpha section');
    },
  );

  it('uses design tokens for every documentation font size', () => {
    const css = postcss.parse(readFileSync(join(process.cwd(), 'features/docs/docs.css'), 'utf8'));
    const rawSizes: string[] = [];
    css.walkDecls('font-size', (declaration) => {
      if (/^(?:var\(--[a-z0-9-]+\)|inherit)$/u.test(declaration.value)) return;
      const selector =
        declaration.parent instanceof postcss.Rule ? declaration.parent.selector : 'unknown';
      rawSizes.push(`${selector}: ${declaration.value}`);
    });
    expect(
      rawSizes,
      'Documentation type must use the owned scale rather than raw font sizes',
    ).toEqual([]);
  });

  it.each([1, 2])(
    'does not retain a departed heading when only its observer entry changes, run %s',
    () => {
      tops.set('alpha', margin + 5);
      tops.set('beta', margin + 55);
      render(<DocsToc items={items} />);
      observer().deliver([
        { target: heading('alpha'), isIntersecting: true },
        { target: heading('beta'), isIntersecting: true },
      ]);
      flushFrames();
      expectActive('Alpha section');
      tops.set('alpha', -300);
      tops.set('beta', margin - 8);
      observer().deliver([{ target: heading('alpha'), isIntersecting: false }]);
      flushFrames();
      expectActive('Beta section');
    },
  );

  it.each([1, 2])(
    'handles a jump past the observation band with no intersecting entry, run %s',
    () => {
      render(<DocsToc items={items} />);
      flushFrames();
      tops.set('alpha', -800);
      tops.set('beta', -40);
      observer().deliver([
        { target: heading('alpha'), isIntersecting: false },
        { target: heading('beta'), isIntersecting: false },
      ]);
      flushFrames();
      expectActive('Beta section');
    },
  );

  it('follows fast scrolling forward and backward even without an observer notification', () => {
    render(<DocsToc items={items} />);
    flushFrames();
    tops.set('alpha', -1000);
    tops.set('beta', -400);
    tops.set('gamma', margin);
    fireEvent.scroll(window);
    flushFrames();
    expectActive('Gamma section');
    tops.set('beta', 250);
    tops.set('gamma', 600);
    fireEvent.scroll(window);
    flushFrames();
    expectActive('Alpha section');
  });

  it('reads initial anchor geometry and hash navigation without replacing the native links', () => {
    tops.set('alpha', -600);
    tops.set('beta', margin);
    render(<DocsToc items={items} />);
    flushFrames();
    expectActive('Beta section');
    tops.set('beta', -300);
    tops.set('gamma', margin);
    fireEvent(window, new Event('hashchange'));
    flushFrames();
    expectActive('Gamma section');
    expect(screen.getByRole('link', { name: 'Gamma section' })).toHaveAttribute('href', '#gamma');
  });

  it('re-resolves the CSS anchor offset after viewport or token geometry changes', () => {
    margin = 72;
    tops.set('alpha', -300);
    tops.set('beta', 90);
    render(<DocsToc items={items} />);
    flushFrames();
    expectActive('Alpha section');
    margin = 112;
    fireEvent.resize(window);
    flushFrames();
    expectActive('Beta section');
    margin = 72;
    fireEvent.resize(window);
    flushFrames();
    expectActive('Alpha section');
  });

  it('tracks article reflow when content geometry changes without scrolling', () => {
    render(<DocsToc items={items} />);
    flushFrames();
    expect(resizeObserver().observe).toHaveBeenCalledWith(article);
    for (const item of items)
      expect(resizeObserver().observe).toHaveBeenCalledWith(heading(item.id));
    tops.set('alpha', -300);
    tops.set('beta', margin - 10);
    resizeObserver().deliver();
    flushFrames();
    expectActive('Beta section');
  });

  it('coalesces geometry notifications and removes listeners, frames and observers on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<DocsToc items={items} />);
    flushFrames();
    requestFrame.mockClear();
    const intersection = observer();
    const resize = resizeObserver();
    fireEvent.scroll(window);
    fireEvent.resize(window);
    resize.deliver();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(1);
    unmount();
    expect(intersection.disconnect).toHaveBeenCalledOnce();
    expect(resize.disconnect).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    for (const event of ['scroll', 'resize', 'hashchange']) {
      expect(remove).toHaveBeenCalledWith(event, expect.any(Function));
    }
    requestFrame.mockClear();
    fireEvent.scroll(window);
    fireEvent.resize(window);
    fireEvent(window, new Event('hashchange'));
    intersection.deliver([{ target: heading('beta'), isIntersecting: true }]);
    resize.deliver();
    expect(requestFrame).not.toHaveBeenCalled();
  });

  it('replaces the observed article headings when the contents items change', () => {
    const { rerender } = render(<DocsToc items={items} />);
    flushFrames();
    const previous = observer();
    const previousResize = resizeObserver();
    const replacement = items.slice(1);
    rerender(<DocsToc items={replacement} />);
    flushFrames();
    expect(previous.disconnect).toHaveBeenCalledOnce();
    expect(previousResize.disconnect).toHaveBeenCalledOnce();
    expect(screen.queryByRole('link', { name: 'Alpha section' })).not.toBeInTheDocument();
    expectActive('Beta section');
    expect(observer().observe.mock.calls.map(([node]) => node)).toEqual([
      heading('beta'),
      heading('gamma'),
    ]);
  });
});
