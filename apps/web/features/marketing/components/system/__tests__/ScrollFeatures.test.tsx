import { act, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScrollFeatures, type ScrollFeature } from '../ScrollFeatures';

const FEATURES: readonly ScrollFeature[] = [
  {
    id: 'feature-one',
    title: 'First story',
    body: 'First body',
    href: '/features/one',
    linkLabel: 'Learn more about one',
    visual: <span>first visual</span>,
  },
  {
    id: 'feature-two',
    title: 'Second story',
    body: 'Second body',
    href: '/features/two',
    linkLabel: 'Learn more about two',
    visual: <span>second visual</span>,
  },
];

const KEYBOARD_FEATURES: readonly ScrollFeature[] = [
  {
    ...FEATURES[0]!,
    visual: (
      <div role="region" aria-label="First example" tabIndex={0}>
        First preview
      </div>
    ),
  },
  {
    ...FEATURES[1]!,
    visual: (
      <div role="region" aria-label="Second example" tabIndex={0}>
        Second preview
      </div>
    ),
  },
];

function renderKeyboardFeatures() {
  return render(
    <div data-design="agi">
      <ScrollFeatures features={KEYBOARD_FEATURES} label="Keyboard stories" />
    </div>,
  );
}

function stageVisuals(container: HTMLElement) {
  const stage = container.querySelector<HTMLElement>('.agi-ds-scrollfeatures-stage');
  if (!stage) throw new Error('Missing feature stage');
  const visuals = Array.from(stage.children);
  expect(visuals).toHaveLength(KEYBOARD_FEATURES.length);
  return { stage, visuals };
}

function installStageStyles() {
  const source = readFileSync(
    resolve(process.cwd(), 'features/marketing/components/system/system.css'),
    'utf8',
  );
  const selector = "[data-design='agi'] .agi-ds-scrollfeatures-stage .agi-ds-scrollfeature-visual";
  const selectors = [selector, `${selector}[data-active]`];
  const style = document.createElement('style');
  style.dataset['scrollFeaturesTest'] = 'true';
  style.textContent = selectors
    .map((entry) => {
      const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rule = source.match(new RegExp(`${escaped}\\s*\\{[^}]*\\}`));
      if (!rule) throw new Error(`Missing feature stage rule: ${entry}`);
      return rule[0];
    })
    .join('\n');
  document.head.append(style);
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.querySelectorAll('style[data-scroll-features-test]').forEach((style) => style.remove());
});

describe('ScrollFeatures', () => {
  it('renders exactly one detail link per story inside its article', () => {
    const { container } = render(<ScrollFeatures features={FEATURES} label="Stories" />);
    for (const feature of FEATURES) {
      const article = container.querySelector<HTMLElement>(`article#${feature.id}`)!;
      const links = within(article).getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', feature.href);
      expect(links[0]).toHaveTextContent(feature.linkLabel);
    }
    expect(screen.getAllByRole('link')).toHaveLength(FEATURES.length);
  });

  it('keeps the aria-hidden stage free of links', () => {
    const { container } = render(<ScrollFeatures features={FEATURES} label="Stories" />);
    const stage = container.querySelector('.agi-ds-scrollfeatures-stage')!;
    expect(stage.querySelectorAll('a')).toHaveLength(0);
  });

  it('exposes the active focusable region when no observer is available', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { container } = renderKeyboardFeatures();
    const { stage, visuals } = stageVisuals(container);
    const region = within(stage).getByRole('region', {
      name: 'First example',
    });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region.closest('[aria-hidden="true"], [inert]')).toBeNull();
    expect(visuals[0]).toHaveAttribute('data-active', 'true');
    region.focus();
    expect(document.activeElement).toBe(region);
  });

  it('uses the authored active stage rule to restore native pointer events', () => {
    installStageStyles();
    const { container } = renderKeyboardFeatures();
    const { visuals } = stageVisuals(container);
    expect(getComputedStyle(visuals[0]! as HTMLElement).pointerEvents).toBe('auto');
    expect(getComputedStyle(visuals[0]! as HTMLElement).opacity).toBe('1');
    expect(getComputedStyle(visuals[1]! as HTMLElement).pointerEvents).toBe('none');
  });

  it('keeps every inactive duplicate inert and hidden from the accessibility tree', () => {
    const { container } = renderKeyboardFeatures();
    const { stage, visuals } = stageVisuals(container);
    expect(stage).not.toHaveAttribute('aria-hidden');
    expect(visuals[0]).not.toHaveAttribute('inert');
    expect(visuals[0]).not.toHaveAttribute('aria-hidden');
    expect(visuals[1]).toHaveAttribute('inert');
    expect(visuals[1]).toHaveAttribute('aria-hidden', 'true');
    expect(within(stage).queryByRole('region', { name: 'Second example' })).toBeNull();
    expect(
      within(visuals[1]! as HTMLElement).getByRole('region', {
        name: 'Second example',
        hidden: true,
      }),
    ).toHaveAttribute('tabindex', '0');
  });

  it('changes only the active duplicate exposure when the observed story changes', () => {
    installStageStyles();
    let notify: IntersectionObserverCallback | undefined;
    const observers: IntersectionObserver[] = [];
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class implements IntersectionObserver {
        readonly root: Element | Document | null;
        readonly rootMargin: string;
        readonly thresholds: readonly number[];
        constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          notify = callback;
          observers.push(this);
          this.root = options?.root ?? null;
          this.rootMargin = options?.rootMargin ?? '0px';
          const threshold = options?.threshold ?? 0;
          this.thresholds = Array.isArray(threshold) ? threshold : [threshold];
        }
        observe = observe;
        disconnect = disconnect;
        unobserve = vi.fn();
        takeRecords(): IntersectionObserverEntry[] {
          return [];
        }
      },
    );
    const { container, unmount } = renderKeyboardFeatures();
    const { stage, visuals } = stageVisuals(container);
    const firstRegion = within(visuals[0]! as HTMLElement).getByRole('region', {
      name: 'First example',
      hidden: true,
    });
    const secondStory = container.querySelector<HTMLElement>('article#feature-two');
    const observer = observers[0];
    expect(observers).toHaveLength(1);
    if (!secondStory || !notify || !observer) throw new Error('Missing observed second story');
    expect(observe).toHaveBeenCalledTimes(KEYBOARD_FEATURES.length);
    const boundingClientRect = secondStory.getBoundingClientRect();
    const entry: IntersectionObserverEntry = {
      target: secondStory,
      isIntersecting: true,
      time: performance.now(),
      boundingClientRect,
      intersectionRect: boundingClientRect,
      intersectionRatio: 1,
      rootBounds: null,
    };
    act(() => {
      notify!([entry], observer!);
    });
    expect(Array.from(stage.children)).toEqual(visuals);
    expect(visuals[0]).toHaveAttribute('inert');
    expect(visuals[0]).toHaveAttribute('aria-hidden', 'true');
    expect(visuals[0]).not.toHaveAttribute('data-active');
    expect(getComputedStyle(visuals[0]! as HTMLElement).pointerEvents).toBe('none');
    expect(firstRegion.isConnected).toBe(true);
    const activeRegion = within(stage).getByRole('region', { name: 'Second example' });
    expect(activeRegion.closest('[aria-hidden="true"], [inert]')).toBeNull();
    expect(visuals[1]).toHaveAttribute('data-active', 'true');
    expect(getComputedStyle(visuals[1]! as HTMLElement).pointerEvents).toBe('auto');
    expect(within(stage).queryByRole('region', { name: 'First example' })).toBeNull();
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
