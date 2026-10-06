import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { expect, test, type BrowserContext, type Locator, type TestInfo } from '@playwright/test';
import { modelsCatalog } from '@agiworkforce/types';
import { BYOK_PROVIDER_IDS } from '../app/byok/byok-providers';
import { GATEWAY_PROVIDER_IDS } from '../lib/catalog-scopes';
import { CLI_LOCAL_RUNTIMES } from '../lib/marketing-constants';
import { measurePublicFontProof, settlePublicPage } from './lib/public-page-readiness';
import { evaluatePublicTextContrast } from './lib/public-text-contrast';
import { scanPublicTypography } from './lib/public-typography';

const cases = [
  { width: 320, theme: 'dark' },
  { width: 390, theme: 'light' },
  { width: 1440, theme: 'dark' },
  { width: 1440, theme: 'light' },
] as const;
const models = Object.values(modelsCatalog.models);
const cloud = BYOK_PROVIDER_IDS.flatMap((id) => {
  const provider = modelsCatalog.providers[id];
  return provider
    ? [
        {
          id,
          label: provider.label,
          defaultModel: provider.defaultModel ?? '',
          modelCount: models.filter((model) => model.provider === id).length,
          kind: GATEWAY_PROVIDER_IDS.has(id) ? 'gateway' : 'cloud',
        },
      ]
    : [];
});
const local = CLI_LOCAL_RUNTIMES.names.map((label) => ({
  id: label.toLowerCase(),
  label,
  defaultModel: '',
  modelCount: 0,
  kind: 'local',
}));
const owners = [
  { label: 'Cloud providers and gateways', tiles: cloud, mono: true },
  { label: 'Local runtimes', tiles: local, mono: false },
] as const;
const sourceFiles = [
  'apps/web/app/providers/page.tsx',
  'apps/web/app/byok/byok-providers.ts',
  'apps/web/lib/catalog-scopes.ts',
  'apps/web/lib/marketing-constants.ts',
  'apps/web/features/marketing/components/system/ProviderGrid.tsx',
  'apps/web/features/marketing/components/system/index.ts',
  'apps/web/features/marketing/components/system/system.css',
  'apps/web/features/marketing/components/system/page-header.css',
  'apps/web/features/marketing/components/system/public-reference.css',
  'apps/web/app/layout.tsx',
  'apps/web/app/globals.css',
  'packages/contracts/types/src/index.ts',
  'packages/contracts/types/src/model-catalog.ts',
  'packages/contracts/types/src/models.json',
  'packages/ui/design-tokens/src/foundation.css',
  'packages/ui/design-tokens/src/chat.css',
  'packages/ui/design-tokens/src/tailwind.css',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
] as const;

test.describe.configure({ retries: 0 });
test.setTimeout(90_000);

async function sourcePins(info: TestInfo) {
  const root = resolve(info.project.testDir, '../../..');
  return Promise.all(
    [...sourceFiles, relative(root, info.file)].map(async (path) => {
      const bytes = await readFile(resolve(root, path));
      return {
        path,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }),
  );
}

async function nativeFields(frame: Locator) {
  return frame.evaluate((root) => {
    if (!/^en(?:-|$)/i.test(document.documentElement.lang))
      throw new Error('Provider word ranges require the current English route');
    const rect = (value: DOMRect) => ({
      left: value.left,
      right: value.right,
      top: value.top,
      bottom: value.bottom,
      width: value.width,
      height: value.height,
    });
    const textKeys = new WeakMap<Text, string>();
    const sourceWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let sourceIndex = 0;
    while (sourceWalker.nextNode()) {
      const node = sourceWalker.currentNode as Text;
      if (
        !node.parentElement ||
        node.parentElement.closest('script,style,noscript,textarea,option')
      )
        continue;
      if (!node.data.replace(/\s+/g, ' ').trim()) continue;
      textKeys.set(node, `text:${++sourceIndex}`);
    }
    const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
    const words = new Intl.Segmenter('en', { granularity: 'word' });
    const cards = [...root.querySelectorAll(':scope > li.agi-ds-provider')].map((card) => {
      const field = (selector: string, required = true) => {
        const matches = card.querySelectorAll(selector);
        if (!required && matches.length === 0) return null;
        if (matches.length !== 1) throw new Error(`Provider field is not unique: ${selector}`);
        const element = matches[0]!;
        const nodes = [...element.childNodes];
        if (nodes.length !== 1 || nodes[0]!.nodeType !== Node.TEXT_NODE)
          throw new Error(`Provider field no longer has one native text node: ${selector}`);
        const node = nodes[0] as Text;
        const css = getComputedStyle(element);
        const ranges = (low: number, high: number) => {
          const range = document.createRange();
          range.setStart(node, low);
          range.setEnd(node, high);
          return [...range.getClientRects()]
            .filter((box) => box.width > 0 && box.height > 0)
            .map(rect);
        };
        return {
          selector,
          sourceKey: textKeys.get(node),
          raw: node.data,
          box: rect(element.getBoundingClientRect()),
          rects: ranges(0, node.length),
          transform: css.textTransform,
          whiteSpace: css.whiteSpace,
          overflowWrap: css.overflowWrap,
          wordBreak: css.wordBreak,
          textOverflow: css.textOverflow,
          overflowX: css.overflowX,
          overflowY: css.overflowY,
          units: [...graphemes.segment(node.data)].map((part) => ({
            text: part.segment,
            low: part.index,
            high: part.index + part.segment.length,
            rects: ranges(part.index, part.index + part.segment.length),
          })),
          words: [...words.segment(node.data)]
            .filter((part) => part.isWordLike)
            .map((part) => ({
              text: part.segment,
              rects: ranges(part.index, part.index + part.segment.length),
            })),
        };
      };
      const box = card.getBoundingClientRect();
      const css = getComputedStyle(card);
      return {
        kind: card.getAttribute('data-kind'),
        box: rect(box),
        content: {
          left: box.left + parseFloat(css.borderLeftWidth) + parseFloat(css.paddingLeft),
          right: box.right - parseFloat(css.borderRightWidth) - parseFloat(css.paddingRight),
          top: box.top + parseFloat(css.borderTopWidth) + parseFloat(css.paddingTop),
          bottom: box.bottom - parseFloat(css.borderBottomWidth) - parseFloat(css.paddingBottom),
        },
        mark: field(':scope > .agi-ds-provider-mark'),
        name: field(':scope > .agi-ds-provider-name'),
        meta: field(':scope > .agi-ds-provider-meta'),
        defaultModel: field(':scope > .agi-ds-provider-default', false),
        kindLabel: field(':scope > .agi-ds-provider-foot > span:first-child'),
        billing: field(':scope > .agi-ds-provider-foot > span:last-child'),
        footerChildren: card.querySelectorAll(':scope > .agi-ds-provider-foot > span').length,
      };
    });
    return {
      connected: root.isConnected,
      label: root.getAttribute('aria-label'),
      box: rect(root.getBoundingClientRect()),
      cards,
      listOverflow: root.scrollWidth - root.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

type Box = { left: number; right: number; top: number; bottom: number };
function within(inner: Box, outer: Box) {
  expect(Object.values(inner).every(Number.isFinite)).toBe(true);
  expect(Object.values(outer).every(Number.isFinite)).toBe(true);
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - 0.05);
  expect(inner.right).toBeLessThanOrEqual(outer.right + 0.05);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - 0.05);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 0.05);
}

for (const { width, theme } of cases) {
  test(`providers-after-${width}-${theme}`, async ({ browser }, info) => {
    const sourcesBefore = await sourcePins(info);
    const evidence: Record<string, unknown> = { width, theme, sourcesBefore, owners: [] };
    const failures: Error[] = [];
    let context: BrowserContext | undefined;
    const retain = (error: unknown) =>
      failures.push(error instanceof Error ? error : new Error(String(error)));
    try {
      const baseURL = info.project.use.baseURL;
      if (typeof baseURL !== 'string') throw new Error('Provider proof needs configured baseURL');
      const origin = new URL(baseURL);
      if (
        origin.protocol !== 'http:' ||
        !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
      )
        throw new Error('Provider proof is restricted to the local public server');
      context = await browser.newContext({
        baseURL,
        viewport: { width, height: 900 },
        colorScheme: theme,
        reducedMotion: 'reduce',
        storageState: { cookies: [], origins: [] },
      });
      const page = await context.newPage();
      evidence['readiness'] = await settlePublicPage(page, {
        path: '/providers',
        expectedHttpStatuses: [200],
        expectedFinalPath: '/providers',
        expectedOrigin: origin.origin,
        expectedQuery: '',
      });
      const banner = page.getByRole('region', { name: 'Cookie consent', exact: true });
      await expect(banner).toBeVisible();
      await banner.getByRole('button', { name: 'Necessary only', exact: true }).click();
      await expect(banner).toHaveCount(0);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.locator('main ul.agi-ds-providers')).toHaveCount(owners.length);
      evidence['theme'] = await page.evaluate(() => ({
        marker: document.documentElement.dataset['theme'],
        light: document.documentElement.classList.contains('light'),
        dark: document.documentElement.classList.contains('dark'),
        scheme: getComputedStyle(document.documentElement).colorScheme,
        prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      }));
      expect(evidence['theme']).toEqual({
        marker: theme,
        light: theme === 'light',
        dark: theme === 'dark',
        scheme: theme,
        prefersDark: theme === 'dark',
      });
      for (const owner of owners) {
        const record: Record<string, unknown> = { label: owner.label, expectedTiles: owner.tiles };
        (evidence['owners'] as unknown[]).push(record);
        const frame = page.getByRole('list', { name: owner.label, exact: true });
        await expect(frame).toHaveCount(1);
        await frame.scrollIntoViewIfNeeded();
        await expect(frame).toBeVisible();
        const font = await measurePublicFontProof(page, frame, [
          { cssVariable: '--font-geist-sans' },
          ...(owner.mono ? [{ cssVariable: '--font-geist-mono' }] : []),
        ]);
        record['font'] = font;
        expect(font.fontCoverageGaps).toEqual([]);
        const selector = `main ul.agi-ds-providers[aria-label=${JSON.stringify(owner.label)}]`;
        const typography = await page.evaluate(scanPublicTypography, {
          pageType: 'marketing' as const,
          pathname: '/providers',
          scopeSelector: selector,
        });
        record['typography'] = typography;
        const reading = await nativeFields(frame);
        record['native'] = reading;
        record['underFloorTextNodes'] = typography.samples.filter((sample) =>
          typography.findings.some(
            (finding) =>
              ['declared-size-floor', 'rendered-size-floor'].includes(finding.kind) &&
              finding.selector === sample.selector &&
              finding.text === sample.text,
          ),
        ).length;
        if (!typography.canvasColor) throw new Error('Provider contrast canvas is unresolved');
        const contrast = evaluatePublicTextContrast(typography.samples, typography.canvasColor);
        record['contrast'] = contrast;
        expect(typography.findings).toEqual([]);
        expect(typography.unmeasured).toEqual([]);
        expect(typography.excluded).toEqual([]);
        expect(typography.scrollContainers).toEqual([]);
        expect(contrast.findings).toEqual([]);
        expect(contrast.unmeasured).toEqual([]);
        expect(contrast.coverage.measured).toBe(typography.samples.length);
        expect(reading.connected).toBe(true);
        expect(reading.label).toBe(owner.label);
        expect(reading.cards).toHaveLength(owner.tiles.length);
        expect(new Set(owner.tiles.map((tile) => tile.label)).size).toBe(owner.tiles.length);
        expect(reading.box.left).toBeGreaterThanOrEqual(0);
        expect(reading.box.right).toBeLessThanOrEqual(width);
        expect(reading.listOverflow).toBeLessThanOrEqual(1);
        expect(reading.documentOverflow).toBeLessThanOrEqual(1);
        const samples = new Map(typography.samples.map((sample) => [sample.sourceKey, sample]));
        const fieldKeys: string[] = [];
        for (const [index, tile] of owner.tiles.entries()) {
          const card = reading.cards[index]!;
          expect(card.name?.raw).toBe(tile.label);
          expect(card.mark?.raw).toBe(tile.label.slice(0, 1));
          expect(card.kind).toBe(tile.kind);
          expect(card.footerChildren).toBe(2);
          if (tile.modelCount > 0) {
            const count = /^(\d+) models?$/.exec(card.meta?.raw ?? '');
            expect(count).not.toBeNull();
            expect(Number(count![1])).toBe(tile.modelCount);
          } else expect(card.meta?.raw).toBe('Lists its own models');
          expect(card.defaultModel?.raw ?? '').toBe(tile.defaultModel);
          expect(Boolean(card.defaultModel)).toBe(Boolean(tile.defaultModel));
          within(card.box, reading.box);
          const fields = [
            { value: card.mark, minimum: 17, ordinary: false },
            { value: card.name, minimum: 17, ordinary: true },
            { value: card.meta, minimum: 17, ordinary: true },
            { value: card.kindLabel, minimum: 17, ordinary: true },
            { value: card.billing, minimum: 17, ordinary: true },
            ...(card.defaultModel
              ? [{ value: card.defaultModel, minimum: 15, ordinary: false }]
              : []),
          ];
          for (const { value, minimum, ordinary } of fields) {
            if (!value?.sourceKey)
              throw new Error('Native provider field has no canonical source key');
            fieldKeys.push(value.sourceKey);
            const sample = samples.get(value.sourceKey);
            if (!sample)
              throw new Error('Native provider field was not sampled by canonical typography');
            expect(sample.kind).toBe('text');
            expect(sample.text).toBe(value.raw.replace(/\s+/g, ' ').trim());
            expect(sample.role).toBe(value === card.defaultModel ? 'code' : 'body');
            expect(sample.renderedSize).not.toBeNull();
            expect(sample.renderedSize!).toBeGreaterThanOrEqual(minimum - 0.05);
            expect(value.transform).toBe('none');
            expect(value.textOverflow).toBe('clip');
            expect(value.overflowX).toBe('visible');
            expect(value.overflowY).toBe('visible');
            expect(value.rects.length).toBeGreaterThan(0);
            for (const unit of value.units.filter((unit) => /\S/u.test(unit.text))) {
              expect(unit.rects.length).toBeGreaterThan(0);
              for (const box of unit.rects) {
                within(box, value.box);
                within(box, card.content);
              }
            }
            if (ordinary) {
              expect(value.words.length).toBeGreaterThan(0);
              for (const word of value.words) {
                expect(word.rects.length).toBeGreaterThan(0);
                const first = word.rects[0]!;
                expect(
                  word.rects.every(
                    (box) => Math.min(box.bottom, first.bottom) - Math.max(box.top, first.top) > 1,
                  ),
                  `Provider ordinary word crosses native line bands: ${word.text}`,
                ).toBe(true);
              }
            } else if (value === card.defaultModel) {
              expect(sample.mono).toBe(true);
              expect(value.whiteSpace).toBe('normal');
              expect(value.overflowWrap).toBe('anywhere');
              expect(value.wordBreak).toBe('normal');
            }
          }
        }
        expect(fieldKeys.length).toBe(
          5 * owner.tiles.length + owner.tiles.filter((tile) => tile.defaultModel).length,
        );
        expect(new Set(fieldKeys).size).toBe(fieldKeys.length);
        expect([...samples.keys()].sort()).toEqual([...fieldKeys].sort());
        expect(typography.coverage.textNodes).toBe(fieldKeys.length);
        expect(typography.coverage.paintedTextNodes).toBe(fieldKeys.length);
        expect(record['underFloorTextNodes']).toBe(0);
        const cards = frame.locator(':scope > li.agi-ds-provider');
        for (const [edge, card] of [
          ['first', cards.first()],
          ['last', cards.last()],
        ] as const) {
          await card.scrollIntoViewIfNeeded();
          await expect(card).toBeVisible();
          await info.attach(
            `providers-${owner.mono ? 'cloud' : 'local'}-${edge}-${width}-${theme}.png`,
            {
              body: await page.screenshot({ fullPage: false }),
              contentType: 'image/png',
            },
          );
        }
      }
    } catch (error) {
      retain(error);
    } finally {
      if (context) {
        try {
          await context.close();
          evidence['contextClosed'] = true;
        } catch (error) {
          retain(error);
          evidence['contextClosed'] = false;
        }
      }
      try {
        const sourcesAfter = await sourcePins(info);
        evidence['sourcesAfter'] = sourcesAfter;
        expect(sourcesAfter, 'Declared provider sources changed during this case').toEqual(
          sourcesBefore,
        );
      } catch (error) {
        retain(error);
      }
      evidence['errors'] = failures.map((error) => ({
        name: error.name,
        message: error.message,
        stack: error.stack,
      }));
      await info.attach(`providers-after-${width}-${theme}.json`, {
        body: Buffer.from(JSON.stringify(evidence, null, 2)),
        contentType: 'application/json',
      });
    }
    if (failures.length) throw new AggregateError(failures, 'Provider after proof failed');
  });
}
