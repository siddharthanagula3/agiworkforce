import { expect, test, type Page } from '@playwright/test';
import {
  locatePublicFeatureMockup,
  measurePublicFeatureMockup,
  type PublicFeatureMockupScene,
  type PublicFeatureMockupScope,
} from './lib/public-feature-mockup';

const project = {
  role: 'main',
  figure: 'Authored example of a current Web project settings draft',
  bodyWords: { selector: 'p[data-project-draft-value], p[data-project-draft-status]' },
  sourceFiles: [
    'apps/web/app/layout.tsx',
    'apps/web/app/globals.css',
    'apps/web/features/marketing/components/DeviceMockups.tsx',
    'apps/web/features/marketing/components/FeatureScenes.tsx',
    'apps/web/features/marketing/components/agent-mockup-responsive.css',
    'apps/web/features/marketing/components/artifact-mockup-responsive.css',
    'apps/web/features/marketing/components/research-mockup-responsive.css',
    'apps/web/features/marketing/components/memory-mockup-responsive.css',
    'apps/web/features/marketing/components/mockup-responsive.css',
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
    'apps/web/lib/e2b/execution-tools.ts',
    'apps/web/lib/e2b/types.ts',
    'apps/web/lib/e2b/unavailability.ts',
    'packages/contracts/types/src/tool-approval-policy.ts',
    'packages/contracts/types/src/tool-status.ts',
    'packages/contracts/types/src/tool-display.ts',
    'packages/platform/artifacts/package.json',
    'packages/platform/artifacts/src/index.ts',
    'packages/platform/artifacts/src/artifact-derivation.ts',
    'packages/platform/artifacts/src/artifact-store.ts',
    'packages/platform/artifacts/src/artifacts.ts',
    'packages/platform/artifacts/src/artifact-sync.ts',
    'packages/platform/artifacts/src/artifact-changes.ts',
    'packages/ui/design-tokens/src/foundation.css',
    'packages/ui/design-tokens/src/tailwind.css',
  ],
} as const;

type ProjectCaller = {
  name: string;
  pathname: string;
  pageFile: string;
  scope: PublicFeatureMockupScope;
  wrapper:
    | { kind: 'story' }
    | {
        kind: 'bento';
        sectionId: string;
        headingId: string;
        listLabel: string;
        tileHref: string;
        tileTitle: string;
      };
};

const projectStoryHeading = 'A project rebuilds its own context into every prompt.';
const cases: readonly { caller: ProjectCaller; width: number; theme: 'light' }[] = [
  {
    caller: {
      name: 'project-features',
      pathname: '/features',
      pageFile: 'apps/web/app/features/page.tsx',
      scope: { role: 'main', figure: project.figure },
      wrapper: { kind: 'story' },
    },
    width: 1024,
    theme: 'light',
  },
  {
    caller: {
      name: 'project-web',
      pathname: '/web',
      pageFile: 'apps/web/app/web/page.tsx',
      scope: { role: 'region', region: 'Everything a chat opens into.', figure: project.figure },
      wrapper: {
        kind: 'bento',
        sectionId: 'inside',
        headingId: 'agi-web-inside-title',
        listLabel: 'What AGI Web includes',
        tileHref: '/features/projects',
        tileTitle: 'Instructions and files that follow every prompt',
      },
    },
    width: 320,
    theme: 'light',
  },
];

async function prepareProjectStory(page: Page, evidence: Record<string, unknown>) {
  const article = page.getByRole('article', { name: projectStoryHeading, exact: true });
  const stageOwner = page.getByRole('region', {
    name: projectStoryHeading,
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
      const headingOwner = heading ? document.getElementById(heading) : null;
      if (!wrapper || !inline || !stage || !heading)
        throw new Error('Project story has incomplete canonical ownership');
      const visuals = [...stage.children].filter(
        (element) => element.getAttribute('aria-labelledby') === heading,
      );
      if (visuals.length !== 1)
        throw new Error('Project stage requires exactly one canonical visual');
      const state = (element: Element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const ancestry = [];
        for (let owner: Element | null = element; owner; owner = owner.parentElement) {
          const css = getComputedStyle(owner);
          ancestry.push({
            tag: owner.localName,
            id: owner.id,
            classes: [...owner.classList],
            display: css.display,
            visibility: css.visibility,
            opacity: css.opacity,
            hidden: owner.hasAttribute('hidden'),
            inert: owner.hasAttribute('inert'),
            ariaHidden: owner.getAttribute('aria-hidden'),
            rect: {
              top: owner.getBoundingClientRect().top,
              bottom: owner.getBoundingClientRect().bottom,
              left: owner.getBoundingClientRect().left,
              right: owner.getBoundingClientRect().right,
              width: owner.getBoundingClientRect().width,
              height: owner.getBoundingClientRect().height,
            },
            position: css.position,
            overflowX: css.overflowX,
            overflowY: css.overflowY,
            transform: css.transform,
            gridTemplateRows: css.gridTemplateRows,
            alignItems: css.alignItems,
            alignSelf: css.alignSelf,
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
          rect: {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
          },
          position: style.position,
          insetBlockStart: style.insetBlockStart,
          minBlockSize: style.minBlockSize,
          gridTemplateRows: style.gridTemplateRows,
          alignSelf: style.alignSelf,
          ancestry,
        };
      };
      return {
        scroll: { x: scrollX, y: scrollY },
        nativeObserverAvailable: typeof IntersectionObserver === 'function',
        heading,
        headingOwned: Boolean(headingOwner && root.contains(headingOwner)),
        headingOwnerCount: [...document.querySelectorAll('[id]')].filter(
          (owner) => owner.id === heading,
        ).length,
        wrapperLabel: wrapper.getAttribute('aria-label'),
        sectionId: wrapper.closest('section')?.id,
        mainId: root.closest('main')?.id,
        wrapper: state(wrapper),
        storyList: wrapper.querySelector('.agi-ds-scrollfeatures-list')
          ? state(wrapper.querySelector('.agi-ds-scrollfeatures-list')!)
          : null,
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
  evidence['projectStoryBefore'] = before;
  if (before.inline.displayed === before.stage.displayed)
    throw new Error('Exactly one native Project inline or stage presentation must display');
  const presentation = before.inline.displayed ? 'inline' : 'stage';
  evidence['projectStoryPresentation'] = presentation;
  expect(presentation, 'This before case requires the actual native Project stage').toBe('stage');
  if (presentation === 'stage') {
    expect(before.nativeObserverAvailable, 'Project requires its actual native observer').toBe(
      true,
    );
    const previous = await article.evaluate((root) => {
      const owner = root.previousElementSibling;
      const headingId = owner?.getAttribute('aria-labelledby');
      const heading = headingId ? document.getElementById(headingId) : null;
      if (
        !owner?.matches('article.agi-ds-scrollfeature') ||
        owner.parentElement !== root.parentElement ||
        !heading ||
        !owner.contains(heading) ||
        !owner.id ||
        !heading.textContent?.trim()
      )
        throw new Error('Project requires its actual preceding labelled story');
      return { id: owner.id, headingId, name: heading.textContent.trim() };
    });
    const preceding = page.getByRole('article', { name: previous.name, exact: true });
    await expect(preceding).toHaveCount(1);
    await expect(preceding).toHaveAttribute('id', previous.id);
    await preceding.evaluate(async (root) => {
      const rect = root.getBoundingClientRect();
      scrollBy({ top: rect.top + rect.height / 2 - innerHeight / 2, behavior: 'instant' });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await expect(preceding).toHaveAttribute('data-active', 'true');
    const inactive = await read();
    evidence['projectStoryInactivePrepared'] = { preceding: previous, state: inactive };
    expect(inactive.activeArticles).toEqual([previous.id]);
    expect(inactive.activeVisualHeadings).toEqual([previous.headingId]);
    expect(inactive.visual.active).toBeNull();
    expect(inactive.visual.ariaHidden).toBe('true');
    expect(inactive.visual.inert).toBe(true);
    expect(inactive.visual.exposed).toBe(false);
    await article.evaluate(async (root) => {
      const rect = root.getBoundingClientRect();
      scrollBy({ top: rect.top + rect.height / 2 - innerHeight / 2, behavior: 'instant' });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await expect(article, 'Real scrolling must activate the Project article').toHaveAttribute(
      'data-active',
      'true',
    );
    await expect(page.getByRole('region', { name: projectStoryHeading, exact: true })).toHaveCount(
      1,
    );
  }
  const prepared = await read();
  evidence['projectStoryPrepared'] = prepared;
  const retained: unknown[] = [];
  evidence['projectStoryRetention'] = retained;
  const assertRetained = async (phase: string) => {
    const state = await read();
    retained.push({ phase, ...state });
    expect(state.mainId).toBe('main-content');
    expect(state.sectionId).toBe('loop');
    expect(state.wrapperLabel).toBe('Six things a chat opens into');
    expect(state.article.id).toBe('feature-projects');
    expect(state.heading).toBe('feature-projects-title');
    expect(state.heading).toBe(prepared.heading);
    expect(state.headingOwned).toBe(true);
    expect(state.headingOwnerCount).toBe(1);
    expect(state.article.connected).toBe(true);
    expect(state.inline.displayed).toBe(presentation === 'inline');
    expect(state.stage.displayed).toBe(presentation === 'stage');
    if (presentation === 'stage') {
      expect(state.scroll, 'Project capture must preserve its native activation scroll').toEqual(
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
      await expect(
        page.getByRole('region', { name: projectStoryHeading, exact: true }),
      ).toHaveCount(1);
    } else expect(state.inline.exposed).toBe(true);
  };
  await assertRetained('prepared');
  const scope: PublicFeatureMockupScope = {
    role: presentation === 'inline' ? 'article' : 'region',
    region: projectStoryHeading,
    figure: project.figure,
  };
  return { scope, preserveScroll: presentation === 'stage', assertRetained };
}

function prepareProjectCaller(caller: ProjectCaller) {
  return async (page: Page, evidence: Record<string, unknown>) => {
    evidence['projectBeforeResponsive'] = {
      concern: 'Authored Project example under existing styles; future responsive rules are absent',
      caller: caller.name,
    };
    const presentation =
      caller.wrapper.kind === 'story'
        ? await prepareProjectStory(page, evidence)
        : {
            scope: caller.scope,
            preserveScroll: false,
            assertRetained: async (_phase: string) => {},
          };
    const located = await locatePublicFeatureMockup(page, presentation.scope);
    try {
      evidence['projectCallerOwnership'] = located.ownership;
      const read = () =>
        located.frame.evaluate((root, requestedLabel) => {
          const rect = (owner: Element) => {
            const box = owner.getBoundingClientRect();
            return {
              top: box.top,
              bottom: box.bottom,
              left: box.left,
              right: box.right,
              width: box.width,
              height: box.height,
            };
          };
          const parent = root.parentElement;
          const tile = parent?.parentElement;
          const list = tile?.parentElement;
          const section = root.closest('section');
          const parentStyle = parent ? getComputedStyle(parent) : null;
          const headingId = section?.getAttribute('aria-labelledby');
          const heading = headingId ? document.getElementById(headingId) : null;
          const body = root.querySelector('.agi-dev-body.agi-sc');
          return {
            connected: root.isConnected,
            mainId: root.closest('main')?.id,
            mainCount: document.querySelectorAll('main').length,
            figureLabel: root.getAttribute('aria-label'),
            frameRect: rect(root),
            frameStyle: {
              fontSize: getComputedStyle(root).fontSize,
              overflowX: getComputedStyle(root).overflowX,
              overflowY: getComputedStyle(root).overflowY,
              maskImage: getComputedStyle(root).maskImage,
            },
            proseOwners: [
              'p[data-project-draft-value="name"]',
              'p[data-project-draft-value="instructions"]',
              'p[data-project-draft-status]',
            ].map((selector) => ({
              selector,
              elements: [...root.querySelectorAll(selector)].map((element) => ({
                tag: element.localName,
                text: element.textContent?.trim(),
                rect: rect(element),
                fontSize: getComputedStyle(element).fontSize,
                whiteSpace: getComputedStyle(element).whiteSpace,
                overflowWrap: getComputedStyle(element).overflowWrap,
              })),
            })),
            bodyAriaHidden: body?.getAttribute('aria-hidden'),
            parentConnected: parent?.isConnected ?? false,
            directBentoParent: parent?.matches('.agi-ds-bento-visual') ?? false,
            parentAriaHidden: parent?.getAttribute('aria-hidden'),
            directProjectFigures: parent
              ? [...parent.children].filter(
                  (owner) =>
                    owner.matches('figure') && owner.getAttribute('aria-label') === requestedLabel,
                ).length
              : 0,
            directBentoTile: tile?.matches('a.agi-ds-bento-tile[role="listitem"]') ?? false,
            tileHref: tile?.getAttribute('href'),
            tileSpan: tile?.getAttribute('data-span'),
            tileTitles: [...(tile?.querySelectorAll('.agi-ds-bento-title') ?? [])].map((owner) =>
              owner.textContent?.trim(),
            ),
            directBentoList: list?.matches('div.agi-ds-bento[role="list"]') ?? false,
            listRole: list?.getAttribute('role'),
            listLabel: list?.getAttribute('aria-label'),
            sectionOwnsList: Boolean(section && list && section.contains(list)),
            sectionOwnerCount: [...document.querySelectorAll('main#main-content section')].filter(
              (owner) => owner.id === section?.id,
            ).length,
            sameHrefTiles:
              tile && list
                ? [...list.children].filter(
                    (owner) => owner.getAttribute('href') === tile.getAttribute('href'),
                  ).length
                : 0,
            observedParentStyle: parentStyle
              ? {
                  inheritedSpace2: parentStyle.getPropertyValue('--space-2').trim(),
                  paddingStart: parentStyle.paddingInlineStart,
                  paddingEnd: parentStyle.paddingInlineEnd,
                  rect: rect(parent!),
                }
              : null,
            sectionId: section?.id,
            headingId,
            sectionOwnsHeading: Boolean(section && heading && section.contains(heading)),
            headingOwnerCount: [...document.querySelectorAll('[id]')].filter(
              (owner) => owner.id === headingId,
            ).length,
            labelledSectionCount: [
              ...document.querySelectorAll('main#main-content section'),
            ].filter((owner) => owner.getAttribute('aria-labelledby') === headingId).length,
          };
        }, project.figure);
      const retained: unknown[] = [];
      evidence['projectCallerBindings'] = retained;
      const assertRetained = async (phase: string) => {
        await presentation.assertRetained(phase);
        const state = await read();
        retained.push({ phase, ...state });
        expect(state.connected).toBe(true);
        expect(state.mainCount).toBe(1);
        expect(state.mainId).toBe('main-content');
        expect(state.figureLabel).toBe(project.figure);
        expect(state.bodyAriaHidden).toBe('true');
        for (const owner of state.proseOwners) {
          expect(owner.elements, owner.selector).toHaveLength(1);
          for (const element of owner.elements) {
            expect(element.tag).toBe('p');
            expect(element.text?.length, owner.selector).toBeGreaterThan(0);
          }
        }
        if (caller.wrapper.kind === 'bento') {
          expect(state.parentConnected).toBe(true);
          expect(state.directProjectFigures).toBe(1);
          expect(state.headingId).toBe(caller.wrapper.headingId);
          expect(state.sectionOwnsHeading).toBe(true);
          expect(state.headingOwnerCount).toBe(1);
          expect(state.labelledSectionCount).toBe(1);
          expect(state.directBentoParent).toBe(true);
          expect(state.parentAriaHidden).toBe('true');
          expect(state.directBentoTile).toBe(true);
          expect(state.tileHref).toBe(caller.wrapper.tileHref);
          expect(state.tileTitles).toEqual([caller.wrapper.tileTitle]);
          expect(state.tileSpan).toBe('1');
          expect(state.directBentoList).toBe(true);
          expect(state.listRole).toBe('list');
          expect(state.listLabel).toBe(caller.wrapper.listLabel);
          expect(state.sectionOwnsList).toBe(true);
          expect(state.sectionId).toBe(caller.wrapper.sectionId);
          expect(state.sectionOwnerCount).toBe(1);
          expect(state.sameHrefTiles).toBe(1);
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
  };
}

test.describe('public project authored example before responsive styles', () => {
  for (const { caller, width, theme } of cases) {
    test(`${caller.name} at ${width}px ${theme}`, async ({ browser, baseURL }, testInfo) => {
      const scene: PublicFeatureMockupScene = {
        ...project,
        ...caller.scope,
        name: caller.name,
        pathname: caller.pathname,
        sourceFiles: [...project.sourceFiles, caller.pageFile],
      };
      await measurePublicFeatureMockup(
        browser,
        baseURL,
        testInfo,
        scene,
        width,
        theme,
        prepareProjectCaller(caller),
      );
    });
  }
});
