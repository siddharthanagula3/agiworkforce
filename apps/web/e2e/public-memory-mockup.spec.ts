import { expect, test, type Page } from '@playwright/test';
import {
  locatePublicFeatureMockup,
  measurePublicFeatureMockup,
  type PublicFeatureMockupScope,
} from './lib/public-feature-mockup';

const memory = {
  role: 'main',
  figure: 'Authored example of a current Web memory draft',
  bodyWords: { selector: 'p[data-memory-draft-content]' },
  sourceFiles: [
    'apps/web/app/layout.tsx',
    'apps/web/app/globals.css',
    'apps/web/features/marketing/components/DeviceMockups.tsx',
    'apps/web/features/marketing/components/FeatureScenes.tsx',
    'apps/web/features/marketing/components/memory-mockup-responsive.css',
    'apps/web/features/marketing/components/mockup-responsive.css',
    'apps/web/features/marketing/components/research-mockup-responsive.css',
    'apps/web/features/marketing/components/agent-mockup-responsive.css',
    'apps/web/features/marketing/components/artifact-mockup-responsive.css',
    'apps/web/features/marketing/components/legacy-pages.css',
    'apps/web/features/marketing/components/legacy-landing.css',
    'apps/web/features/marketing/components/motion/motion.css',
    'apps/web/features/marketing/components/system/system.css',
    'apps/web/features/marketing/components/system/ScrollFeatures.tsx',
    'apps/web/features/marketing/components/system/Bento.tsx',
    'apps/web/features/marketing/components/system/Container.tsx',
    'apps/web/features/marketing/components/system/Section.tsx',
    'apps/web/features/marketing/components/system/Stack.tsx',
    'apps/web/features/marketing/components/system/index.ts',
    'apps/web/features/marketing/components/system/page-header.css',
    'apps/web/features/marketing/components/system/public-reference.css',
    'apps/web/shared/components/layout/Header.tsx',
    'apps/web/features/marketing/components/system/MarketingHeader.tsx',
    'apps/web/shared/components/CookieConsent.tsx',
    'packages/ui/design-tokens/src/foundation.css',
    'packages/ui/design-tokens/src/tailwind.css',
  ],
} as const;

const memoryStoryHeading = 'Every fact AGI keeps is a sentence you can read.';

async function prepareMemoryStory(page: Page, evidence: Record<string, unknown>) {
  const article = page.getByRole('article', { name: memoryStoryHeading, exact: true });
  const stageOwner = page.getByRole('region', {
    name: memoryStoryHeading,
    exact: true,
    includeHidden: true,
  });
  await expect(article).toHaveCount(1);
  await expect(stageOwner).toHaveCount(1);
  const read = () =>
    article.evaluate((root) => {
      const wrapper = root.closest('.agi-ds-scrollfeatures');
      const inline = root.querySelector('.agi-ds-scrollfeature-visual--inline');
      const stage = wrapper?.querySelector('.agi-ds-scrollfeatures-stage');
      const heading = root.getAttribute('aria-labelledby');
      if (!wrapper || !inline || !stage || !heading)
        throw new Error('Memory story has incomplete canonical ownership');
      const visuals = [...stage.children].filter(
        (element) => element.getAttribute('aria-labelledby') === heading,
      );
      if (visuals.length !== 1)
        throw new Error('Memory stage requires exactly one canonical visual');
      const state = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const ancestry = [];
        for (let owner: Element | null = element; owner; owner = owner.parentElement) {
          const css = getComputedStyle(owner);
          ancestry.push({
            display: css.display,
            visibility: css.visibility,
            opacity: css.opacity,
            hidden: owner.hasAttribute('hidden'),
            inert: owner.hasAttribute('inert'),
            ariaHidden: owner.getAttribute('aria-hidden'),
          });
        }
        const displayed =
          element.isConnected &&
          rect.width > 0 &&
          rect.height > 0 &&
          ancestry.every(
            (owner) =>
              owner.display !== 'none' && !['hidden', 'collapse'].includes(owner.visibility),
          );
        return {
          connected: element.isConnected,
          displayed,
          exposed:
            displayed &&
            ancestry.every(
              (owner) =>
                !owner.hidden &&
                !owner.inert &&
                owner.ariaHidden !== 'true' &&
                Number(owner.opacity) > 0,
            ),
          active: element.getAttribute('data-active'),
          ariaHidden: element.getAttribute('aria-hidden'),
          inert: element.hasAttribute('inert'),
          opacity: style.opacity,
          pointerEvents: style.pointerEvents,
          ancestry,
        };
      };
      return {
        scroll: { x: scrollX, y: scrollY },
        nativeObserverAvailable: typeof IntersectionObserver === 'function',
        heading,
        article: { id: root.id, ...state(root) },
        inline: state(inline),
        stage: state(stage),
        visual: state(visuals[0]!),
        stagedVisuals: [...stage.children].map((owner) => ({
          heading: owner.getAttribute('aria-labelledby'),
          ...state(owner),
        })),
        activeArticles: [...wrapper.querySelectorAll('article[data-active]')].map(
          (owner) => owner.id,
        ),
        activeVisualHeadings: [...stage.querySelectorAll(':scope > [data-active]')].map((owner) =>
          owner.getAttribute('aria-labelledby'),
        ),
      };
    });
  const before = await read();
  evidence['memoryStoryBefore'] = before;
  if (before.inline.displayed === before.stage.displayed)
    throw new Error('Exactly one native Memory inline or stage presentation must display');
  const presentation = before.inline.displayed ? 'inline' : 'stage';
  evidence['memoryStoryPresentation'] = presentation;
  if (presentation === 'stage') {
    expect(before.nativeObserverAvailable, 'Memory requires its actual native observer').toBe(true);
    await article.evaluate(async (root) => {
      const rect = root.getBoundingClientRect();
      scrollBy({ top: rect.top + rect.height / 2 - innerHeight / 2, behavior: 'instant' });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await expect(article, 'Real scrolling must activate the Memory article').toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(page.getByRole('region', { name: memoryStoryHeading, exact: true })).toHaveCount(
      1,
    );
  }
  const prepared = await read();
  evidence['memoryStoryPrepared'] = prepared;
  const retained: unknown[] = [];
  evidence['memoryStoryRetention'] = retained;
  const assertRetained = async (phase: string) => {
    const state = await read();
    retained.push({ phase, ...state });
    expect(state.heading).toBe(prepared.heading);
    expect(state.article.connected).toBe(true);
    expect(state.inline.displayed).toBe(presentation === 'inline');
    expect(state.stage.displayed).toBe(presentation === 'stage');
    if (presentation === 'stage') {
      expect(state.scroll, 'Memory capture must preserve the native activation scroll').toEqual(
        prepared.scroll,
      );
      expect(state.activeArticles).toEqual([prepared.article.id]);
      expect(state.activeVisualHeadings).toEqual([prepared.heading]);
      expect(state.visual.active).toBe('true');
      expect(state.visual.ariaHidden).toBeNull();
      expect(state.visual.inert).toBe(false);
      expect(state.visual.opacity).toBe('1');
      expect(state.visual.pointerEvents).toBe('auto');
      expect(state.visual.exposed).toBe(true);
      for (const visual of state.stagedVisuals.filter((owner) => owner.active !== 'true')) {
        expect(visual.ariaHidden).toBe('true');
        expect(visual.inert).toBe(true);
        expect(visual.exposed).toBe(false);
      }
      await expect(page.getByRole('region', { name: memoryStoryHeading, exact: true })).toHaveCount(
        1,
      );
    } else expect(state.inline.exposed).toBe(true);
  };
  await assertRetained('prepared');
  const scope: PublicFeatureMockupScope = {
    role: presentation === 'inline' ? 'article' : 'region',
    region: memoryStoryHeading,
    figure: memory.figure,
  };
  return { scope, preserveScroll: presentation === 'stage', assertRetained };
}

async function prepareMemoryCaller(page: Page, evidence: Record<string, unknown>) {
  const pathname = new URL(page.url()).pathname;
  const presentation =
    pathname === '/features'
      ? await prepareMemoryStory(page, evidence)
      : { scope: memory, preserveScroll: false, assertRetained: async (_phase: string) => {} };
  const located = await locatePublicFeatureMockup(page, presentation.scope);
  try {
    evidence['memoryCallerOwnership'] = located.ownership;
    const read = () =>
      located.frame.evaluate((root) => {
        const css = getComputedStyle(root);
        const pixels = (value: string) => {
          const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(px|rem)$/u.exec(value.trim());
          const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
          if (!match || !Number.isFinite(rootSize)) return null;
          const result = Number(match[1]) * (match[2] === 'rem' ? rootSize : 1);
          return Number.isFinite(result) ? result : null;
        };
        const groups = [
          {
            selector: 'p[data-memory-draft-content]',
            token: '--public-mockup-text-body',
            count: 1,
          },
          {
            selector: '[data-memory-native-label]',
            token: '--public-mockup-text-control',
            count: 2,
          },
          {
            selector: '.agi-dev-title, .agi-dev-badge, .agi-sc-meta',
            token: '--public-mockup-text-code',
            count: 4,
          },
        ].map((group) => ({
          ...group,
          tokenValue: css.getPropertyValue(group.token).trim(),
          expectedPixels: pixels(css.getPropertyValue(group.token)),
          elements: [...root.querySelectorAll(group.selector)].map((element) => ({
            text: element.textContent,
            fontSize: getComputedStyle(element).fontSize,
            actualPixels: pixels(getComputedStyle(element).fontSize),
          })),
        }));
        const parent = root.parentElement;
        const parentStyle = parent ? getComputedStyle(parent) : null;
        const tile = parent?.parentElement ?? null;
        const section = tile?.closest('section') ?? null;
        const insideSections = [...document.querySelectorAll('main#main-content section#inside')];
        const shell = root.querySelector('.agi-dev-shell');
        const marker = root.querySelector('[data-memory-illustration="draft"]');
        return {
          connected: root.isConnected,
          optIn: root.classList.contains('agi-memory-responsive'),
          mask: css.maskImage,
          groups,
          shellOverflow: shell ? getComputedStyle(shell).overflow : null,
          markerOverflow: marker ? getComputedStyle(marker).overflow : null,
          parentConnected: parent?.isConnected ?? false,
          directBentoParent: parent?.matches('.agi-ds-bento-visual') ?? false,
          parentAriaHidden: parent?.getAttribute('aria-hidden') ?? null,
          tileConnected: tile?.isConnected ?? false,
          directBentoTile: tile?.matches('a.agi-ds-bento-tile[role="listitem"]') ?? false,
          tileHref: tile?.getAttribute('href') ?? null,
          tileSpan: tile?.getAttribute('data-span') ?? null,
          insideSectionId: section?.id ?? null,
          insideSectionCount: insideSections.length,
          ownedInsideSection:
            section !== null &&
            tile !== null &&
            insideSections.length === 1 &&
            insideSections[0] === section &&
            section.contains(tile),
          directMemoryFigures:
            parent?.querySelectorAll(':scope > figure.agi-memory-responsive').length ?? 0,
          expectedPadding: parentStyle ? pixels(parentStyle.getPropertyValue('--space-2')) : null,
          paddingStart: parentStyle ? pixels(parentStyle.paddingInlineStart) : null,
          paddingEnd: parentStyle ? pixels(parentStyle.paddingInlineEnd) : null,
        };
      });
    const retained: unknown[] = [];
    evidence['memoryTokenBindings'] = retained;
    const assertRetained = async (phase: string) => {
      await presentation.assertRetained(phase);
      const state = await read();
      retained.push({ phase, ...state });
      expect(state.connected).toBe(true);
      expect(state.optIn).toBe(true);
      expect(state.mask).toBe('none');
      expect(state.shellOverflow).toBe('visible');
      expect(state.markerOverflow).toBe('visible');
      for (const group of state.groups) {
        expect(group.expectedPixels, group.token).not.toBeNull();
        expect(group.expectedPixels, group.token).toBeGreaterThan(0);
        expect(group.elements).toHaveLength(group.count);
        for (const element of group.elements)
          expect(element.actualPixels, `${group.token}: ${element.text}`).toBe(
            group.expectedPixels,
          );
      }
      if (pathname === '/web') {
        expect(state.parentConnected).toBe(true);
        expect(state.directBentoParent, 'Web Memory must keep its actual direct Bento parent').toBe(
          true,
        );
        expect(state.parentAriaHidden).toBe('true');
        expect(state.tileConnected).toBe(true);
        expect(state.directBentoTile).toBe(true);
        expect(state.tileHref).toBe('/features/memory');
        expect(state.tileSpan).toBe('2');
        expect(state.insideSectionId).toBe('inside');
        expect(state.insideSectionCount).toBe(1);
        expect(state.ownedInsideSection).toBe(true);
        expect(state.directMemoryFigures).toBe(1);
        expect(state.expectedPadding).not.toBeNull();
        expect(state.expectedPadding).toBeGreaterThan(0);
        expect(state.paddingStart).toBe(state.expectedPadding);
        expect(state.paddingEnd).toBe(state.expectedPadding);
      }
    };
    await assertRetained('prepared');
    return {
      scope: presentation.scope,
      preserveScroll: presentation.preserveScroll,
      assertRetained,
    };
  } finally {
    await located.frameHandle.dispose();
  }
}

const callers = [
  { name: 'memory', pathname: '/features/memory' },
  { name: 'memory-web', pathname: '/web' },
  { name: 'memory-features', pathname: '/features' },
] as const;
const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;

test.describe('public memory mockup readability', () => {
  for (const caller of callers) {
    for (const width of widths) {
      for (const theme of themes) {
        test(`${caller.name} at ${width}px ${theme}`, async ({ browser, baseURL }, testInfo) => {
          await measurePublicFeatureMockup(
            browser,
            baseURL,
            testInfo,
            { ...memory, ...caller },
            width,
            theme,
            prepareMemoryCaller,
          );
        });
      }
    }
  }
});
