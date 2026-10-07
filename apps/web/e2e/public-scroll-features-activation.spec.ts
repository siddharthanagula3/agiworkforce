import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { settlePublicPage } from './lib/public-page-readiness';
import { getPublicRouteInventory } from './lib/public-route-inventory';

const repositoryRoot = path.resolve(__dirname, '../../..');
const sourceFiles = [
  'apps/web/app/features/page.tsx',
  'apps/web/features/marketing/components/system/ScrollFeatures.tsx',
  'apps/web/features/marketing/components/system/system.css',
  'apps/web/features/marketing/components/FeatureScenes.tsx',
  'apps/web/features/marketing/components/DeviceMockups.tsx',
  'apps/web/features/marketing/components/app-preview/ScenePreviews.tsx',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-route-inventory.ts',
  path.relative(repositoryRoot, __filename),
];
const hashSources = () =>
  Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(repositoryRoot, file)))
        .digest('hex'),
    ]),
  );

const title = 'Every claim names the source it came from.';
const figure = 'Authored example of a research plan waiting to start';

async function nativeStoryState(page: Page) {
  const article = page.getByRole('article', { name: title, exact: true });
  await expect(article).toHaveCount(1);
  return article.evaluate((root) => {
    const wrapper = root.closest('.agi-ds-scrollfeatures');
    const stage = wrapper?.querySelector('.agi-ds-scrollfeatures-stage');
    const inline = root.querySelector('.agi-ds-scrollfeature-visual--inline');
    const heading = root.getAttribute('aria-labelledby');
    if (!wrapper || !stage || !inline || !heading)
      throw new Error('Research story has incomplete authored ownership');
    const visuals = [...stage.children].filter(
      (element) => element.getAttribute('aria-labelledby') === heading,
    );
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const css = getComputedStyle(element);
      return {
        tag: element.localName,
        id: element.id,
        heading: element.getAttribute('aria-labelledby'),
        active: element.getAttribute('data-active'),
        ariaHidden: element.getAttribute('aria-hidden'),
        inert: element.hasAttribute('inert'),
        display: css.display,
        visibility: css.visibility,
        opacity: css.opacity,
        position: css.position,
        top: css.top,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    };
    const records = (window as typeof window & { __agiScrollObserverWitness?: unknown[] })
      .__agiScrollObserverWitness;
    return {
      scroll: { x: scrollX, y: scrollY },
      viewport: { width: innerWidth, height: innerHeight },
      heading,
      article: box(root),
      inline: box(inline),
      stage: box(stage),
      researchVisuals: visuals.map(box),
      activeArticles: [...wrapper.querySelectorAll('article[data-active]')].map(box),
      activeVisuals: [...stage.querySelectorAll(':scope > [data-active]')].map(box),
      observers: records ?? null,
    };
  });
}

for (const width of [1024, 1440]) {
  test(`native Research story activates after real scroll at ${width}px`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    if (!baseURL) throw new Error('Native story activation requires the running public site');
    const evidence: Record<string, unknown> = {
      width,
      sourceStart: hashSources(),
      instrumentation:
        'The constructor subclass forwards the real native entries to the original callback unchanged; it records only the authored scroll-feature observer.',
      limits:
        'This control proves native activation and DOM exposure only, not frame readability or product truth.',
    };
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
      hasTouch: true,
      storageState: { cookies: [], origins: [] },
    });
    try {
      await context.addInitScript(() => {
        const NativeObserver = window.IntersectionObserver;
        const records: unknown[] = [];
        (
          window as typeof window & { __agiScrollObserverWitness?: unknown[] }
        ).__agiScrollObserverWitness = records;
        window.IntersectionObserver = class extends NativeObserver {
          constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            super((entries, observer) => {
              const authored = entries.filter((entry) =>
                entry.target.matches('article.agi-ds-scrollfeature'),
              );
              if (authored.length) {
                const rect = (value: DOMRectReadOnly | null) =>
                  value
                    ? {
                        x: value.x,
                        y: value.y,
                        width: value.width,
                        height: value.height,
                        top: value.top,
                        bottom: value.bottom,
                      }
                    : null;
                records.push({
                  time: performance.now(),
                  scroll: { x: scrollX, y: scrollY },
                  viewport: { width: innerWidth, height: innerHeight },
                  nativePrototype: observer instanceof NativeObserver,
                  rootIsViewport: observer.root === null,
                  rootMargin: observer.rootMargin,
                  thresholds: [...observer.thresholds],
                  entries: authored.map((entry) => ({
                    id: entry.target.id,
                    isIntersecting: entry.isIntersecting,
                    intersectionRatio: entry.intersectionRatio,
                    rootBounds: rect(entry.rootBounds),
                    boundingClientRect: rect(entry.boundingClientRect),
                    intersectionRect: rect(entry.intersectionRect),
                  })),
                });
                if (records.length > 32) records.shift();
              }
              callback.call(observer, entries, observer);
            }, options);
          }
        };
      });
      const page = await context.newPage();
      const routes = getPublicRouteInventory().routes.filter((route) => route.path === '/features');
      expect(routes).toHaveLength(1);
      const route = routes[0]!;
      expect(route.context).toBe('signed-out');
      expect(route.unresolvedFlags).toEqual([]);
      const destination = new URL('/features', baseURL);
      const expectation = {
        ...route,
        expectedOrigin: destination.origin,
        expectedQuery: destination.search,
      };
      evidence['initialReadiness'] = await settlePublicPage(page, expectation);
      const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
      await expect(banner).toBeVisible();
      await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
      await expect(banner).toHaveCount(0);
      evidence['readiness'] = await settlePublicPage(page, expectation);
      const article = page.getByRole('article', { name: title, exact: true });
      await expect(article).toHaveCount(1);
      evidence['before'] = await nativeStoryState(page);
      try {
        await article.evaluate(async (root) => {
          const rect = root.getBoundingClientRect();
          scrollBy({ top: rect.top + rect.height / 2 - innerHeight / 2, behavior: 'instant' });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        });
        await expect(
          article,
          'Real native scroll must activate the Research article',
        ).toHaveAttribute('data-active', 'true');
        const visual = page.getByRole('region', { name: title, exact: true });
        await expect(visual, 'Exactly one active Research visual must be exposed').toHaveCount(1);
        await expect(visual).toBeVisible();
        await expect(visual).toHaveAttribute('data-active', 'true');
        await expect(visual).not.toHaveAttribute('aria-hidden');
        await expect(visual).not.toHaveAttribute('inert');
        await expect(
          visual.getByRole('figure', { name: figure, exact: true, includeHidden: true }),
        ).toHaveCount(1);
      } finally {
        evidence['after'] = await nativeStoryState(page);
      }
      const state = evidence['after'] as Awaited<ReturnType<typeof nativeStoryState>>;
      expect(state.stage.display).not.toBe('none');
      expect(state.inline.display).toBe('none');
      expect(state.researchVisuals).toHaveLength(1);
      expect(state.activeArticles.map((entry) => entry.id)).toEqual([state.article.id]);
      expect(state.activeVisuals.map((entry) => entry.heading)).toEqual([state.heading]);
      const recorded = state.observers as
        | {
            nativePrototype: boolean;
            rootIsViewport: boolean;
            entries: {
              id: string;
              isIntersecting: boolean;
              rootBounds: { height: number } | null;
            }[];
          }[]
        | null;
      expect(recorded, 'Real native observer entries must be recorded').not.toBeNull();
      expect(recorded?.length).toBeGreaterThan(0);
      expect(recorded?.every((entry) => entry.nativePrototype && entry.rootIsViewport)).toBe(true);
      const intersections = recorded
        ?.flatMap((entry) => entry.entries)
        .filter((entry) => entry.id === state.article.id && entry.isIntersecting);
      expect(
        intersections?.length,
        'Native Research intersection must be witnessed',
      ).toBeGreaterThan(0);
      expect(intersections?.every((entry) => entry.rootBounds && entry.rootBounds.height > 0)).toBe(
        true,
      );
    } finally {
      await context.close();
      evidence['contextClosed'] = true;
      evidence['sourceEnd'] = hashSources();
      evidence['sourceUnchanged'] =
        JSON.stringify(evidence['sourceStart']) === JSON.stringify(evidence['sourceEnd']);
      await testInfo.attach('native-research-scroll.json', {
        body: Buffer.from(JSON.stringify(evidence, null, 2)),
        contentType: 'application/json',
      });
      expect(evidence['sourceUnchanged'], 'Native activation sources changed during this run').toBe(
        true,
      );
    }
  });
}
