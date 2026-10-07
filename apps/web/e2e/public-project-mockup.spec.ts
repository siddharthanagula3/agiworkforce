import { expect, test, type Page } from '@playwright/test';
import {
  locatePublicFeatureMockup,
  measurePublicFeatureMockup,
  type PublicFeatureMockupScene,
  type PublicFeatureMockupScope,
} from './lib/public-feature-mockup';
import type { measurePublicFeatureBodyWords } from './lib/public-feature-body-words';
import {
  bindPublicWindowBarSources,
  measurePublicWindowBarWords,
} from './lib/public-window-bar-words';

const project = {
  role: 'main',
  figure: 'Authored example of a current Web project settings draft',
  bodyWords: { selector: 'p[data-project-draft-value], p[data-project-draft-status]' },
  sourceFiles: [
    'apps/web/e2e/lib/public-window-bar-words.ts',
    'apps/web/app/layout.tsx',
    'apps/web/app/globals.css',
    'apps/web/features/marketing/components/DeviceMockups.tsx',
    'apps/web/features/marketing/components/FeatureScenes.tsx',
    'apps/web/features/marketing/components/project-mockup-responsive.css',
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
    'packages/contracts/types/src/index.ts',
    'packages/contracts/types/src/project-templates.ts',
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
    | { kind: 'hero'; headingId: string }
    | { kind: 'moment'; headingId: string; momentTitle: string }
    | {
        kind: 'bento';
        sectionId: string;
        headingId: string;
        listLabel: string;
        tileHref: string;
        tileTitle: string;
      }
    | { kind: 'story' };
  extraSources?: readonly string[];
};

const projectStoryHeading = 'Project instructions, with selected reference material.';
const callers: readonly ProjectCaller[] = [
  {
    name: 'project-features',
    pathname: '/features',
    pageFile: 'apps/web/app/features/page.tsx',
    scope: { role: 'main', figure: project.figure },
    wrapper: { kind: 'story' },
  },
  {
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
      tileTitle: 'Project instructions and selected references',
    },
  },
  {
    name: 'project-projects-hero',
    pathname: '/features/projects',
    pageFile: 'apps/web/app/features/projects/page.tsx',
    scope: { role: 'region', region: projectStoryHeading, figure: project.figure },
    wrapper: { kind: 'hero', headingId: 'agi-features-projects-title' },
  },
  {
    name: 'project-projects-templates',
    pathname: '/features/projects',
    pageFile: 'apps/web/app/features/projects/page.tsx',
    scope: {
      role: 'region',
      region: 'Start blank or choose a preset.',
      figure: project.figure,
    },
    wrapper: {
      kind: 'moment',
      headingId: 'agi-features-projects-templates-title',
      momentTitle: 'An authored settings draft',
    },
  },
  {
    name: 'project-solutions',
    pathname: '/solutions',
    pageFile: 'apps/web/app/solutions/page.tsx',
    scope: {
      role: 'region',
      region: 'Each of these pages was written for someone doing a different job.',
      figure: project.figure,
    },
    wrapper: {
      kind: 'bento',
      sectionId: 'solutions-map',
      headingId: 'agi-solutions-map-title',
      listLabel: 'Solution pages',
      tileHref: '/use-cases',
      tileTitle: 'Use cases',
    },
  },
  {
    name: 'project-use-cases',
    pathname: '/use-cases',
    pageFile: 'apps/web/app/use-cases/page.tsx',
    scope: {
      role: 'region',
      region: 'Each page opens on the surface its team actually works in.',
      figure: project.figure,
    },
    wrapper: {
      kind: 'bento',
      sectionId: 'usecases-index',
      headingId: 'agi-usecases-index-title',
      listLabel: 'Use case pages',
      tileHref: '/use-cases/consulting',
      tileTitle: 'Client work, across providers.',
    },
    extraSources: ['apps/web/features/marketing/components/pages/business/use-cases-content.ts'],
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
      const barSource = await bindPublicWindowBarSources(
        located.frame,
        {
          selector: located.scopeSelector,
          elementIndex: located.ownership.elementIndex,
          tag: located.ownership.tag,
          label: located.ownership.label,
        },
        'project',
      );
      evidence['projectBarBoundSources'] = barSource;
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
              selector:
                '.agi-sc-page-title, p[data-project-draft-value], p[data-project-draft-status]',
              token: '--public-mockup-text-body',
              count: 4,
            },
            {
              selector: '[data-project-native-label]',
              token: '--public-mockup-text-control',
              count: 3,
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
              actualPixels: pixels(getComputedStyle(element).fontSize),
            })),
          }));
          const parent = root.parentElement;
          const tile = parent?.parentElement;
          const list = tile?.parentElement;
          const section = root.closest('section');
          const parentStyle = parent ? getComputedStyle(parent) : null;
          const headingId = section?.getAttribute('aria-labelledby');
          const heading = headingId ? document.getElementById(headingId) : null;
          const shell = root.querySelector('.agi-dev-shell');
          const body = root.querySelector('.agi-dev-body.agi-sc');
          return {
            connected: root.isConnected,
            mainId: root.closest('main')?.id,
            mainCount: document.querySelectorAll('main').length,
            optIn: root.classList.contains('agi-project-responsive'),
            mask: css.maskImage,
            groups,
            proseOwners: [
              'p[data-project-draft-value="name"]',
              'p[data-project-draft-value="instructions"]',
              'p[data-project-draft-status]',
            ].map((selector) => ({
              selector,
              elements: [...root.querySelectorAll(selector)].map((element) => ({
                tag: element.localName,
                text: element.textContent?.trim(),
              })),
            })),
            shellOverflow: shell ? getComputedStyle(shell).overflow : null,
            markerOverflow: root.querySelector('[data-project-illustration="draft"]')
              ? getComputedStyle(root.querySelector('[data-project-illustration="draft"]')!)
                  .overflow
              : null,
            bodyAriaHidden: body?.getAttribute('aria-hidden'),
            parentConnected: parent?.isConnected ?? false,
            directHeroParent: parent?.matches('.agi-lp-hero-stage') ?? false,
            directMomentParent: parent?.matches('article.agi-lp-moment') ?? false,
            momentTitles: [
              ...(parent?.querySelectorAll(
                ':scope > .agi-lp-moment-copy > h3.agi-lp-moment-title',
              ) ?? []),
            ].map((owner) => owner.textContent?.trim()),
            directBentoParent: parent?.matches('.agi-ds-bento-visual') ?? false,
            parentAriaHidden: parent?.getAttribute('aria-hidden'),
            directProjectFigures:
              parent?.querySelectorAll(':scope > figure.agi-project-responsive').length ?? 0,
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
            expectedPadding: parentStyle ? pixels(parentStyle.getPropertyValue('--space-2')) : null,
            paddingStart: parentStyle ? pixels(parentStyle.paddingInlineStart) : null,
            paddingEnd: parentStyle ? pixels(parentStyle.paddingInlineEnd) : null,
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
        });
      const retained: unknown[] = [];
      evidence['projectCallerBindings'] = retained;
      const barReadings: {
        phase: string;
        report: Awaited<ReturnType<typeof measurePublicWindowBarWords>>;
      }[] = [];
      evidence['projectBarWordReadings'] = barReadings;
      const assertRetained = async (phase: string) => {
        await presentation.assertRetained(phase);
        const state = await read();
        retained.push({ phase, ...state });
        expect(state.connected).toBe(true);
        expect(state.mainCount).toBe(1);
        expect(state.mainId).toBe('main-content');
        expect(state.optIn).toBe(true);
        expect(state.mask).toBe('none');
        expect(state.shellOverflow).toBe('visible');
        expect(state.markerOverflow).toBe('visible');
        expect(state.bodyAriaHidden).toBe('true');
        for (const owner of state.proseOwners) {
          expect(owner.elements, owner.selector).toHaveLength(1);
          for (const element of owner.elements) {
            expect(element.tag).toBe('p');
            expect(element.text?.length, owner.selector).toBeGreaterThan(0);
          }
        }
        for (const group of state.groups) {
          expect(group.expectedPixels, group.token).not.toBeNull();
          expect(group.expectedPixels, group.token).toBeGreaterThan(0);
          expect(group.elements).toHaveLength(group.count);
          for (const element of group.elements)
            expect(element.actualPixels, `${group.token}: ${element.text}`).toBe(
              group.expectedPixels,
            );
        }
        if (caller.wrapper.kind !== 'story') {
          expect(state.parentConnected).toBe(true);
          expect(state.directProjectFigures).toBe(1);
          expect(state.headingId).toBe(caller.wrapper.headingId);
          expect(state.sectionOwnsHeading).toBe(true);
          expect(state.headingOwnerCount).toBe(1);
          expect(state.labelledSectionCount).toBe(1);
          if (caller.wrapper.kind === 'hero') expect(state.directHeroParent).toBe(true);
          else if (caller.wrapper.kind === 'moment') {
            expect(state.directMomentParent).toBe(true);
            expect(state.momentTitles).toEqual([caller.wrapper.momentTitle]);
          } else {
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
            expect(state.expectedPadding).not.toBeNull();
            expect(state.expectedPadding).toBeGreaterThan(0);
            expect(state.paddingStart).toBe(state.expectedPadding);
            expect(state.paddingEnd).toBe(state.expectedPadding);
          }
        }
        if (phase === 'before-capture' || phase === 'after-capture') {
          const report = await measurePublicWindowBarWords(
            located.frame,
            barSource,
            evidence['typography'],
            evidence['fontProof'],
            'project',
          );
          barReadings.push({ phase, report });
          expect
            .soft(report.findings, 'Every Project bar word stays intact and contained')
            .toEqual([]);
          expect
            .soft(report.unmeasured, 'Every Project bar source and grapheme requires proof')
            .toEqual([]);
          expect.soft(report.coverage.expectedOwners).toBe(2);
          expect.soft(report.coverage.expectedTextNodes).toBeGreaterThan(0);
          expect.soft(report.coverage.expectedSourceUnits).toBeGreaterThan(0);
          expect.soft(report.coverage.expectedPaintedGraphemes).toBeGreaterThan(0);
          expect.soft(report.coverage.expectedWords).toBeGreaterThan(0);
          expect.soft(report.coverage.measuredOwners).toBe(report.coverage.expectedOwners);
          expect.soft(report.coverage.measuredTextNodes).toBe(report.coverage.expectedTextNodes);
          expect.soft(report.coverage.mappedSourceUnits).toBe(report.coverage.expectedSourceUnits);
          expect
            .soft(report.coverage.measuredPaintedGraphemes)
            .toBe(report.coverage.expectedPaintedGraphemes);
          expect.soft(report.coverage.measuredWords).toBe(report.coverage.discoveredWords);
          expect.soft(report.coverage.measuredWords).toBe(report.coverage.expectedWords);
          expect.soft(report.owners.map((owner) => owner.kind)).toEqual(['title', 'badge']);
          for (const owner of report.owners) {
            expect.soft(owner.sourceKeys.length).toBeGreaterThan(0);
            expect.soft(owner.words.length).toBeGreaterThan(0);
            for (const word of owner.words) expect.soft(word.bands).toBe(1);
          }
          if (phase === 'after-capture')
            expect
              .soft(report, 'Bound Project bar sources and geometry must survive capture')
              .toEqual(barReadings[0]?.report);
        }
        if (phase === 'before-capture') {
          const words = evidence['bodyWords'] as
            Awaited<ReturnType<typeof measurePublicFeatureBodyWords>> | undefined;
          if (!words) throw new Error('The unchanged collector must measure the Project prose');
          expect(words.coverage.owners).toBe(3);
          expect(words.coverage.ordinaryWords).toBeGreaterThan(0);
          expect(words.coverage.exemptWords).toBe(0);
          expect(words.coverage.unmeasuredWords).toBe(0);
          expect(words.coverage.ordinaryWords).toBe(words.coverage.words);
          for (const owner of words.owners) {
            expect(owner.tag).toBe('p');
            expect(owner.sourceKeys.length).toBeGreaterThan(0);
            expect(
              words.words.filter(
                (word) =>
                  word.ownerIndex === owner.ownerIndex && word.classification === 'ordinary',
              ).length,
            ).toBeGreaterThan(0);
          }
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

const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;
const cases = callers.flatMap((caller) =>
  widths.flatMap((width) => themes.map((theme) => ({ caller, width, theme }))),
);
const priority = (entry: (typeof cases)[number]) =>
  entry.caller.name === 'project-features' && entry.width === 1024 && entry.theme === 'light'
    ? 0
    : entry.caller.name === 'project-web' && entry.width === 320 && entry.theme === 'light'
      ? 1
      : 2;

test.describe('public project mockup current caller readability', () => {
  for (const { caller, width, theme } of cases.toSorted(
    (left, right) => priority(left) - priority(right),
  )) {
    test(`${caller.name} at ${width}px ${theme}`, async ({ browser, baseURL }, testInfo) => {
      const scene: PublicFeatureMockupScene = {
        ...project,
        ...caller.scope,
        name: caller.name,
        pathname: caller.pathname,
        sourceFiles: [...project.sourceFiles, caller.pageFile, ...(caller.extraSources ?? [])],
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
