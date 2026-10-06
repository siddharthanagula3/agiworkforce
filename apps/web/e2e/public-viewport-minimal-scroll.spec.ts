import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import {
  assertPublicViewportCapture,
  assertPublicViewportCaptureStateEqual,
  assertPublicViewportStripCoverage,
  capturePublicViewportStrips,
  PublicViewportCaptureError,
  readPublicViewportCaptureState,
  type PublicViewportCapture,
  type PublicCaptureRect,
} from './lib/public-viewport-strip-capture';

const localRequire = createRequire(__filename);
const playwrightRequire = createRequire(localRequire.resolve('playwright/package.json'));
const corePackage = playwrightRequire.resolve('playwright-core/package.json');
const pngPackage = localRequire.resolve('pngjs/package.json');
const sourceFiles = [
  __filename,
  path.join(__dirname, 'lib/public-viewport-strip-capture.ts'),
  corePackage,
  path.join(path.dirname(corePackage), 'lib/coreBundle.js'),
  pngPackage,
  localRequire.resolve('pngjs'),
  path.join(path.dirname(pngPackage), 'lib/parser-sync.js'),
];
const pngjs = localRequire('pngjs') as {
  PNG: { sync: { read(bytes: Buffer): { width: number; height: number; data: Buffer } } };
};

type IssuedScroll = { x: number; y: number };
type ObserverRecord = {
  intersecting: boolean;
  scroll: IssuedScroll;
  rootBounds: { y: number; height: number } | null;
  targetBounds: { y: number; height: number };
};
type NativeWitness = { issued: IssuedScroll[]; observer: ObserverRecord[] };

test.use({ screenshot: 'off', video: 'off', trace: 'off' });

function fixture(height: number, triggerY: number) {
  return `<!doctype html><html><head><style>
    html, body { margin: 0; }
    body { min-height: 4000px; background: white; }
    header { position: fixed; inset: 0 0 auto; height: 64px; background: red; z-index: 100; }
    article { position: absolute; top: 800px; left: 0; width: 320px; height: 1100px; }
    figure { position: absolute; top: 200px; left: 24px; width: 272px; height: ${height}px; margin: 0; background: white; font: 16px Arial; }
    .prefix { position: absolute; top: 0; left: 0; width: 272px; height: 2px; background: black; }
    .axis { position: absolute; top: 400px; left: 16px; width: 20px; height: 20px; background: rgb(0, 128, 0); }
    .suffix { position: absolute; top: ${height - 28}px; left: 240px; width: 20px; height: 20px; background: blue; }
    .observer-trigger { position: absolute; top: ${triggerY}px; left: 0; width: 1px; height: 1px; }
  </style></head><body><header aria-label="Minimal scroll header"></header><article aria-label="Observed capture ancestor"><figure aria-label="Minimal scroll fixture"><div class="prefix"></div>${height > 420 ? '<div class="axis"></div>' : ''}<div class="suffix"></div></figure></article><div class="observer-trigger" aria-hidden="true"></div></body></html>`;
}

function sourceSnapshot() {
  return Object.fromEntries(
    sourceFiles.map((file) => [
      file,
      createHash('sha256').update(readFileSync(file)).digest('hex'),
    ]),
  );
}

async function scroll(page: Page, x: number, y: number) {
  await page.evaluate(
    async ({ x, y }) => {
      scrollTo({ left: x, top: y, behavior: 'instant' });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    },
    { x, y },
  );
}

async function nativeWitness(page: Page) {
  return page.evaluate(() => {
    const host = window as typeof window & { __minimalCaptureWitness: NativeWitness };
    return structuredClone(host.__minimalCaptureWitness);
  });
}

async function installNativeObserverAndScrollWitness(page: Page) {
  await page.evaluate(() => {
    const ancestor = document.querySelector('article');
    const trigger = document.querySelector('.observer-trigger');
    if (!ancestor || !trigger) throw new Error('Native observer fixture is incomplete');
    const host = window as typeof window & { __minimalCaptureWitness: NativeWitness };
    host.__minimalCaptureWitness = { issued: [], observer: [] };
    const nativeScroll = window.scrollTo.bind(window);
    window.scrollTo = ((first: number | ScrollToOptions, top?: number) => {
      const x = typeof first === 'number' ? first : (first.left ?? scrollX);
      const y = typeof first === 'number' ? (top ?? scrollY) : (first.top ?? scrollY);
      host.__minimalCaptureWitness.issued.push({ x, y });
      if (typeof first === 'number') nativeScroll(first, top ?? scrollY);
      else nativeScroll(first);
    }) as typeof window.scrollTo;
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target !== trigger)
            throw new Error('Native observer reported an unknown target');
          host.__minimalCaptureWitness.observer.push({
            intersecting: entry.isIntersecting,
            scroll: { x: scrollX, y: scrollY },
            rootBounds: entry.rootBounds
              ? { y: entry.rootBounds.y, height: entry.rootBounds.height }
              : null,
            targetBounds: {
              y: entry.boundingClientRect.y,
              height: entry.boundingClientRect.height,
            },
          });
          if (entry.isIntersecting) ancestor.setAttribute('data-observer-scroll', 'intersecting');
          else ancestor.removeAttribute('data-observer-scroll');
        }
      },
      { threshold: 0 },
    ).observe(trigger);
  });
  await expect.poll(async () => (await nativeWitness(page)).observer.length).toBeGreaterThan(0);
  await expect(
    page.getByRole('article', { name: 'Observed capture ancestor' }),
  ).not.toHaveAttribute('data-observer-scroll');
}

function pixel(bytes: Buffer, x: number, y: number) {
  const png = pngjs.PNG.sync.read(bytes);
  if (x < 0 || y < 0 || x >= png.width || y >= png.height)
    throw new Error('Pixel witness escapes its original PNG');
  const offset = (Math.floor(y) * png.width + Math.floor(x)) * 4;
  return [...png.data.subarray(offset, offset + 4)];
}

function coveredPixel(capture: PublicViewportCapture, x: number, y: number) {
  const strip = capture.evidence.strips.find(
    ({ documentRect: rect }) =>
      x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
  );
  if (!strip) throw new Error('Pixel witness is absent from native original coverage');
  const image = capture.images.find((item) => item.index === strip.index);
  if (!image) throw new Error('Coverage has no native original PNG');
  return pixel(image.bytes, x - strip.documentRect.x, y - strip.documentRect.y);
}

function retainCapture(
  report: Record<string, unknown>,
  images: { name: string; bytes: Buffer }[],
  capture: PublicViewportCapture,
  name: string,
) {
  report[name] = capture.evidence;
  for (const image of capture.images)
    images.push({ name: `${name}-${image.index}`, bytes: image.bytes });
}

async function controlledContext(
  browser: Browser,
  testInfo: TestInfo,
  height: number,
  triggerY: number,
  work: (
    page: Page,
    report: Record<string, unknown>,
    images: { name: string; bytes: Buffer }[],
  ) => Promise<void>,
  initialY = 936,
) {
  const sourceStart = sourceSnapshot();
  const report: Record<string, unknown> = {
    scope:
      'Local native Chromium planner controls only; no public-page acceptance or confirmed public-page mutation cause.',
    fixture: { height, triggerY, initialY },
    sourceStart,
    contextClosed: false,
  };
  const images: { name: string; bytes: Buffer }[] = [];
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  try {
    context = await browser.newContext({
      viewport: { width: 320, height: 844 },
      deviceScaleFactor: 1,
      hasTouch: true,
      reducedMotion: 'reduce',
      storageState: { cookies: [], origins: [] },
    });
    page = await context.newPage();
    await page.setContent(fixture(height, triggerY), { waitUntil: 'load', timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await scroll(page, 0, initialY);
    await installNativeObserverAndScrollWitness(page);
    await work(page, report, images);
  } catch (error) {
    if (error instanceof PublicViewportCaptureError)
      retainCapture(report, images, error.capture, 'unexpectedRejectedCapture');
    report['failure'] = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    try {
      if (page) report['native'] = await nativeWitness(page);
    } finally {
      try {
        if (context) {
          await context.close();
          report['contextClosed'] = true;
        }
      } finally {
        report['sourceEnd'] = sourceSnapshot();
        for (const image of images)
          await testInfo.attach(image.name, { body: image.bytes, contentType: 'image/png' });
        await testInfo.attach('minimal-scroll-native-evidence', {
          body: Buffer.from(JSON.stringify(report, null, 2)),
          contentType: 'application/json',
        });
        expect(report['contextClosed']).toBe(true);
        expect(report['sourceEnd']).toEqual(sourceStart);
      }
    }
  }
}

test('minimum suffix scroll retains native ancestor state and whole original coverage', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(60_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, 813, 1920, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Minimal scroll fixture' });
    const header = page.getByRole('banner', { name: 'Minimal scroll header' });
    const before = await readPublicViewportCaptureState(frame, header);
    expect(before.scroll).toEqual({ x: 0, y: 936 });
    expect(before.frame.union).toEqual({ x: 24, y: 1000, width: 272, height: 813 });
    expect(before.media.coarse).toBe(true);
    expect(before.media.touch).toBe(1);
    const capture = await capturePublicViewportStrips(page, frame, {
      stickyHeader: header,
      bounds: 'union',
      sourceFiles,
      timeout: 15_000,
    });
    retainCapture(report, images, capture, 'capture');
    assertPublicViewportCapture(capture);
    assertPublicViewportCaptureStateEqual(before, capture.evidence.after!);
    expect(capture.evidence.scrollPolicy).toBe('strips');
    expect(capture.evidence.target).toEqual({ x: 24, y: 1000, width: 272, height: 813 });
    expect(
      capture.evidence.strips.map((strip) => ({
        scroll: strip.before.scroll,
        clip: strip.clip,
        documentRect: strip.documentRect,
        safeTop: strip.safeTop,
      })),
    ).toEqual([
      {
        scroll: { x: 0, y: 936 },
        clip: { x: 24, y: 64, width: 272, height: 780 },
        documentRect: { x: 24, y: 1000, width: 272, height: 780 },
        safeTop: 64,
      },
      {
        scroll: { x: 0, y: 969 },
        clip: { x: 24, y: 779, width: 272, height: 65 },
        documentRect: { x: 24, y: 1748, width: 272, height: 65 },
        safeTop: 64,
      },
    ]);
    const native = await nativeWitness(page);
    expect(native.issued).toEqual([
      { x: 0, y: 936 },
      { x: 0, y: 969 },
      { x: 0, y: 936 },
    ]);
    expect(native.observer.some((entry) => entry.intersecting)).toBe(false);
    expect(coveredPixel(capture, 25, 1001)).toEqual([0, 0, 0, 255]);
    expect(coveredPixel(capture, 50, 1410)).toEqual([0, 128, 0, 255]);
    expect(coveredPixel(capture, 274, 1795)).toEqual([0, 0, 255, 255]);
    for (const strip of capture.evidence.strips) {
      const decoded = pngjs.PNG.sync.read(
        capture.images.find((image) => image.index === strip.index)!.bytes,
      );
      expect({ width: decoded.width, height: decoded.height }).toEqual({
        width: strip.clip.width,
        height: strip.clip.height,
      });
      expect(strip.clip.y).toBeGreaterThanOrEqual(strip.safeTop);
      expect(strip.before.media).toEqual(before.media);
    }
    const missingSuffix = structuredClone(capture.evidence);
    missingSuffix.strips.pop();
    expect(() => assertPublicViewportStripCoverage(missingSuffix)).toThrow(
      'coverage misses the suffix',
    );
    const rejectedState = structuredClone(capture.evidence);
    rejectedState.rejectedStrip = {
      index: 1,
      cursor: 1748,
      safeTop: 64,
      state: structuredClone(capture.evidence.strips[1]!.before),
      changedInvariantFields: ['fingerprints'],
      changedFingerprints: ['paint'],
    };
    expect(() => assertPublicViewportStripCoverage(rejectedState)).toThrow(
      'rejected state witness',
    );
    const invalidRejectedState = Object.assign(structuredClone(capture.evidence), {
      rejectedStrip: null,
    });
    expect(() => assertPublicViewportStripCoverage(invalidRejectedState)).toThrow(
      'rejected state witness',
    );
    const missingOriginal = { ...capture, images: capture.images.slice(0, 1) };
    expect(() => assertPublicViewportCapture(missingOriginal)).toThrow('originals are missing');
    const wrongHeader = structuredClone(capture.evidence);
    wrongHeader.strips[0]!.safeTop = 63;
    expect(() => assertPublicViewportStripCoverage(wrongHeader)).toThrow(
      'header exclusion differs',
    );
    report['rejectedEvidenceControls'] = {
      missingSuffix,
      wrongHeader,
      rejectedState,
      invalidRejectedState,
    };
  });
});

test('native unnecessary overscroll control actually mutates the observed ancestor', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(30_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, 813, 1920, async (page, report) => {
    const frame = page.getByRole('figure', { name: 'Minimal scroll fixture' });
    const header = page.getByRole('banner', { name: 'Minimal scroll header' });
    const ancestor = page.getByRole('article', { name: 'Observed capture ancestor' });
    const before = await readPublicViewportCaptureState(frame, header);
    await scroll(page, 0, 1684);
    await expect(ancestor).toHaveAttribute('data-observer-scroll', 'intersecting');
    const changed = await readPublicViewportCaptureState(frame, header);
    report['overscroll'] = { before, changed };
    expect(changed.frame).toEqual(before.frame);
    expect(changed.fingerprints.identity).toBe(before.fingerprints.identity);
    expect(changed.fingerprints.geometry).toBe(before.fingerprints.geometry);
    expect(changed.fingerprints.paint).not.toBe(before.fingerprints.paint);
    const native = await nativeWitness(page);
    expect(native.issued).toEqual([{ x: 0, y: 1684 }]);
    expect(native.observer.some((entry) => entry.intersecting && entry.scroll.y === 1684)).toBe(
      true,
    );
    expect(
      native.observer
        .filter((entry) => entry.intersecting)
        .every((entry) => entry.rootBounds?.height === 844),
    ).toBe(true);
    await scroll(page, 0, 936);
    await expect(ancestor).not.toHaveAttribute('data-observer-scroll');
    const restored = await readPublicViewportCaptureState(frame, header);
    report['restoredControl'] = restored;
    assertPublicViewportCaptureStateEqual(before, restored);
  });
});

test('a necessary native scroll mutation still rejects before its second PNG', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(60_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, 813, 1812, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Minimal scroll fixture' });
    const header = page.getByRole('banner', { name: 'Minimal scroll header' });
    const before = await readPublicViewportCaptureState(frame, header);
    const screenshotCalls: { clip: PublicCaptureRect | undefined; returned: boolean }[] = [];
    report['nativeScreenshotCalls'] = screenshotCalls;
    const trackedPage = new Proxy(page, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (property === 'screenshot') {
          return async (...args: Parameters<Page['screenshot']>) => {
            if (typeof value !== 'function') throw new Error('Native screenshot method is missing');
            const record = {
              clip: args[0]?.clip ? { ...args[0].clip } : undefined,
              returned: false,
            };
            screenshotCalls.push(record);
            const bytes = await Reflect.apply(value, target, args);
            record.returned = true;
            return bytes;
          };
        }
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try {
      const accepted = await capturePublicViewportStrips(trackedPage, frame, {
        stickyHeader: header,
        bounds: 'union',
        sourceFiles,
        timeout: 15_000,
      });
      retainCapture(report, images, accepted, 'incorrectAcceptedMutation');
      throw new Error('Necessary native scroll mutation was accepted');
    } catch (error) {
      if (!(error instanceof PublicViewportCaptureError)) throw error;
      retainCapture(report, images, error.capture, 'rejectedMutation');
      expect(error.message).toBe('Viewport strip frame changed across scrolling');
      expect(error.capture.images).toHaveLength(1);
      expect(error.capture.evidence.strips).toHaveLength(1);
      expect(screenshotCalls).toEqual([
        { clip: { x: 24, y: 64, width: 272, height: 780 }, returned: true },
      ]);
      expect(error.capture.evidence.failures).toEqual([
        'Viewport strip frame changed across scrolling',
      ]);
      expect(error.capture.evidence.restored).toBe(true);
      assertPublicViewportCaptureStateEqual(before, error.capture.evidence.after!);
      const rejected = error.capture.evidence.rejectedStrip;
      expect(rejected).toBeDefined();
      expect(rejected!.index).toBe(1);
      expect(rejected!.cursor).toBe(1748);
      expect(rejected!.safeTop).toBe(64);
      expect(rejected!.state.scroll).toEqual({ x: 0, y: 969 });
      expect(rejected!.changedInvariantFields).toEqual(['fingerprints']);
      expect(rejected!.changedFingerprints).toEqual(['paint']);
      expect(
        rejected!.state.ancestorAttributes.find((entry) => entry.tag === 'article')?.attributes,
      ).toContainEqual(['data-observer-scroll', 'intersecting']);
      expect(() => assertPublicViewportCapture(error.capture)).toThrow('rejected state witness');
    }
    const native = await nativeWitness(page);
    expect(native.issued).toEqual([
      { x: 0, y: 936 },
      { x: 0, y: 969 },
      { x: 0, y: 936 },
    ]);
    expect(native.observer.some((entry) => entry.intersecting && entry.scroll.y === 969)).toBe(
      true,
    );
    await expect(
      page.getByRole('article', { name: 'Observed capture ancestor' }),
    ).not.toHaveAttribute('data-observer-scroll');
    assertPublicViewportCaptureStateEqual(
      before,
      await readPublicViewportCaptureState(frame, header),
    );
  });
});

test('an already fully visible target retains its scroll without a backwards planner move', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(30_000);
  expect(browserName).toBe('chromium');
  await controlledContext(
    browser,
    testInfo,
    100,
    1920,
    async (page, report, images) => {
      const frame = page.getByRole('figure', { name: 'Minimal scroll fixture' });
      const header = page.getByRole('banner', { name: 'Minimal scroll header' });
      const before = await readPublicViewportCaptureState(frame, header);
      expect(before.frame.union).toEqual({ x: 24, y: 1000, width: 272, height: 100 });
      const capture = await capturePublicViewportStrips(page, frame, {
        stickyHeader: header,
        bounds: 'union',
        sourceFiles,
        timeout: 15_000,
      });
      retainCapture(report, images, capture, 'alreadyVisibleCapture');
      assertPublicViewportCapture(capture);
      expect(capture.evidence.scrollPolicy).toBe('strips');
      expect(capture.images).toHaveLength(1);
      expect(before.scroll).toEqual({ x: 0, y: 900 });
      expect(capture.evidence.strips[0]!.clip).toEqual({ x: 24, y: 100, width: 272, height: 100 });
      assertPublicViewportCaptureStateEqual(before, capture.evidence.after!);
      expect((await nativeWitness(page)).issued).toEqual([
        { x: 0, y: 900 },
        { x: 0, y: 900 },
      ]);
      expect(coveredPixel(capture, 25, 1001)).toEqual([0, 0, 0, 255]);
      expect(coveredPixel(capture, 274, 1082)).toEqual([0, 0, 255, 255]);
    },
    900,
  );
});
