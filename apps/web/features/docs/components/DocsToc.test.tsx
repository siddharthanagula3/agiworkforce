import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
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
      return new Proxy(style, {
        get(target, property) {
          if (property === 'scrollMarginTop') return `${margin}px`;
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
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
    const navigation = screen.getByRole('navigation', { name: 'On this page' });
    expect(navigation).toBeInTheDocument();
    const label = navigation.querySelector('.dx-toc-label');
    expect(label).toHaveTextContent('On this page');
    expect(label?.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
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

  describe('initial document fragments', () => {
    let resolveFonts: () => void;
    let fontsDescriptor: PropertyDescriptor | undefined;
    let entriesDescriptor: PropertyDescriptor | undefined;
    const entries = vi.fn();
    const scroll = vi.fn(function (this: HTMLElement) {
      const delta = (tops.get(this.id) ?? 0) - margin;
      for (const [id, top] of tops) tops.set(id, top - delta);
      vi.stubGlobal('scrollY', delta);
      fireEvent.scroll(window);
    });

    beforeEach(() => {
      window.history.replaceState(null, '', '/help/local-mode#beta');
      fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
      entriesDescriptor = Object.getOwnPropertyDescriptor(performance, 'getEntriesByType');
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: {
          ready: new Promise<void>((resolve) => {
            resolveFonts = resolve;
          }),
        },
      });
      entries.mockImplementation((type: string) =>
        type === 'navigation' ? [{ type: 'navigate' }] : [],
      );
      Object.defineProperty(performance, 'getEntriesByType', {
        configurable: true,
        value: entries,
      });
      vi.stubGlobal('scrollX', 0);
      vi.stubGlobal('scrollY', 0);
      scroll.mockClear();
      vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(scroll);
    });

    afterEach(() => {
      cleanup();
      if (fontsDescriptor) Object.defineProperty(document, 'fonts', fontsDescriptor);
      else Reflect.deleteProperty(document, 'fonts');
      if (entriesDescriptor)
        Object.defineProperty(performance, 'getEntriesByType', entriesDescriptor);
      else Reflect.deleteProperty(performance, 'getEntriesByType');
      window.history.replaceState(null, '', '/');
    });

    function hydrate(strict = false) {
      const container = document.createElement('div');
      document.body.append(container);
      const element = strict ? (
        <StrictMode>
          <DocsToc items={items} />
        </StrictMode>
      ) : (
        <DocsToc items={items} />
      );
      container.innerHTML = renderToString(element);
      return render(element, { container, hydrate: true });
    }

    async function finishFonts() {
      await act(async () => resolveFonts());
      flushFrames();
      flushFrames();
    }

    it('completes a missed initial-document fragment after hydrated fonts settle', async () => {
      hydrate();
      flushFrames();
      expect(scroll).not.toHaveBeenCalled();
      await finishFonts();
      expect(scroll).toHaveBeenCalledOnce();
      expect(scroll.mock.contexts[0]).toBe(heading('beta'));
      expectActive('Beta section');
    });

    it('makes one attempt and does not repeat it after geometry or props change', async () => {
      const view = hydrate();
      await finishFonts();
      expect(scroll).toHaveBeenCalledOnce();
      vi.stubGlobal('scrollY', 0);
      tops.set('beta', 500);
      resizeObserver().deliver();
      view.rerender(<DocsToc items={[...items]} />);
      flushFrames();
      expect(scroll).toHaveBeenCalledOnce();
    });

    it('makes one attempt across StrictMode hydration effect replay', async () => {
      hydrate(true);
      await finishFonts();
      expect(scroll.mock.contexts).toEqual([heading('beta')]);
    });

    it('leaves a successful native fragment position intact', async () => {
      tops.set('alpha', -212);
      tops.set('beta', margin);
      vi.stubGlobal('scrollY', 412);
      hydrate();
      await finishFonts();
      expect(scroll).not.toHaveBeenCalled();
      expect(window.scrollY).toBe(412);
      expectActive('Beta section');
    });

    it('leaves an already aligned heading alone even at the document start', async () => {
      tops.set('alpha', -212);
      tops.set('beta', margin);
      hydrate();
      await finishFonts();
      expect(scroll).not.toHaveBeenCalled();
    });

    it.each(['reload', 'back_forward', 'missing'])(
      'preserves %s navigation restoration',
      async (type) => {
        entries.mockReturnValue(type === 'missing' ? [] : [{ type }]);
        hydrate();
        await finishFonts();
        expect(scroll).not.toHaveBeenCalled();
      },
    );

    it('leaves client-side navigation to its existing router owner', async () => {
      render(<DocsToc items={items} />);
      await finishFonts();
      expect(scroll).not.toHaveBeenCalled();
    });

    it.each(['', '#unknown', '#%'])('does not invent a target for fragment %s', async (hash) => {
      window.history.replaceState(null, '', `/help/local-mode${hash}`);
      hydrate();
      await finishFonts();
      expect(scroll).not.toHaveBeenCalled();
    });

    it('decodes a known fragment without changing the address or native destination', async () => {
      window.history.replaceState(null, '', '/help/local-mode#b%65ta');
      hydrate();
      await finishFonts();
      expect(scroll.mock.contexts).toEqual([heading('beta')]);
      expect(window.location.hash).toBe('#b%65ta');
      expect(screen.getByRole('link', { name: 'Beta section' })).toHaveAttribute('href', '#beta');
    });

    it.each(['wheel', 'touchstart', 'pointerdown', 'keydown', 'scroll', 'hashchange', 'popstate'])(
      'cancels a pending initial fragment after %s',
      async (event) => {
        hydrate();
        fireEvent(window, new Event(event));
        await finishFonts();
        expect(scroll).not.toHaveBeenCalled();
      },
    );

    it('preserves a changed URL even when replaceState emits no hashchange', async () => {
      hydrate();
      window.history.replaceState(null, '', '/help/local-mode#gamma');
      await finishFonts();
      expect(scroll).not.toHaveBeenCalled();
    });

    it('cancels user input after fonts resolve but before the scheduled frame', async () => {
      hydrate();
      await act(async () => resolveFonts());
      fireEvent.keyDown(window, { key: 'Home' });
      flushFrames();
      expect(scroll).not.toHaveBeenCalled();
    });

    it('preserves a position reached while fonts were pending', async () => {
      hydrate();
      vi.stubGlobal('scrollY', 50);
      await finishFonts();
      expect(scroll).not.toHaveBeenCalled();
      expect(window.scrollY).toBe(50);
    });

    it('preserves a focused control while fonts were pending', async () => {
      hydrate();
      screen.getByRole('button', { name: /^On this page\b/ }).focus();
      await finishFonts();
      expect(scroll).not.toHaveBeenCalled();
    });

    it('does not scroll a hidden or replaced target later', async () => {
      const view = hydrate();
      heading('beta').hidden = true;
      await finishFonts();
      expect(scroll).not.toHaveBeenCalled();
      heading('beta').hidden = false;
      resizeObserver().deliver();
      view.rerender(<DocsToc items={[...items]} />);
      flushFrames();
      expect(scroll).not.toHaveBeenCalled();
    });

    it('does not retain a target that was replaced before fonts settled', async () => {
      hydrate();
      const replacement = document.createElement('h2');
      replacement.id = 'beta';
      heading('beta').replaceWith(replacement);
      await finishFonts();
      expect(scroll).not.toHaveBeenCalled();
    });

    it.each(['before fonts', 'before frame'])(
      'cleans up a pending attempt %s on unmount',
      async (phase) => {
        const remove = vi.spyOn(window, 'removeEventListener');
        const { unmount } = hydrate();
        if (phase === 'before frame') await act(async () => resolveFonts());
        unmount();
        await finishFonts();
        expect(scroll).not.toHaveBeenCalled();
        expect(frames.size).toBe(0);
        for (const event of [
          'wheel',
          'touchstart',
          'pointerdown',
          'keydown',
          'scroll',
          'hashchange',
          'popstate',
        ]) {
          expect(remove).toHaveBeenCalledWith(event, expect.any(Function), true);
        }
      },
    );
  });
});
