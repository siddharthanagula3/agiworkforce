import { expect, test, type Page } from '@playwright/test';
import {
  locatePublicFeatureMockup,
  measurePublicFeatureMockup,
  type PublicFeatureMockupScope,
} from './lib/public-feature-mockup';

const research = {
  role: 'main',
  figure: 'Example Web research plan awaiting approval',
  bodyWords: { selector: '.agi-sc-research-plan p, .agi-sc-research-steps li' },
  sourceFiles: [
    'apps/web/app/layout.tsx',
    'apps/web/app/globals.css',
    'apps/web/features/marketing/components/DeviceMockups.tsx',
    'apps/web/features/marketing/components/FeatureScenes.tsx',
    'apps/web/features/marketing/components/research-mockup-responsive.css',
    'apps/web/features/marketing/components/agent-mockup-responsive.css',
    'apps/web/features/marketing/components/artifact-mockup-responsive.css',
    'apps/web/features/marketing/components/legacy-pages.css',
    'apps/web/features/marketing/components/legacy-landing.css',
    'apps/web/features/marketing/components/motion/motion.css',
    'apps/web/features/marketing/components/system/system.css',
    'apps/web/features/marketing/components/system/ScrollFeatures.tsx',
    'apps/web/features/marketing/components/system/Bento.tsx',
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

const researchStoryHeading = 'Every claim names the source it came from.';

async function prepareResearchStory(page: Page, evidence: Record<string, unknown>) {
  const article = page.getByRole('article', { name: researchStoryHeading, exact: true });
  const stagedOwner = page.getByRole('region', {
    name: researchStoryHeading,
    exact: true,
    includeHidden: true,
  });
  await expect(article).toHaveCount(1);
  await expect(stagedOwner).toHaveCount(1);
  const read = () =>
    article.evaluate((root) => {
      const wrapper = root.closest('.agi-ds-scrollfeatures');
      const inline = root.querySelector('.agi-ds-scrollfeature-visual--inline');
      const stage = wrapper?.querySelector('.agi-ds-scrollfeatures-stage');
      const heading = root.getAttribute('aria-labelledby');
      if (!wrapper || !inline || !stage || !heading)
        throw new Error('Research story has incomplete canonical ownership');
      const visuals = [...stage.children].filter(
        (element) => element.getAttribute('aria-labelledby') === heading,
      );
      if (visuals.length !== 1)
        throw new Error('Research stage requires exactly one canonical visual');
      const box = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const css = getComputedStyle(element);
        const ancestry = [];
        for (let owner: Element | null = element; owner; owner = owner.parentElement) {
          const style = getComputedStyle(owner);
          ancestry.push({
            tag: owner.localName,
            id: owner.id,
            hidden: owner.hasAttribute('hidden'),
            inert: owner.hasAttribute('inert'),
            ariaHidden: owner.getAttribute('aria-hidden'),
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity,
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
        const exposed =
          displayed &&
          ancestry.every(
            (owner) =>
              !owner.hidden &&
              !owner.inert &&
              owner.ariaHidden !== 'true' &&
              Number(owner.opacity) > 0,
          );
        return {
          connected: element.isConnected,
          heading: element.getAttribute('aria-labelledby'),
          active: element.getAttribute('data-active'),
          ariaHidden: element.getAttribute('aria-hidden'),
          inert: element.hasAttribute('inert'),
          display: css.display,
          visibility: css.visibility,
          opacity: css.opacity,
          pointerEvents: css.pointerEvents,
          position: css.position,
          displayed,
          exposed,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          ancestry,
        };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        scroll: { x: scrollX, y: scrollY },
        nativeObserverAvailable: typeof IntersectionObserver === 'function',
        heading,
        article: { id: root.id, ...box(root) },
        inline: box(inline),
        stage: box(stage),
        visual: box(visuals[0]!),
        activeArticles: [...wrapper.querySelectorAll('article[data-active]')].map(
          (owner) => owner.id,
        ),
        activeVisualHeadings: [...stage.querySelectorAll(':scope > [data-active]')].map((owner) =>
          owner.getAttribute('aria-labelledby'),
        ),
      };
    });
  const before = await read();
  evidence['callerPreparationBefore'] = before;
  if (before.inline.displayed === before.stage.displayed)
    throw new Error('Exactly one native inline or stage presentation must display');
  const presentation = before.inline.displayed ? 'inline' : 'stage';
  evidence['callerPresentation'] = presentation;
  if (presentation === 'stage') {
    expect(
      before.nativeObserverAvailable,
      'The Research stage requires its real native observer',
    ).toBe(true);
    await article.evaluate(async (root) => {
      const rect = root.getBoundingClientRect();
      scrollBy({ top: rect.top + rect.height / 2 - innerHeight / 2, behavior: 'instant' });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await expect(article, 'Real scrolling must activate the Research article').toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(page.getByRole('region', { name: researchStoryHeading, exact: true })).toHaveCount(
      1,
    );
  }
  const prepared = await read();
  evidence['callerPreparationAfter'] = prepared;
  const retained: unknown[] = [];
  evidence['callerRetention'] = retained;
  const assertRetained = async (phase: string) => {
    const state = await read();
    retained.push({ phase, ...state });
    expect(state.heading, 'Canonical Research heading changed').toBe(prepared.heading);
    expect(state.inline.displayed, 'Native Research inline presentation changed').toBe(
      presentation === 'inline',
    );
    expect(state.stage.displayed, 'Native Research stage presentation changed').toBe(
      presentation === 'stage',
    );
    expect(state.article.connected).toBe(true);
    if (presentation === 'stage') {
      expect(state.scroll, 'Preserving Research changed native scroll').toEqual(prepared.scroll);
      expect(state.activeArticles, 'Native observer selected another article').toEqual([
        prepared.article.id,
      ]);
      expect(state.activeVisualHeadings, 'Native observer selected another stage visual').toEqual([
        prepared.heading,
      ]);
      expect(state.visual.active).toBe('true');
      expect(state.visual.ariaHidden).toBeNull();
      expect(state.visual.inert).toBe(false);
      expect(state.visual.opacity).toBe('1');
      expect(state.visual.pointerEvents).toBe('auto');
      expect(state.visual.exposed).toBe(true);
      await expect(
        page.getByRole('region', { name: researchStoryHeading, exact: true }),
      ).toHaveCount(1);
    } else {
      expect(state.inline.exposed).toBe(true);
    }
  };
  await assertRetained('prepared');
  const scope: PublicFeatureMockupScope = {
    role: presentation === 'inline' ? 'article' : 'region',
    region: researchStoryHeading,
    figure: research.figure,
  };
  return { scope, preserveScroll: presentation === 'stage', assertRetained };
}

async function prepareWebResearchBento(page: Page, evidence: Record<string, unknown>) {
  const located = await locatePublicFeatureMockup(page, research);
  try {
    evidence['callerBentoOwnership'] = located.ownership;
    const read = () =>
      located.frame.evaluate((root) => {
        const parent = root.parentElement;
        const style = parent ? getComputedStyle(parent) : null;
        const pixel = (value: string) => {
          const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))px$/u.exec(value.trim());
          return match && Number.isFinite(Number(match[1])) ? Number(match[1]) : null;
        };
        const token = style?.getPropertyValue('--space-2').trim() ?? '';
        const start = style?.paddingInlineStart ?? '';
        const end = style?.paddingInlineEnd ?? '';
        return {
          frameConnected: root.isConnected,
          parentConnected: parent?.isConnected ?? false,
          parentTag: parent?.localName ?? null,
          parentClass: parent?.getAttribute('class') ?? null,
          directBentoParent: parent?.matches('.agi-ds-bento-visual') ?? false,
          directResearchFigures:
            parent?.querySelectorAll(':scope > figure.agi-research-responsive').length ?? 0,
          token,
          expectedPixels: pixel(token),
          paddingInlineStart: start,
          paddingInlineEnd: end,
          paddingStartPixels: pixel(start),
          paddingEndPixels: pixel(end),
        };
      });
    const retained: unknown[] = [];
    evidence['callerBentoPadding'] = retained;
    const assertRetained = async (phase: string) => {
      const state = await read();
      retained.push({ phase, ...state });
      expect(state.frameConnected, 'Research figure must stay connected').toBe(true);
      expect(state.parentConnected, 'Research Bento parent must stay connected').toBe(true);
      expect(state.directBentoParent, 'Web Research requires its actual direct Bento parent').toBe(
        true,
      );
      expect(state.directResearchFigures, 'Bento must contain one direct Research figure').toBe(1);
      expect(state.expectedPixels, 'Inherited --space-2 must resolve to px').not.toBeNull();
      expect(state.expectedPixels, 'Inherited --space-2 must remain positive').toBeGreaterThan(0);
      expect(state.paddingStartPixels, 'Bento inline-start padding must bind --space-2').toBe(
        state.expectedPixels,
      );
      expect(state.paddingEndPixels, 'Bento inline-end padding must bind --space-2').toBe(
        state.expectedPixels,
      );
    };
    await assertRetained('prepared');
    return { scope: research, preserveScroll: false, assertRetained };
  } finally {
    await located.frameHandle.dispose();
  }
}

const callers = [
  { name: 'research', pathname: '/features/deep-research' },
  { name: 'research-web', pathname: '/web' },
  { name: 'research-features', pathname: '/features' },
  { name: 'research-use-cases', pathname: '/use-cases' },
] as const;

const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;

test.describe('public research mockup readability', () => {
  for (const caller of callers) {
    for (const width of widths) {
      for (const theme of themes) {
        test(`${caller.name} at ${width}px ${theme}`, async ({ browser, baseURL }, testInfo) => {
          await measurePublicFeatureMockup(
            browser,
            baseURL,
            testInfo,
            { ...research, ...caller },
            width,
            theme,
            caller.pathname === '/features'
              ? prepareResearchStory
              : caller.pathname === '/web'
                ? prepareWebResearchBento
                : undefined,
          );
        });
      }
    }
  }
});
