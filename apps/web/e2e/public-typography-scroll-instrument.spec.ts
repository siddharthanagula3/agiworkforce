import { expect, test, type Page } from '@playwright/test';
import { scanPublicTypography } from './lib/public-typography';
import { measurePublicTypographyWithScroll } from './lib/public-typography-scroll';

const OPTIONS = { pageType: 'marketing', pathname: '/fixture' } as const;
const STYLE = `
  :root { --font-geist-sans:Arial; --font-geist-mono:"Courier New"; color-scheme:light; }
  body { margin:0; font-family:var(--font-geist-sans); font-size:16px; color:black; background:white; }
  span { font-family:var(--font-geist-mono); font-size:15px; white-space:nowrap; }
  #frame { width:240px; overflow:auto; }
  #wide { width:720px; display:flex; justify-content:space-between; }
`;
const RECEIPTS =
  '<div id="frame"><div id="wide"><span id="first">First receipt</span><span id="last">Last receipt</span></div></div>';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

async function fixture(page: Page, markup = RECEIPTS, css = '') {
  await page.setContent(
    `<html lang="en"><head><style>${STYLE}${css}</style></head><body>${markup}</body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
}

test('proves every required fragment and retains the pending initial state as provenance', async ({
  page,
}) => {
  await fixture(page);
  const result = await measurePublicTypographyWithScroll(page, OPTIONS);
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
  expect(result.scrollProof.states.length).toBeGreaterThan(1);
  expect(result.scrollProof.states[0]!.report.unmeasured.map((issue) => issue.kind)).toContain(
    'unobserved-scroll-state',
  );
  expect(result.scrollProof.sources.every((source) => source.complete)).toBe(true);
  expect(
    result.samples.every((sample) => !sample.paintUnmeasured.includes('unobserved-scroll-state')),
  ).toBe(true);
  expect(result.scrollProof.restored).toBe(true);
  expect(await page.evaluate(() => document.getElementById('frame')!.scrollLeft)).toBe(0);
});

test('unions partial UTF-16 ranges when a whole text node never fits at one position', async ({
  page,
}) => {
  await fixture(
    page,
    `<div id="frame"><div id="wide"><span>${'A'.repeat(90)}</span></div></div>`,
    '#wide { width:900px; }',
  );
  const result = await measurePublicTypographyWithScroll(page, OPTIONS);
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
  const source = result.scrollProof.sources[0]!;
  expect(source.requiredRanges).toEqual([[0, 90]]);
  expect(source.visibleRanges).toEqual([[0, 90]]);
  expect(source.complete).toBe(true);
  expect(
    result.scrollProof.states.every(
      (state) =>
        state.report.scrollCoverage[0]!.visibleRanges[0]?.[1] !== 90 ||
        state.report.scrollCoverage[0]!.visibleRanges[0]?.[0] !== 0,
    ),
  ).toBe(true);
});

test('nested scrollports require Cartesian positions along their ancestry chain', async ({
  page,
}) => {
  await fixture(
    page,
    '<div id="outer"><div class="space"></div><div id="frame"><div id="wide"><span>First receipt</span><span>Last receipt</span></div></div><div class="space"></div></div>',
    '#outer { width:240px; height:120px; overflow:auto; } .space { height:200px; }',
  );
  const result = await measurePublicTypographyWithScroll(page, OPTIONS);
  expect(result.findings).toEqual([]);
  expect(result.unmeasured).toEqual([]);
  expect(result.scrollProof.sources.every((source) => source.complete)).toBe(true);
  const outer = result.scrollContainers.find((port) => port.selector === '#outer')!;
  const inner = result.scrollContainers.find((port) => port.selector === '#frame')!;
  expect(
    result.scrollProof.states.some(
      (state) =>
        state.actual.find((port) => port.key === outer.key)!.y > 0 &&
        state.actual.find((port) => port.key === inner.key)!.x > 0,
    ),
  ).toBe(true);
});

test('a bounded sweep remains a failure and restores both ports and the window', async ({
  page,
}) => {
  await fixture(page, `${RECEIPTS}<div id="space"></div>`, '#space { height:2000px; }');
  await page.evaluate(() => {
    document.getElementById('frame')!.scrollLeft = 125;
    window.scrollTo({ top: 300, behavior: 'instant' });
  });
  const result = await measurePublicTypographyWithScroll(page, OPTIONS, { maximumStates: 1 });
  expect(result.unmeasured.map((issue) => issue.kind)).toContain('scroll-state-budget');
  expect(result.unmeasured.map((issue) => issue.kind)).toContain('incomplete-scroll-coverage');
  expect(result.scrollProof.planComplete).toBe(false);
  expect(result.scrollProof.restored).toBe(true);
  expect(
    await page.evaluate(() => ({
      port: document.getElementById('frame')!.scrollLeft,
      window: scrollY,
    })),
  ).toEqual({ port: 125, window: 300 });
});

test('coverage does not erase font failures or unsupported generated text', async ({ page }) => {
  await fixture(
    page,
    `${RECEIPTS}<button id="generated"></button>`,
    '#first { font-size:12px; } #generated { font:16px Arial; } #generated::before { content:"Generated label"; }',
  );
  const result = await measurePublicTypographyWithScroll(page, OPTIONS);
  expect(result.findings.map((issue) => issue.kind)).toContain('declared-size-floor');
  expect(result.unmeasured.map((issue) => issue.kind)).toContain('generated-text-geometry');
  expect(result.unmeasured.map((issue) => issue.kind)).not.toContain('unobserved-scroll-state');
});

test('source text drift cannot produce covered or clean results', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() =>
    document.getElementById('frame')!.addEventListener(
      'scroll',
      () => {
        (document.getElementById('first')!.firstChild as Text).data = 'Changed receipt';
      },
      { once: true },
    ),
  );
  const result = await measurePublicTypographyWithScroll(page, OPTIONS);
  expect(result.unmeasured.map((issue) => issue.kind)).toContain('scroll-source-drift');
  expect(
    result.scrollProof.sources.find((source) => source.sourceText === 'First receipt')?.complete,
  ).toBe(false);
});

test('DOM index drift is rejected and original connected ports are restored safely', async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() =>
    document.getElementById('frame')!.addEventListener(
      'scroll',
      () => {
        document.body.prepend(document.createElement('div'));
      },
      { once: true },
    ),
  );
  const result = await measurePublicTypographyWithScroll(page, OPTIONS);
  expect(result.unmeasured.map((issue) => issue.kind)).toContain('scroll-dom-index-drift');
  expect(result.scrollProof.sources.every((source) => !source.complete)).toBe(true);
  expect(result.scrollProof.restored).toBe(true);
  expect(await page.evaluate(() => document.getElementById('frame')!.scrollLeft)).toBe(0);
});

test('port topology drift remains explicit', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() =>
    document.getElementById('frame')!.addEventListener(
      'scroll',
      () => {
        document.getElementById('frame')!.style.width = '260px';
      },
      { once: true },
    ),
  );
  const result = await measurePublicTypographyWithScroll(page, OPTIONS);
  expect(result.unmeasured.map((issue) => issue.kind)).toContain('scrollport-topology-drift');
});

test('finally restores the original scroll state after a scan throws', async ({ page }) => {
  await fixture(page);
  await page.evaluate(() => {
    document.getElementById('frame')!.scrollLeft = 125;
  });
  let scans = 0;
  const instrumented = new Proxy(page, {
    get(target, key) {
      if (key === 'evaluate')
        return (...args: Parameters<Page['evaluate']>) => {
          if (args[0] === scanPublicTypography && ++scans === 2)
            throw new Error('fixture scan failure');
          return target.evaluate(...args);
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  await expect(measurePublicTypographyWithScroll(instrumented, OPTIONS)).rejects.toThrow(
    'fixture scan failure',
  );
  expect(await page.evaluate(() => document.getElementById('frame')!.scrollLeft)).toBe(125);
});

test('empty input and invalid state budgets cannot be clean', async ({ page }) => {
  await fixture(page, '');
  const result = await measurePublicTypographyWithScroll(page, OPTIONS);
  expect(result.unmeasured.map((issue) => issue.kind)).toContain('no-painted-text');
  await expect(
    measurePublicTypographyWithScroll(page, OPTIONS, { maximumStates: 0 }),
  ).rejects.toThrow('positive integer');
});
