import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
  type JSHandle,
} from '@playwright/test';
import { docsNavGroups, docsNeighbours, type DocsNavLink } from '../features/docs/lib/docs-nav';
import { headingAnchor } from '../lib/support/doc-topics';
import { getHelpArticle } from '../lib/support/help-articles';
import { interpolateFacts } from '../lib/support/agent/corpus';
import { parseFrontmatter } from '../scripts/lib/support-frontmatter.mjs';
import {
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentCurrent,
  NECESSARY_ONLY_PREFERENCES,
  parseCookieConsentRecord,
} from '../shared/lib/cookie-consent';
import {
  measurePublicFontProof,
  settlePublicPage,
  type PublicExpectedFont,
} from './lib/public-page-readiness';
import { getPublicRouteInventory } from './lib/public-route-inventory';
import { helpArticlePath } from '../lib/support/help-paths';

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(`documentation drawer at ${viewport.width}px in ${colorScheme}`, () => {
      test.use({
        viewport,
        colorScheme,
        reducedMotion: 'reduce',
        storageState: { cookies: [], origins: [] },
      });

      test('uses one native drawer trap, closes on links and releases at the desktop breakpoint', async ({
        page,
      }, testInfo) => {
        expect((await page.goto('/docs'))?.status()).toBe(200);
        await page.evaluate(() => document.fonts.ready);
        await expect(
          page.getByRole('region', { name: 'Cookie consent', exact: true }),
        ).toBeVisible();
        const navigation = page.getByRole('complementary', { includeHidden: true });
        const trigger = navigation.getByRole('button', {
          name: 'Browse documentation',
          exact: true,
          includeHidden: true,
        });
        const outsideAriaHidden = () =>
          navigation.evaluate(
            (element) =>
              element.closest('[aria-hidden="true"]')?.getAttribute('aria-hidden') ?? null,
          );
        const expectNavigationRestored = async () => {
          await expect.poll(outsideAriaHidden).toBeNull();
          await expect(page.getByRole('complementary')).toHaveCount(1);
        };
        await expectNavigationRestored();
        const drawer = page.getByRole('dialog', { name: 'Documentation', exact: true });
        await trigger.click();
        await expect(drawer).toHaveAttribute('aria-modal', 'true');
        const title = drawer.getByRole('heading', { name: 'Documentation', exact: true });
        expect(
          await title.evaluate((element) => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return new Set(
              Array.from(range.getClientRects())
                .filter((rect) => rect.width > 0 && rect.height > 0)
                .map((rect) => Math.round(rect.y)),
            ).size;
          }),
          'The phone drawer title must fit without an orphaned trailing word',
        ).toBe(1);
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect.poll(outsideAriaHidden).toBe('true');
        await expect(page.getByRole('complementary')).toHaveCount(0);
        const search = drawer.getByRole('button', { name: 'Search documentation', exact: true });
        await expect(search).toBeFocused();
        await expect(drawer.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute(
          'aria-current',
          'page',
        );
        await page.keyboard.press('Shift+Tab');
        await expect(drawer.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(search).toBeFocused();
        const geometry = await drawer.evaluate((element) => {
          const rectangle = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const controls = Array.from(element.querySelectorAll<HTMLElement>('button, a[href]')).map(
            (control) => {
              const rect = control.getBoundingClientRect();
              const controlStyle = getComputedStyle(control);
              return {
                text: control.textContent,
                width: rect.width,
                height: rect.height,
                fontSize: Number.parseFloat(controlStyle.fontSize),
              };
            },
          );
          const target = document.elementFromPoint(
            rectangle.x + rectangle.width / 2,
            rectangle.y + rectangle.height / 2,
          );
          return {
            x: rectangle.x,
            y: rectangle.y,
            width: rectangle.width,
            height: rectangle.height,
            viewport: { width: innerWidth, height: innerHeight },
            overflow: element.scrollWidth - element.clientWidth,
            receivesInput: target !== null && element.contains(target),
            animations: element.getAnimations().map((animation) => animation.playState),
            fontFamily: style.fontFamily,
            controls,
          };
        });
        expect(geometry.x).toBeGreaterThanOrEqual(0);
        expect(geometry.y).toBeGreaterThanOrEqual(0);
        expect(geometry.x + geometry.width).toBeLessThanOrEqual(geometry.viewport.width);
        expect(geometry.y + geometry.height).toBeLessThanOrEqual(geometry.viewport.height);
        expect(geometry.overflow).toBeLessThanOrEqual(0);
        expect(geometry.receivesInput).toBe(true);
        expect(geometry.animations).not.toContain('running');
        for (const control of geometry.controls) {
          expect(control.height, control.text ?? 'Documentation control').toBeGreaterThanOrEqual(
            44,
          );
          expect(control.fontSize, control.text ?? 'Documentation control').toBeGreaterThanOrEqual(
            14,
          );
        }
        await testInfo.attach('documentation-drawer-geometry', {
          body: JSON.stringify(geometry, null, 2),
          contentType: 'application/json',
        });
        await page.screenshot({ path: testInfo.outputPath('documentation-drawer.png') });
        await page.keyboard.press('Escape');
        await expect(drawer).toHaveCount(0);
        await expectNavigationRestored();
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.setViewportSize({ width: 1440, height: 900 });
        await expect(drawer).toHaveCount(0);
        await expectNavigationRestored();
        const desktopSearch = navigation.getByRole('button', {
          name: 'Search documentation',
          exact: true,
        });
        await expect(desktopSearch).toBeFocused();
        await expect(page.locator('body')).not.toHaveCSS('pointer-events', 'none');
        await page.setViewportSize(viewport);
        await trigger.click();
        const guide = drawer.getByRole('link', {
          name: 'Search: the web, your chats and the help centre',
          exact: true,
        });
        await expect(guide).toHaveAttribute('href', helpArticlePath('search'));
        await guide.click();
        await expect(page).toHaveURL(new RegExp(`${helpArticlePath('search')}$`, 'u'));
        await expect(drawer).toHaveCount(0);
        await expectNavigationRestored();
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: 'Search: the web, your chats and the help centre',
            exact: true,
          }),
        ).toBeVisible();
      });
    });
  }
}

for (const article of [
  { id: 'install-the-cli', kind: 'code', selector: '.dx-code-block pre' },
  { id: 'keyboard-shortcuts', kind: 'table', selector: '.dx-table' },
] as const) {
  test.describe(`documentation ${article.kind} printing`, () => {
    test.use({ colorScheme: 'dark', storageState: { cookies: [], origins: [] } });

    test('keeps complete article text flowing and removes interactive chrome', async ({
      page,
    }, testInfo) => {
      expect((await page.goto(helpArticlePath(article.id)))?.status()).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      const content = page.locator('.dx-prose');
      const articleText = () =>
        content.evaluate((element) => {
          const clone = element.cloneNode(true);
          if (!(clone instanceof HTMLElement)) throw new Error('Article text cannot be inspected');
          clone.querySelectorAll('button').forEach((button) => button.remove());
          return clone.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
        });
      const before = await articleText();
      expect(before.length).toBeGreaterThan(0);
      const support = page.getByRole('button', { name: 'Open product support', exact: true });
      await expect(support).toBeVisible();
      await page.emulateMedia({ media: 'print' });
      await expect(page.getByRole('banner')).not.toBeVisible();
      await expect(page.getByRole('contentinfo')).not.toBeVisible();
      await expect(page.getByRole('complementary')).not.toBeVisible();
      await expect(page.locator('.dx-actions')).not.toBeVisible();
      await expect(support).not.toBeVisible();
      await expect(content).toBeVisible();
      expect(await articleText()).toBe(before);
      const printable = page.locator(article.selector);
      await expect(printable.first()).toBeVisible();
      for (const element of await printable.all()) {
        await expect(element).toHaveCSS('overflow-x', 'visible');
        await expect(element).toHaveCSS('overflow-y', 'visible');
        expect(
          await element.evaluate((node) => node.scrollWidth - node.clientWidth),
        ).toBeLessThanOrEqual(0);
        if (article.kind === 'code') {
          await expect(element).toHaveCSS('white-space', 'pre-wrap');
          await expect(element).toHaveCSS('overflow-wrap', 'anywhere');
        } else {
          await expect(element.locator('table')).toHaveCSS('table-layout', 'fixed');
          await expect(element.locator('thead')).toHaveCSS('display', 'table-header-group');
        }
      }
      await page.screenshot({
        path: testInfo.outputPath(`documentation-print-${article.kind}.png`),
        fullPage: true,
      });
      await testInfo.attach('documentation-print-text', {
        body: await content.innerText(),
        contentType: 'text/plain',
      });
    });
  });
}

const controlsRepository = path.resolve(__dirname, '../../..');
const controlsArticleId = 'local-mode';
const controlsSources = [
  'apps/web/e2e/public-docs-controls.spec.ts',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-route-inventory.ts',
  'apps/web/app/help/[slug]/page.tsx',
  'apps/web/app/docs/doc-index.ts',
  'apps/web/features/docs/components/DocsToc.tsx',
  'apps/web/features/docs/components/DocsShell.tsx',
  'apps/web/features/docs/components/DocsArticleBody.tsx',
  'apps/web/features/docs/components/DocsCodeBlock.tsx',
  'apps/web/features/docs/components/CopyPageButton.tsx',
  'apps/web/features/docs/components/DocsNavigation.tsx',
  'apps/web/features/docs/lib/docs-nav.ts',
  'apps/web/features/docs/docs.css',
  'apps/web/features/marketing/components/system/MarketingHeader.tsx',
  'apps/web/features/marketing/components/system/ActiveNavLink.tsx',
  'apps/web/features/marketing/components/system/MarketingMobileNav.tsx',
  'apps/web/features/marketing/components/system/NavGroup.tsx',
  'apps/web/features/marketing/components/system/HeaderScrollState.tsx',
  'apps/web/features/marketing/components/system/system.css',
  'packages/ui/design-tokens/src/tailwind.css',
  'apps/web/lib/support/help-articles.ts',
  'apps/web/lib/support/doc-topics.ts',
  'apps/web/scripts/lib/support-frontmatter.mjs',
  'apps/web/scripts/build-support-corpus.mjs',
  'apps/web/lib/support/agent/corpus/index.ts',
  'apps/web/lib/support/agent/corpus.generated.json',
  'apps/web/lib/marketing-constants.ts',
  'apps/web/lib/catalog-scopes.ts',
  'apps/web/content/support/glossary.md',
  'apps/web/content/support/managed-cloud.md',
  'apps/web/package.json',
  'pnpm-lock.yaml',
  'apps/web/shared/lib/cookie-consent.ts',
  `apps/web/content/support/${controlsArticleId}.md`,
];
const controlsRun = `${Date.now()}-${process.pid}`;
const controlsFonts: PublicExpectedFont[] = [{ cssVariable: '--font-geist-sans' }];

interface ControlsEvidence {
  successful: boolean;
  scope: string;
  sourceStart: Record<string, string>;
  sourceEnd?: Record<string, string>;
  steps: { label: string; data: unknown }[];
  error?: string;
  contextsClosed: boolean;
}

type ControlsWitness =
  | 'hash without scroll'
  | 'covered anchor'
  | 'unpainted heading'
  | 'duplicate current links'
  | 'frozen current section'
  | 'copied label without write'
  | 'stale clipboard'
  | 'URL without destination content';

function controlsFixtureHTML(
  witness: ControlsWitness,
  negative: boolean,
  destination = false,
  paint = 'opacity',
) {
  const hidden =
    witness === 'unpainted heading' && negative
      ? paint === 'opacity'
        ? 'opacity:0'
        : paint === 'fill'
          ? '-webkit-text-fill-color:transparent'
          : 'mask-image:linear-gradient(transparent,transparent)'
      : '';
  const headerHeight = witness === 'covered anchor' && negative ? 160 : 64;
  const configuration = JSON.stringify({ witness, negative, destination, paint });
  return `<!doctype html><html><head><style>
    @font-face{font-family:FixtureFont;src:url('/__docs-controls-fixture-font.woff2') format('woff2');font-weight:400}
    *{box-sizing:border-box}body{margin:0;font:16px FixtureFont;background:white;color:black}
    header{position:fixed;inset:0 0 auto;height:${headerHeight}px;background:#eee;z-index:10;padding:16px}
    main{max-width:720px;margin-inline:32px;padding-block-start:110px}h1{font-size:34px}
    h2{font-size:26px;scroll-margin-top:88px;margin:0}section{height:700px}#two{${hidden}}
    #contents{position:fixed;right:32px;top:190px}#contents a{display:block;padding:8px}
    button{font:inherit;padding:12px}#pager{padding-block:48px}a{color:#000}
    </style></head><body><header>Fixture sticky header</header>
    <nav id="contents" aria-label="On this page"><a href="#one" aria-current="true">Section one</a><a href="#two">Section two</a><a href="#three">Section three</a></nav>
    <main><article><h1>${destination ? 'Destination article' : 'Original article'}</h1>
    <button type="button" id="copy">Copy page</button><p role="status" id="status"></p>
    <div class="dx-prose"><section><h2 id="one"><a class="dx-section-link" href="#one">Section one</a></h2><p>${destination ? 'Destination' : 'Original'} first section body.</p></section>
    <section><h2 id="two"><a class="dx-section-link" href="#two">Section two</a></h2><p>${destination ? 'Destination' : 'Original'} second section body.</p></section>
    <section><h2 id="three"><a class="dx-section-link" href="#three">Section three</a></h2><p>${destination ? 'Destination' : 'Original'} third section body.</p></section></div>
    <nav id="pager" aria-label="More guides"><a href="/__docs-controls-witness/next">Next Destination article</a></nav></article></main>
    <script>
      const configuration=${configuration};
      const headings=Array.from(document.querySelectorAll('h2'));
      const links=Array.from(document.querySelectorAll('#contents a'));
      const mark=()=>{
        if(configuration.witness==='frozen current section' && configuration.negative)return;
        const passed=headings.filter(heading=>heading.getBoundingClientRect().top<=96);
        const active=passed.at(-1)??headings[0];
        links.forEach(link=>{if(link.hash==='#'+active.id)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current')});
        if(configuration.witness==='duplicate current links'&&configuration.negative)links[0].setAttribute('aria-current','true');
      };
      addEventListener('scroll',mark);addEventListener('hashchange',mark);
      links.forEach(link=>link.addEventListener('click',event=>{
        if(configuration.witness==='hash without scroll'&&configuration.negative){event.preventDefault();history.pushState({},'',link.hash)}
      }));
      document.querySelector('#copy').addEventListener('click',async()=>{
        if(!configuration.negative)await navigator.clipboard.writeText('# Fixture article\\n\\nComplete Markdown.\\n');
        document.querySelector('#copy').textContent='Copied';document.querySelector('#status').textContent='Page copied';
      });
      document.querySelector('#pager a').addEventListener('click',event=>{
        if(configuration.witness==='URL without destination content'&&configuration.negative){event.preventDefault();history.pushState({},'',event.currentTarget.getAttribute('href'));if(configuration.paint==='body')document.querySelector('h1').textContent='Destination article'}
      });
    </script></body></html>`;
}

for (const witness of [
  'hash without scroll',
  'covered anchor',
  'unpainted heading',
  'duplicate current links',
  'frozen current section',
  'copied label without write',
  'stale clipboard',
  'URL without destination content',
] as const) {
  test(`Docs native control witness rejects ${witness}`, async ({ browser, baseURL }, info) => {
    test.setTimeout(120_000);
    if (!baseURL) throw new Error('Native fixtures require the configured localhost origin');
    const origin = new URL(baseURL).origin;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname))
      throw new Error('Controlled fixtures require a local origin');
    const contexts: BrowserContext[] = [];
    const evidence: ControlsEvidence = {
      successful: false,
      scope:
        'Isolated fulfilled controls fixture; two repetitions of positive and negative native witnesses, no public-page acceptance',
      sourceStart: controlsSnapshot(),
      steps: [],
      contextsClosed: false,
    };
    try {
      for (let repetition = 0; repetition < 2; repetition += 1) {
        const context = await controlsContext(
          browser,
          { width: 1440, height: 900 },
          'light',
          contexts,
        );
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
        const page = await context.newPage();
        const font = readFileSync(
          path.join(
            controlsRepository,
            'apps/web/public/fonts/opendyslexic/OpenDyslexic-Regular.woff2',
          ),
        );
        await context.route('**/__docs-controls-fixture-font.woff2', (route) =>
          route.fulfill({ status: 200, contentType: 'font/woff2', body: font }),
        );
        let negative = false;
        let paint = 'opacity';
        await context.route('**/__docs-controls-witness/**', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: controlsFixtureHTML(
              witness,
              negative,
              new URL(route.request().url()).pathname.endsWith('/next'),
              paint,
            ),
          }),
        );
        const variants = [
          { negative: false, paint: 'opacity' },
          ...(witness === 'unpainted heading'
            ? ['opacity', 'fill', 'mask'].map((effect) => ({ negative: true, paint: effect }))
            : witness === 'URL without destination content'
              ? ['identity', 'body'].map((effect) => ({ negative: true, paint: effect }))
              : [{ negative: true, paint: 'opacity' }]),
        ];
        for (const variant of variants) {
          negative = variant.negative;
          paint = variant.paint;
          expect((await page.goto(`${origin}/__docs-controls-witness/one`))?.status()).toBe(200);
          const fonts: PublicExpectedFont[] = [{ family: 'FixtureFont' }];
          const mainFont = await measurePublicFontProof(page, page.getByRole('main'), fonts, 8_000);
          evidence.steps.push({
            label: `fixture ${repetition} ${negative ? 'negative' : 'positive'} ${paint}`,
            data: { mainFont },
          });
          expect(mainFont.fontCoverageGaps).toEqual([]);
          if (witness === 'copied label without write' || witness === 'stale clipboard') {
            const privateClipboard = await controlsPrivateClipboard(page);
            let restored = false;
            try {
              const expected = '# Fixture article\n\nComplete Markdown.\n';
              const sentinel = `fixture-sentinel:${controlsRun}:${info.testId}:${repetition}:${negative}`;
              if (witness === 'stale clipboard') {
                await page.evaluate((value) => navigator.clipboard.writeText(value), expected);
                const matchingBeforeSeed = await controlsClipboardExact(page, expected);
                evidence.steps.push({
                  label: 'stale equality premise',
                  data: { matchingBeforeSeed },
                });
                expect(matchingBeforeSeed).toBe(true);
              }
              await page.evaluate((value) => navigator.clipboard.writeText(value), sentinel);
              const seeded = await controlsClipboardExact(page, sentinel);
              const initiallyExpected = await controlsClipboardExact(page, expected);
              evidence.steps.push({
                label: 'independent clipboard baseline',
                data: { seeded, initiallyExpected },
              });
              expect(seeded).toBe(true);
              expect(initiallyExpected).toBe(false);
              await controlsTab(page, page.getByRole('button', { name: 'Copy page', exact: true }));
              await page.keyboard.press('Enter');
              await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeFocused();
              await expect(page.getByRole('status')).toHaveText('Page copied');
              const exact = await controlsClipboardExact(page, expected);
              evidence.steps.push({
                label: 'native clipboard witness',
                data: { repetition, negative, labelClaimsCopied: true, exact },
              });
              expect(exact).toBe(!negative);
            } finally {
              try {
                restored = await privateClipboard.evaluate((state) => state.restore());
                evidence.steps.push({
                  label: 'fixture private clipboard restoration',
                  data: { restored },
                });
                expect(restored).toBe(true);
              } finally {
                await privateClipboard.dispose();
              }
            }
          } else if (witness === 'URL without destination content') {
            await controlsTab(
              page,
              page
                .getByRole('navigation', { name: 'More guides', exact: true })
                .getByRole('link', { name: 'Next Destination article', exact: true }),
            );
            await page.keyboard.press('Enter');
            await expect(page).toHaveURL(`${origin}/__docs-controls-witness/next`);
            await controlsStable(page);
            const identity = await controlsIdentity(
              page,
              origin,
              '/__docs-controls-witness/next',
              'Destination article',
              ['one', 'two', 'three'],
              controlsRenderBody(
                '## Section one\n\nDestination first section body.\n\n## Section two\n\nDestination second section body.\n\n## Section three\n\nDestination third section body.',
              ),
            );
            evidence.steps.push({
              label: 'native destination witness',
              data: { repetition, negative, identity },
            });
            expect(identity.valid).toBe(!negative);
          } else if (witness === 'frozen current section') {
            const toc = page.getByRole('navigation', { name: 'On this page', exact: true });
            const third = page.getByRole('heading', {
              level: 2,
              name: 'Section three',
              exact: true,
            });
            const second = page.getByRole('heading', {
              level: 2,
              name: 'Section two',
              exact: true,
            });
            const forward = await controlsWheel(page, third);
            const forwardAnchor = await controlsAnchor(page, third, fonts);
            const forwardCurrent = await controlsCurrent(toc);
            const backward = await controlsWheel(page, second);
            const backwardAnchor = await controlsAnchor(page, second, fonts);
            const backwardCurrent = await controlsCurrent(toc);
            const tracked =
              JSON.stringify(forwardCurrent) === JSON.stringify(['#three']) &&
              JSON.stringify(backwardCurrent) === JSON.stringify(['#two']);
            evidence.steps.push({
              label: 'native temporal current witness',
              data: {
                repetition,
                negative,
                forward,
                backward,
                forwardAnchor,
                backwardAnchor,
                forwardCurrent,
                backwardCurrent,
                tracked,
              },
            });
            expect(forward.delta).toBeGreaterThan(0);
            expect(backward.delta).toBeLessThan(0);
            expect(forwardAnchor.valid).toBe(true);
            expect(backwardAnchor.valid).toBe(true);
            expect(tracked).toBe(!negative);
          } else {
            const toc = page.getByRole('navigation', { name: 'On this page', exact: true });
            const before = await controlsPosition(page);
            await toc.getByRole('link', { name: 'Section two', exact: true }).click();
            await expect(page).toHaveURL(`${origin}/__docs-controls-witness/one#two`);
            await controlsStable(page);
            const second = page.getByRole('heading', {
              level: 2,
              name: 'Section two',
              exact: true,
            });
            const anchor = await controlsAnchor(page, second, fonts);
            const current = await controlsCurrent(toc);
            evidence.steps.push({
              label: 'native anchor witness',
              data: { repetition, negative, paint, before, anchor, current },
            });
            if (witness === 'duplicate current links') {
              expect(anchor.valid).toBe(true);
              const unique = JSON.stringify(current) === JSON.stringify(['#two']);
              expect(unique).toBe(!negative);
            } else {
              expect(anchor.valid).toBe(!negative);
              if (witness === 'hash without scroll')
                expect(anchor.geometry.scroll.y !== before.y).toBe(!negative);
              if (witness === 'unpainted heading' && negative && paint !== 'mask')
                expect(anchor.geometry.clear).toBe(true);
            }
          }
          await controlsImage(
            page,
            info,
            evidence,
            `witness-${repetition}-${negative ? 'negative' : 'positive'}-${paint}`,
          );
        }
        await context.close();
      }
      evidence.successful = true;
    } catch (error) {
      evidence.error = error instanceof Error ? error.message : 'Native controls fixture failed';
      throw error;
    } finally {
      await controlsFinish(contexts, evidence, info);
    }
  });
}

function controlsSnapshot() {
  return Object.fromEntries(
    controlsSources.map((file) => [
      file,
      createHash('sha256')
        .update(readFileSync(path.join(controlsRepository, file)))
        .digest('hex'),
    ]),
  );
}

function controlsSourceMarkdown(id: string) {
  const file = path.join(controlsRepository, 'apps/web/content/support', `${id}.md`);
  const { data, body } = parseFrontmatter(readFileSync(file, 'utf8'), file);
  const resolved = interpolateFacts(body.trim(), file);
  expect(resolved).not.toMatch(/\{\{[^}]+\}\}/u);
  return {
    title: data['title']!,
    body: resolved,
    renderedBody: controlsRenderBody(resolved),
  };
}

function controlsRenderBody(markdown: string) {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      skipHtml: true,
      disallowedElements: ['img'],
      remarkPlugins: [remarkGfm],
      children: markdown,
    }),
  );
}

async function controlsBodyContract(page: Page, renderedSource: string, content: Locator) {
  await expect(content).toHaveCount(1);
  const scope = await content.elementHandle();
  if (!scope) throw new Error('Native semantic body scope is unavailable');
  try {
    return await page.evaluate(
      ({ source, scope }) => {
        const semantic = (parent: Element | DocumentFragment) => {
          const clone = parent.cloneNode(true);
          if (!(clone instanceof Element || clone instanceof DocumentFragment))
            throw new Error('Semantic body cannot be inspected');
          clone
            .querySelectorAll('.dx-code-bar, button, [role="status"]')
            .forEach((node) => node.remove());
          return Array.from(
            clone.querySelectorAll(
              'h2,h3,h4,h5,h6,p,blockquote,ul,ol,li,table,thead,tbody,tr,th,td,pre,code,hr,a:not(.dx-section-link)',
            ),
          ).map((node) => ({
            tag: node.localName === 'h3' ? 'h2' : node.localName,
            text:
              node.localName === 'pre' || node.localName === 'code'
                ? (node.textContent ?? '')
                : (node.textContent?.replace(/\s+/gu, ' ').trim() ?? ''),
            start: node.localName === 'ol' ? (node.getAttribute('start') ?? '1') : null,
            href: node.localName === 'a' ? node.getAttribute('href') : null,
            language:
              node.localName === 'code'
                ? (Array.from(node.classList).find((name) => name.startsWith('language-')) ?? null)
                : null,
            task:
              node.localName === 'li'
                ? Array.from(
                    node.querySelectorAll<HTMLInputElement>(
                      ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
                    ),
                  ).map((input) => input.checked)
                : null,
          }));
        };
        const template = document.createElement('template');
        template.innerHTML = source;
        const expected = semantic(template.content);
        const actual = semantic(scope);
        return {
          expected,
          actual,
          valid: expected.length > 0 && JSON.stringify(actual) === JSON.stringify(expected),
        };
      },
      { source: renderedSource, scope },
    );
  } finally {
    await scope.dispose();
  }
}

async function controlsHardDocument(page: Page, href: string) {
  const destination = new URL(href, page.url()).href;
  await page.goto('about:blank');
  return page.goto(destination, { waitUntil: 'domcontentloaded' });
}

test('Docs premise hard document entry requires a real response', async ({
  browser,
  baseURL,
}, info) => {
  if (!baseURL) throw new Error('Native premises require the configured localhost origin');
  const origin = new URL(baseURL).origin;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname))
    throw new Error('Controlled premises require a local origin');
  const contexts: BrowserContext[] = [];
  const evidence: ControlsEvidence = {
    successful: false,
    scope: 'Isolated fulfilled hard-document premise; no public-page acceptance',
    sourceStart: controlsSnapshot(),
    steps: [],
    contextsClosed: false,
  };
  try {
    const context = await controlsContext(browser, { width: 1440, height: 900 }, 'light', contexts);
    let documentRequests = 0;
    await context.route('**/__docs-controls-premise/hard', (route) => {
      documentRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><main><h1>Document entry premise</h1><h2 id="section">Native fragment</h2></main>',
      });
    });
    const page = await context.newPage();
    const href = `${origin}/__docs-controls-premise/hard`;
    const initial = await controlsHardDocument(page, href);
    expect(initial?.status()).toBe(200);
    const response = await controlsHardDocument(page, `${href}#section`);
    await expect(page).toHaveURL(`${href}#section`);
    evidence.steps.push({
      label: 'same document native hash response',
      data: {
        initialStatus: initial?.status() ?? null,
        status: response?.status() ?? null,
        documentRequests,
      },
    });
    expect(
      response,
      'A hard document helper must return its real document response',
    ).not.toBeNull();
    expect(response?.status()).toBe(200);
    expect(documentRequests).toBe(2);
    evidence.successful = true;
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : 'Hard-document premise failed';
    throw error;
  } finally {
    await controlsFinish(contexts, evidence, info);
  }
});

test('Docs premise rich article identity rejects stale glossary definitions', async ({
  browser,
  baseURL,
}, info) => {
  if (!baseURL) throw new Error('Native premises require the configured localhost origin');
  const origin = new URL(baseURL).origin;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname))
    throw new Error('Controlled premises require a local origin');
  const contexts: BrowserContext[] = [];
  const evidence: ControlsEvidence = {
    successful: false,
    scope: 'Isolated fulfilled canonical glossary body premise; no public-page acceptance',
    sourceStart: controlsSnapshot(),
    steps: [],
    contextsClosed: false,
  };
  try {
    const source = controlsSourceMarkdown('glossary');
    const article = getHelpArticle('glossary');
    if (!article) throw new Error('Canonical glossary premise is unavailable');
    expect(source.title).toBe(article.title);
    const sections = article.sections
      .filter((section) => section.heading)
      .map((section) => headingAnchor(section.heading ?? ''));
    const context = await controlsContext(browser, { width: 1440, height: 900 }, 'light', contexts);
    let variant: 'complete' | 'drop' | 'change' = 'complete';
    await context.route('**/__docs-controls-premise/body', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><main><article>${renderToStaticMarkup(createElement('h1', null, source.title))}<div class="dx-prose">${source.renderedBody}</div></article></main><script>
          const ids=${JSON.stringify(sections)};
          document.querySelectorAll('main h2').forEach((heading,index)=>heading.id=ids[index]);
          const variant=${JSON.stringify(variant)};
          const definitions=Array.from(document.querySelectorAll('.dx-prose p')).filter(paragraph=>paragraph.querySelector('strong'));
          if(variant==='drop')definitions.forEach(paragraph=>paragraph.remove());
          if(variant==='change')definitions.forEach(paragraph=>paragraph.textContent='Stale definition body.');
        </script>`,
      }),
    );
    const page = await context.newPage();
    const href = `${origin}/__docs-controls-premise/body`;
    const negativeAcceptance: boolean[] = [];
    for (const next of ['complete', 'drop', 'change'] as const) {
      variant = next;
      expect((await page.goto(href))?.status()).toBe(200);
      const completeBody = await controlsBodyContract(
        page,
        source.renderedBody,
        page.locator('.dx-prose'),
      );
      const identity = await controlsIdentity(
        page,
        origin,
        href,
        source.title,
        sections,
        source.renderedBody,
      );
      evidence.steps.push({ label: `canonical body ${variant}`, data: { completeBody, identity } });
      expect(completeBody.valid).toBe(variant === 'complete');
      if (variant === 'complete') expect(identity.valid).toBe(true);
      else negativeAcceptance.push(identity.valid);
    }
    expect(
      negativeAcceptance,
      'Canonical body identity must reject both missing and stale definitions',
    ).toEqual([false, false]);
    evidence.successful = true;
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : 'Rich-body premise failed';
    throw error;
  } finally {
    await controlsFinish(contexts, evidence, info);
  }
});

test('Docs semantic body contract retains supported Markdown content', async ({
  browser,
  baseURL,
}, info) => {
  if (!baseURL) throw new Error('Native premises require the configured localhost origin');
  const origin = new URL(baseURL).origin;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname))
    throw new Error('Controlled premises require a local origin');
  const contexts: BrowserContext[] = [];
  const evidence: ControlsEvidence = {
    successful: false,
    scope:
      'Isolated fulfilled supported-Markdown semantic contract; no paint or public-page acceptance',
    sourceStart: controlsSnapshot(),
    steps: [],
    contextsClosed: false,
  };
  const source = controlsRenderBody(
    '## Section\n\nA **definition** with *emphasis*, `inline()` and a [source](/source).\n\n> Quoted content.\n\n3. First numbered item\n4. Second numbered item\n\n- [x] Completed task\n- [ ] Pending task\n\n| Column | Value |\n| --- | --- |\n| Row | Complete |\n\n```js\nconst value = 1;\n```\n\n---\n',
  );
  try {
    const context = await controlsContext(browser, { width: 1440, height: 900 }, 'light', contexts);
    await context.route('**/__docs-controls-premise/semantic', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `<!doctype html><main><h1>Supported Markdown fixture</h1><div class="dx-prose">${source}</div></main>`,
      }),
    );
    const page = await context.newPage();
    for (const variant of [
      'complete',
      'prose',
      'list order',
      'list start',
      'task',
      'table',
      'code text',
      'code language',
      'link',
      'empty',
    ] as const) {
      expect((await page.goto(`${origin}/__docs-controls-premise/semantic`))?.status()).toBe(200);
      await page.locator('.dx-prose').evaluate((body, corruption) => {
        if (corruption === 'prose') body.querySelector('strong')!.textContent = 'Stale';
        if (corruption === 'list order')
          body.querySelector('ol')!.append(body.querySelector('ol li')!);
        if (corruption === 'list start') body.querySelector('ol')!.setAttribute('start', '1');
        if (corruption === 'task') body.querySelector<HTMLInputElement>('input')!.checked = false;
        if (corruption === 'table') body.querySelector('td')!.textContent = 'Stale';
        if (corruption === 'code text')
          body.querySelector('pre code')!.textContent = 'const value = 2;\n';
        if (corruption === 'code language')
          body.querySelector('pre code')!.className = 'language-ts';
        if (corruption === 'link') body.querySelector('a')!.setAttribute('href', '/stale');
        if (corruption === 'empty') body.replaceChildren();
      }, variant);
      const body = await controlsBodyContract(page, source, page.locator('.dx-prose'));
      evidence.steps.push({ label: `supported source body ${variant}`, data: body });
      expect(body.valid, variant).toBe(variant === 'complete');
    }
    const emptySource = await controlsBodyContract(page, '', page.locator('.dx-prose'));
    evidence.steps.push({ label: 'empty source cannot certify empty body', data: emptySource });
    expect(emptySource.valid).toBe(false);
    evidence.successful = true;
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : 'Supported-Markdown contract failed';
    throw error;
  } finally {
    await controlsFinish(contexts, evidence, info);
  }
});

function controlsArticle() {
  const article = getHelpArticle(controlsArticleId);
  if (!article) throw new Error('Canonical controls article is unavailable');
  const file = path.join(controlsRepository, 'apps/web/content/support', `${article.id}.md`);
  const { data, body } = parseFrontmatter(readFileSync(file, 'utf8'), file);
  expect(data['title']).toBe(article.title);
  expect(body).not.toMatch(/\{\{[^}]+\}\}/u);
  const sections = article.sections
    .filter((section) => section.heading)
    .map((section) => ({ title: section.heading ?? '', id: headingAnchor(section.heading ?? '') }));
  expect(sections.length).toBeGreaterThanOrEqual(3);
  expect(new Set(sections.map((section) => section.id)).size).toBe(sections.length);
  const generatedBody = article.sections
    .map((section) => (section.heading ? `## ${section.heading}\n\n${section.text}` : section.text))
    .join('\n\n');
  expect(generatedBody, 'Selected fixture must preserve the original Markdown body').toBe(
    body.trim(),
  );
  return { article, sections, markdown: `# ${data['title']}\n\n${body.trim()}\n` };
}

function controlsRoute(baseURL: string, href: string) {
  const destination = new URL(href, baseURL);
  const route = getPublicRouteInventory().routes.find(
    (candidate) => candidate.path === destination.pathname,
  );
  if (!route || !route.expectedHttpStatuses?.length || !route.expectedFinalPath)
    throw new Error(`Unmeasured canonical Docs route: ${destination.pathname}`);
  return {
    ...route,
    path: href,
    expectedOrigin: destination.origin,
    expectedQuery: destination.search,
  };
}

async function controlsTheme(page: Page, theme: 'light' | 'dark') {
  const state = await page.evaluate(() => ({
    marker: document.documentElement.dataset['theme'],
    light: document.documentElement.classList.contains('light'),
    dark: document.documentElement.classList.contains('dark'),
    scheme: getComputedStyle(document.documentElement).colorScheme,
    prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  }));
  expect(state.marker).toBe(theme);
  expect(state[theme]).toBe(true);
  expect(state[theme === 'light' ? 'dark' : 'light']).toBe(false);
  expect(state.scheme.split(/\s+/u)).toContain(theme);
  expect(state.prefersDark).toBe(theme === 'dark');
  expect(state.reduced).toBe(true);
  return state;
}

async function controlsLoad(
  page: Page,
  baseURL: string,
  href: string,
  evidence: ControlsEvidence,
  label: string,
) {
  const readiness = await settlePublicPage(page, controlsRoute(baseURL, href), {
    expectedFonts: controlsFonts,
  });
  evidence.steps.push({ label, data: readiness });
  expect(readiness.expectedFontProof).not.toBeNull();
  expect(readiness.fontCoverageGaps).toEqual([]);
}

async function controlsNecessary(page: Page, evidence: ControlsEvidence) {
  const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
  await expect(banner).toHaveCount(1);
  await expect(banner).toBeVisible();
  evidence.steps.push({ label: 'default cookie banner', data: { visible: true } });
  await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
  await expect(banner).toHaveCount(0);
  const record = parseCookieConsentRecord(
    await page.evaluate((key) => localStorage.getItem(key), COOKIE_CONSENT_STORAGE_KEY),
  );
  evidence.steps.push({ label: 'actual Necessary only choice', data: record });
  expect(isCookieConsentCurrent(record)).toBe(true);
  expect(record?.necessary).toBe(NECESSARY_ONLY_PREFERENCES.necessary);
  expect(record?.analytics).toBe(NECESSARY_ONLY_PREFERENCES.analytics);
}

async function controlsPosition(page: Page) {
  return page.evaluate(() => ({ x: scrollX, y: scrollY, width: innerWidth, height: innerHeight }));
}

async function controlsStable(page: Page) {
  const read = () =>
    page.evaluate(() => ({
      scroll: [scrollX, scrollY],
      viewport: [innerWidth, innerHeight],
      document: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      headings: Array.from(document.querySelectorAll('main h1, main h2')).map((element) => {
        const rect = element.getBoundingClientRect();
        return [element.id, rect.x, rect.y, rect.width, rect.height];
      }),
    }));
  let previous = '';
  let consecutive = 0;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    const geometry = await read();
    const signature = JSON.stringify(geometry);
    consecutive = signature === previous ? consecutive + 1 : 0;
    if (consecutive >= 2) return geometry;
    previous = signature;
  }
  throw new Error('Docs geometry did not settle within 32 native frame samples');
}

async function controlsAnchor(page: Page, heading: Locator, fonts = controlsFonts) {
  const measureGeometry = () =>
    heading.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const rectangles = Array.from(range.getClientRects()).filter(
        (rect) => rect.width > 0 && rect.height > 0,
      );
      const boxes = rectangles.map((rect) => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      }));
      const header = document.querySelector('header');
      const headerBox = header?.getBoundingClientRect();
      const headerVisible =
        header &&
        getComputedStyle(header).display !== 'none' &&
        getComputedStyle(header).visibility === 'visible';
      const headerBottom = headerVisible && headerBox ? Math.max(0, headerBox.bottom) : 0;
      const clips: {
        tag: string;
        x: number;
        y: number;
        right: number;
        bottom: number;
        horizontal: boolean;
        vertical: boolean;
      }[] = [];
      const unsupported: string[] = [];
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (style.clipPath !== 'none' || style.maskImage !== 'none')
          unsupported.push(`${ancestor.localName}:nonrectangular-clip`);
        if (
          ancestor instanceof HTMLElement &&
          ancestor !== document.body &&
          ancestor !== document.documentElement
        ) {
          const horizontal = ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowX);
          const vertical = ['hidden', 'clip', 'scroll', 'auto'].includes(style.overflowY);
          if (horizontal || vertical) {
            const rect = ancestor.getBoundingClientRect();
            const x = rect.x + ancestor.clientLeft;
            const y = rect.y + ancestor.clientTop;
            clips.push({
              tag: ancestor.localName,
              x,
              y,
              right: x + ancestor.clientWidth,
              bottom: y + ancestor.clientHeight,
              horizontal,
              vertical,
            });
          }
        }
      }
      const hits = boxes.map((rect) => {
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return {
          owned: target !== null && (target === element || element.contains(target)),
          target: target?.localName ?? null,
        };
      });
      return {
        id: element.id,
        margin: Number.parseFloat(getComputedStyle(element).scrollMarginTop),
        boxes,
        headerBottom,
        viewport: { width: innerWidth, height: innerHeight },
        scroll: { x: scrollX, y: scrollY },
        clips,
        unsupported,
        hits,
        clear:
          boxes.length > 0 &&
          unsupported.length === 0 &&
          boxes.every(
            (rect) =>
              rect.x >= 0 &&
              rect.x + rect.width <= innerWidth + 0.5 &&
              rect.y >= headerBottom &&
              rect.y + rect.height <= innerHeight &&
              clips.every(
                (clip) =>
                  (!clip.horizontal ||
                    (rect.x >= clip.x - 0.5 && rect.x + rect.width <= clip.right + 0.5)) &&
                  (!clip.vertical ||
                    (rect.y >= clip.y - 0.5 && rect.y + rect.height <= clip.bottom + 0.5)),
              ),
          ) &&
          hits.every((hit) => hit.owned),
      };
    });
  const geometryBefore = await measureGeometry();
  let fontProof: Awaited<ReturnType<typeof measurePublicFontProof>> | null = null;
  let fontError: string | null = null;
  try {
    fontProof = await measurePublicFontProof(page, heading, fonts, 8_000);
  } catch (error) {
    fontError = error instanceof Error ? error.message : 'Unmeasured heading font';
  }
  await controlsStable(page);
  const geometry = await measureGeometry();
  return {
    geometryBefore,
    geometry,
    fontProof,
    fontError,
    valid: geometry.clear && fontProof !== null && fontProof.fontCoverageGaps.length === 0,
  };
}

async function controlsCurrent(toc: Locator) {
  return toc.getByRole('link', { includeHidden: true }).evaluateAll((links) =>
    links
      .filter((link) => link.getAttribute('aria-current') === 'true')
      .map((link) => link.getAttribute('href'))
      .sort(),
  );
}

async function controlsPrivateClipboard(page: Page) {
  return page.evaluateHandle(async () => {
    const prior = await navigator.clipboard.readText();
    return {
      restore: async () => {
        await navigator.clipboard.writeText(prior);
        return (await navigator.clipboard.readText()) === prior;
      },
    };
  });
}

async function controlsReleaseClipboard(
  handle: JSHandle<{ restore: () => Promise<boolean> }> | null,
  page: Page | null,
  alreadyRestored: boolean,
  evidence: ControlsEvidence,
) {
  let restored = alreadyRestored;
  let failure: unknown;
  try {
    if (handle && !restored && page && !page.isClosed())
      restored = await handle.evaluate((state) => state.restore());
    evidence.steps.push({
      label: 'private clipboard restoration',
      data: { readable: handle !== null, restored },
    });
    if (handle) expect(restored).toBe(true);
  } catch (error) {
    failure = error;
  }
  try {
    await handle?.dispose();
  } catch (error) {
    failure ??= error;
  }
  if (failure) {
    evidence.successful = false;
    evidence.error = 'Private clipboard restoration or disposal failed';
    throw failure;
  }
}

async function controlsClipboardExact(page: Page, expected: string) {
  return page.evaluate(
    (value) => navigator.clipboard.readText().then((actual) => actual === value),
    expected,
  );
}

async function controlsIdentity(
  page: Page,
  baseURL: string,
  href: string,
  title: string,
  sections: string[],
  renderedSourceBody: string,
) {
  const body = await controlsBodyContract(
    page,
    renderedSourceBody,
    page.getByRole('main').locator('.dx-prose'),
  );
  const state = {
    url: page.url(),
    titles: await page.getByRole('main').getByRole('heading', { level: 1 }).allTextContents(),
    sections: await page
      .getByRole('main')
      .getByRole('heading', { level: 2 })
      .evaluateAll((headings) => headings.map((heading) => heading.id)),
    paragraphs: (await page.getByRole('main').locator('p').allTextContents())
      .map((text) => text.replace(/\s+/gu, ' ').trim())
      .filter(Boolean),
  };
  return {
    ...state,
    body,
    valid:
      body.valid &&
      state.url === new URL(href, baseURL).href &&
      state.titles.length === 1 &&
      state.titles[0] === title &&
      JSON.stringify(state.sections) === JSON.stringify(sections),
  };
}

async function controlsTab(page: Page, target: Locator) {
  await expect(target).toHaveCount(1);
  for (let step = 1; step <= 250; step += 1) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expect(target).toBeVisible();
      const focus = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          focusVisible: element.matches(':focus-visible'),
          outline: style.outline,
          outlineOffset: style.outlineOffset,
          boxShadow: style.boxShadow,
        };
      });
      expect(
        focus.focusVisible,
        'Required control must be reached with native keyboard focus',
      ).toBe(true);
      return { steps: step, nativeKeyboard: true, focus };
    }
  }
  throw new Error('Native Tab sequence did not reach the required Docs control');
}

async function controlsWheel(page: Page, heading: Locator) {
  const start = await controlsPosition(page);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const state = await heading.evaluate((element) => ({
      top: element.getBoundingClientRect().top,
      margin: Number.parseFloat(getComputedStyle(element).scrollMarginTop),
    }));
    const headerBottom = await page
      .getByRole('banner')
      .evaluate((element) => Math.max(0, element.getBoundingClientRect().bottom));
    if (!Number.isFinite(state.margin) || state.margin <= headerBottom + 1)
      throw new Error('No usable native section tracking interval');
    const target = (headerBottom + state.margin) / 2;
    if (Math.abs(state.top - target) <= 2) {
      const end = await controlsPosition(page);
      return { start, end, attempts: attempt, delta: end.y - start.y };
    }
    const prose = await heading.evaluate(
      (element) => element.closest('article')?.getBoundingClientRect().toJSON() ?? null,
    );
    if (!prose) throw new Error('Native wheel target has no article');
    await page.mouse.move(Math.min(prose.x + 80, start.width - 20), start.height / 2);
    await page.mouse.wheel(0, Math.max(-300, Math.min(300, state.top - target)));
    await controlsStable(page);
  }
  throw new Error('Native wheel could not reach the required section boundary');
}

async function controlsImage(
  page: Page,
  info: TestInfo,
  evidence: ControlsEvidence,
  label: string,
) {
  const directory = path.join(
    controlsRepository,
    '.tmp/codex-public-site/baseline/docs-controls-native',
    controlsRun,
    info.testId.replace(/[^a-zA-Z0-9-]/gu, '_'),
  );
  mkdirSync(directory, { recursive: true });
  const before = await controlsPosition(page);
  const file = path.join(directory, `${label}.png`);
  const bytes = await page.screenshot({ path: file });
  const after = await controlsPosition(page);
  evidence.steps.push({
    label: `capture ${label}`,
    data: { file, before, after, sha256: createHash('sha256').update(bytes).digest('hex') },
  });
  expect(after).toEqual(before);
}

async function controlsFinish(
  contexts: BrowserContext[],
  evidence: ControlsEvidence,
  info: TestInfo,
) {
  try {
    const failures: string[] = [];
    for (const context of contexts) {
      try {
        await context.close();
      } catch {
        failures.push('Context did not close');
      }
    }
    evidence.contextsClosed = failures.length === 0;
    expect(failures, 'All owned Docs contexts must close').toEqual([]);
    evidence.sourceEnd = controlsSnapshot();
    expect(evidence.sourceEnd, 'Declared control source changed during native proof').toEqual(
      evidence.sourceStart,
    );
  } catch (error) {
    evidence.successful = false;
    evidence.error = error instanceof Error ? error.message : 'Docs cleanup or source proof failed';
    throw error;
  } finally {
    const directory = path.join(
      controlsRepository,
      '.tmp/codex-public-site/baseline/docs-controls-native',
      controlsRun,
      info.testId.replace(/[^a-zA-Z0-9-]/gu, '_'),
    );
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(directory, 'report.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    await info.attach('docs-controls-native-evidence', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });
  }
}

async function controlsContext(
  browser: Browser,
  viewport: { width: number; height: number },
  colorScheme: 'light' | 'dark',
  contexts: BrowserContext[],
) {
  const context = await browser.newContext({
    viewport,
    colorScheme,
    reducedMotion: 'reduce',
    locale: 'en-US',
    storageState: { cookies: [], origins: [] },
  });
  contexts.push(context);
  const storage = await context.storageState();
  expect(storage).toEqual({ cookies: [], origins: [] });
  return context;
}

async function controlsDestination(
  page: Page,
  baseURL: string,
  link: DocsNavLink,
  evidence: ControlsEvidence,
) {
  const route = controlsRoute(baseURL, link.href);
  const article = getHelpArticle(link.href.split('/').at(-1) ?? '');
  if (!article) throw new Error('Pager destination has no canonical article');
  await expect(page).toHaveURL(new URL(link.href, baseURL).href);
  const main = page.getByRole('main');
  await expect(
    main.getByRole('heading', { level: 1, name: article.title, exact: true }),
  ).toBeVisible();
  const sections = article.sections
    .filter((section) => section.heading)
    .map((section) => headingAnchor(section.heading ?? ''));
  await expect
    .poll(() =>
      main
        .getByRole('heading', { level: 2 })
        .evaluateAll((headings) => headings.map((heading) => heading.id)),
    )
    .toEqual(sections);
  const source = controlsSourceMarkdown(article.id);
  expect(source.title).toBe(article.title);
  const identity = await controlsIdentity(
    page,
    baseURL,
    link.href,
    article.title,
    sections,
    source.renderedBody,
  );
  evidence.steps.push({ label: 'pager rendered source identity', data: identity });
  expect(identity.valid, 'Pager URL must agree with the rendered canonical article').toBe(true);
  const response = await page.request.get(new URL(link.href, baseURL).href);
  const transport = {
    kind: 'independent public-document request; native navigation may use client cache',
    status: response.status(),
    url: response.url(),
  };
  evidence.steps.push({ label: 'pager independent document transport', data: transport });
  try {
    expect(route.expectedHttpStatuses).toContain(transport.status);
    expect(transport.url).toBe(new URL(link.href, baseURL).href);
  } finally {
    await response.dispose();
  }
  const paragraph = main.locator('.dx-prose p').first();
  await expect(paragraph).toHaveCount(1);
  await expect(paragraph).toBeVisible();
  const paragraphPaint = await measurePublicFontProof(page, paragraph, controlsFonts);
  expect(paragraphPaint.fontCoverageGaps).toEqual([]);
  const proof = await measurePublicFontProof(page, main, controlsFonts);
  expect(proof.fontCoverageGaps).toEqual([]);
  const geometry = await controlsStable(page);
  return {
    href: link.href,
    title: article.title,
    sections,
    identity,
    transport,
    paragraphPaint,
    proof,
    geometry,
  };
}

for (const viewport of [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`Docs sections and native current section at ${viewport.width}px ${theme}`, async ({
      browser,
      baseURL,
    }, info) => {
      test.setTimeout(180_000);
      if (!baseURL) throw new Error('Docs controls require an explicit baseURL');
      const contexts: BrowserContext[] = [];
      const evidence: ControlsEvidence = {
        successful: false,
        scope:
          'Native desktop TOC and phone disclosure, section selection, scroll tracking and hard deep links; dev server, reduced motion, real Necessary only choice',
        sourceStart: controlsSnapshot(),
        steps: [],
        contextsClosed: false,
      };
      try {
        const { article, sections } = controlsArticle();
        const href = helpArticlePath(article.id);
        const context = await controlsContext(browser, viewport, theme, contexts);
        const page = await context.newPage();
        await controlsLoad(page, baseURL, href, evidence, 'default readiness');
        await controlsNecessary(page, evidence);
        await controlsLoad(page, baseURL, href, evidence, 'necessary readiness');
        evidence.steps.push({ label: 'theme', data: await controlsTheme(page, theme) });
        await expect(
          page.getByRole('heading', { level: 1, name: article.title, exact: true }),
        ).toBeVisible();
        const toc = page.getByRole('navigation', {
          name: 'On this page',
          exact: true,
          includeHidden: true,
        });
        const desktop = viewport.width === 1440;
        await expect(toc).toBeVisible();
        await expect(toc).toHaveCount(1);
        const toggle = toc.getByRole('button', {
          name: /^On this page (?:Show|Hide)$/u,
          includeHidden: true,
        });
        const list = toc.getByRole('list', { includeHidden: true });
        await expect(list).toHaveCount(1);
        await expect(toggle).toHaveAttribute('aria-controls', (await list.getAttribute('id'))!);
        expect(
          await toc
            .getByRole('link', { includeHidden: true })
            .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
        ).toEqual(sections.map((section) => `#${section.id}`));
        if (desktop) {
          await expect(toggle).toBeHidden();
          await expect(list).toBeVisible();
        } else {
          await expect(toggle).toBeVisible();
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await expect(list).toBeHidden();
          const focus = await controlsTab(page, toggle);
          evidence.steps.push({ label: 'phone TOC native disclosure focus', data: focus });
          expect(focus.focus.width).toBeGreaterThanOrEqual(44);
          expect(focus.focus.height).toBeGreaterThanOrEqual(44);
          await page.keyboard.press('Space');
          await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          await expect(list).toBeVisible();
          await controlsTab(page, toc.getByRole('link').first());
          await page.keyboard.press('Escape');
          await expect(toggle).toBeFocused();
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await expect(list).toBeHidden();
          await page.keyboard.press('Enter');
          await expect(toggle).toHaveAttribute('aria-expanded', 'true');
          await expect(list).toBeVisible();
          const touchTargets = await toc.getByRole('link').evaluateAll((links) =>
            links.map((link) => {
              const rect = link.getBoundingClientRect();
              return { href: link.getAttribute('href'), width: rect.width, height: rect.height };
            }),
          );
          evidence.steps.push({ label: 'phone TOC expanded native targets', data: touchTargets });
          for (const target of touchTargets) {
            expect(target.width).toBeGreaterThanOrEqual(44);
            expect(target.height).toBeGreaterThanOrEqual(44);
          }
        }
        for (const section of sections) {
          const heading = page.getByRole('heading', { level: 2, name: section.title, exact: true });
          await expect(heading).toHaveAttribute('id', section.id);
          await expect(
            heading.getByRole('link', { name: section.title, exact: true }),
          ).toHaveAttribute('href', `#${section.id}`);
        }
        const selected = sections[1]!;
        const selectedHeading = page.getByRole('heading', {
          level: 2,
          name: selected.title,
          exact: true,
        });
        const selectedLink = toc.getByRole('link', { name: selected.title, exact: true });
        const before = await controlsPosition(page);
        evidence.steps.push({
          label: 'native anchor focus',
          data: await controlsTab(page, selectedLink),
        });
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(new URL(`${href}#${selected.id}`, baseURL).href);
        await controlsStable(page);
        const anchor = await controlsAnchor(page, selectedHeading);
        evidence.steps.push({ label: 'native selected anchor', data: { before, anchor } });
        expect(anchor.valid).toBe(true);
        expect(anchor.geometry.scroll.y).not.toBe(before.y);
        if (!desktop) {
          await expect(toggle).toHaveAttribute('aria-expanded', 'false');
          await expect(list).toBeHidden();
        }
        {
          await expect.poll(() => controlsCurrent(toc)).toEqual([`#${selected.id}`]);
          const following = sections[2]!;
          const followingHeading = page.getByRole('heading', {
            level: 2,
            name: following.title,
            exact: true,
          });
          const forward = await controlsWheel(page, followingHeading);
          evidence.steps.push({ label: 'native forward wheel', data: forward });
          expect(forward.delta).toBeGreaterThan(0);
          const followingAnchor = await controlsAnchor(page, followingHeading);
          evidence.steps.push({ label: 'forward anchor', data: followingAnchor });
          expect(followingAnchor.valid).toBe(true);
          await expect.poll(() => controlsCurrent(toc)).toEqual([`#${following.id}`]);
          const backward = await controlsWheel(page, selectedHeading);
          evidence.steps.push({ label: 'native backward wheel', data: backward });
          expect(backward.delta).toBeLessThan(0);
          await expect.poll(() => controlsCurrent(toc)).toEqual([`#${selected.id}`]);
          if (desktop) {
            await page.setViewportSize({ width: 390, height: 844 });
            await controlsStable(page);
            await expect(toc).toBeVisible();
            await expect(toggle).toBeVisible();
            await expect(toggle).toHaveAttribute('aria-expanded', 'false');
            await expect(list).toBeHidden();
            await toggle.click();
            await expect(list).toBeVisible();
            await page.setViewportSize(viewport);
            await controlsStable(page);
            await expect(toc).toBeVisible();
            await expect(toggle).toBeHidden();
            await expect(list).toBeVisible();
            await toc.getByRole('link', { name: selected.title, exact: true }).click();
            const resized = await controlsAnchor(page, selectedHeading);
            evidence.steps.push({ label: 'desktop restored after phone resize', data: resized });
            expect(resized.valid).toBe(true);
            await expect.poll(() => controlsCurrent(toc)).toEqual([`#${selected.id}`]);
          }
        }
        await controlsImage(page, info, evidence, 'selected-anchor');
        const deepContext = await controlsContext(browser, viewport, theme, contexts);
        const deepPage = await deepContext.newPage();
        await controlsLoad(deepPage, baseURL, href, evidence, 'fresh deep context readiness');
        await controlsNecessary(deepPage, evidence);
        const deepSection = sections[2]!;
        const deepRoute = controlsRoute(baseURL, `${href}#${deepSection.id}`);
        const response = await controlsHardDocument(deepPage, deepRoute.path);
        evidence.steps.push({
          label: 'hard deep-link response',
          data: { status: response?.status() ?? null, url: deepPage.url() },
        });
        expect(response).not.toBeNull();
        expect(deepRoute.expectedHttpStatuses).toContain(response?.status());
        await expect(deepPage).toHaveURL(new URL(deepRoute.path, baseURL).href);
        const deepHeading = deepPage.getByRole('heading', {
          level: 2,
          name: deepSection.title,
          exact: true,
        });
        await expect(deepHeading).toBeVisible();
        await controlsStable(deepPage);
        const deep = await controlsAnchor(deepPage, deepHeading);
        evidence.steps.push({ label: 'fresh hard deep-link heading', data: deep });
        expect(deep.valid).toBe(true);
        evidence.steps.push({ label: 'deep theme', data: await controlsTheme(deepPage, theme) });
        const deepToc = deepPage.getByRole('navigation', { name: 'On this page', exact: true });
        await expect(deepToc).toBeVisible();
        await expect.poll(() => controlsCurrent(deepToc)).toEqual([`#${deepSection.id}`]);
        if (!desktop) {
          const deepToggle = deepToc.getByRole('button', {
            name: 'On this page Show',
            exact: true,
          });
          await expect(deepToggle).toHaveAttribute('aria-expanded', 'false');
          await expect(deepToc.getByRole('list', { includeHidden: true })).toBeHidden();
        }
        await controlsImage(deepPage, info, evidence, 'hard-deep-link');
        evidence.successful = true;
      } catch (error) {
        evidence.error = error instanceof Error ? error.message : 'Docs section proof failed';
        throw error;
      } finally {
        await controlsFinish(contexts, evidence, info);
      }
    });

    test(`Docs exact clipboard and reciprocal pager at ${viewport.width}px ${theme}`, async ({
      browser,
      baseURL,
    }, info) => {
      test.setTimeout(240_000);
      if (!baseURL) throw new Error('Docs controls require an explicit baseURL');
      const contexts: BrowserContext[] = [];
      const evidence: ControlsEvidence = {
        successful: false,
        scope:
          'Native clipboard and reciprocal pager only, dev server, reduced motion; clipboard values remain private',
        sourceStart: controlsSnapshot(),
        steps: [],
        contextsClosed: false,
      };
      let page: Page | null = null;
      let privateClipboard: JSHandle<{ restore: () => Promise<boolean> }> | null = null;
      let clipboardRestored = false;
      try {
        const { article, markdown } = controlsArticle();
        const href = helpArticlePath(article.id);
        const context = await controlsContext(browser, viewport, theme, contexts);
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
          origin: new URL(baseURL).origin,
        });
        page = await context.newPage();
        await controlsLoad(page, baseURL, href, evidence, 'default readiness');
        await controlsNecessary(page, evidence);
        await controlsLoad(page, baseURL, href, evidence, 'necessary readiness');
        evidence.steps.push({ label: 'theme', data: await controlsTheme(page, theme) });
        privateClipboard = await controlsPrivateClipboard(page);
        const sentinel = `docs-control-sentinel:${controlsRun}:${info.testId}`;
        expect(sentinel === markdown).toBe(false);
        await page.evaluate((value) => navigator.clipboard.writeText(value), sentinel);
        evidence.steps.push({
          label: 'clipboard sentinel',
          data: {
            initialized: await page.evaluate(
              (value) => navigator.clipboard.readText().then((text) => text === value),
              sentinel,
            ),
            distinctFromExpected: true,
          },
        });
        expect(
          await page.evaluate(
            (value) => navigator.clipboard.readText().then((text) => text === value),
            sentinel,
          ),
        ).toBe(true);
        const copy = page.getByRole('button', { name: 'Copy page', exact: true });
        evidence.steps.push({ label: 'copy native focus', data: await controlsTab(page, copy) });
        await page.keyboard.press('Enter');
        await expect(page.getByRole('status').filter({ hasText: 'Page copied' })).toHaveText(
          'Page copied',
        );
        await expect(page.getByRole('button', { name: 'Copied', exact: true })).toBeFocused();
        const exact = await page.evaluate(
          (value) => navigator.clipboard.readText().then((text) => text === value),
          markdown,
        );
        evidence.steps.push({
          label: 'clipboard result',
          data: {
            exactSourceMarkdown: exact,
            nativeReadback: true,
            expectedBytes: Buffer.byteLength(markdown),
          },
        });
        expect(exact, 'Native clipboard must exactly equal source Markdown').toBe(true);
        await expect(page.getByRole('button', { name: 'Copy page', exact: true })).toBeFocused();
        await controlsImage(page, info, evidence, 'copy-page');
        clipboardRestored = await privateClipboard.evaluate((state) => state.restore());
        expect(clipboardRestored, 'Private clipboard restoration before pager navigation').toBe(
          true,
        );
        await privateClipboard.dispose();
        privateClipboard = null;
        evidence.steps.push({
          label: 'private clipboard handle released before pager navigation',
          data: { restored: clipboardRestored, released: true },
        });
        const neighbours = docsNeighbours(docsNavGroups(), href);
        if (!neighbours.previous || !neighbours.next)
          throw new Error('Controls article must have both canonical neighbours');
        const original: DocsNavLink = { href, title: article.title };
        for (const [direction, neighbour, reciprocal] of [
          ['Next', neighbours.next, 'Previous'],
          ['Previous', neighbours.previous, 'Next'],
        ] as const) {
          const pager = page.getByRole('navigation', { name: 'More guides', exact: true });
          const link = pager.getByRole('link', {
            name: `${direction} ${neighbour.title}`,
            exact: true,
          });
          await expect(link).toHaveAttribute('href', neighbour.href);
          evidence.steps.push({
            label: `${direction} native focus`,
            data: await controlsTab(page, link),
          });
          await page.keyboard.press('Enter');
          evidence.steps.push({
            label: `${direction} destination`,
            data: await controlsDestination(page, baseURL, neighbour, evidence),
          });
          const reverse = page
            .getByRole('navigation', { name: 'More guides', exact: true })
            .getByRole('link', { name: `${reciprocal} ${original.title}`, exact: true });
          await expect(reverse).toHaveAttribute('href', original.href);
          evidence.steps.push({
            label: `${reciprocal} native reciprocal focus`,
            data: await controlsTab(page, reverse),
          });
          await page.keyboard.press('Enter');
          evidence.steps.push({
            label: `${reciprocal} returned article`,
            data: await controlsDestination(page, baseURL, original, evidence),
          });
        }
        await controlsImage(page, info, evidence, 'reciprocal-pager');
        evidence.successful = true;
      } catch (error) {
        evidence.error =
          error instanceof Error ? error.message : 'Docs clipboard or pager proof failed';
        throw error;
      } finally {
        try {
          await controlsReleaseClipboard(privateClipboard, page, clipboardRestored, evidence);
        } finally {
          privateClipboard = null;
          await controlsFinish(contexts, evidence, info);
        }
      }
    });
  }
}
