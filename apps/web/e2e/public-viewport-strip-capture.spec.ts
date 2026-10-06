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
  publicCapturePngDimensions,
  readPublicViewportCaptureState,
  type PublicCaptureRect,
  type PublicViewportCaptureEvidence,
  type PublicViewportStrip,
} from './lib/public-viewport-strip-capture';

const localRequire = createRequire(__filename);
const playwrightRequire = createRequire(localRequire.resolve('playwright/package.json'));
const corePackage = playwrightRequire.resolve('playwright-core/package.json');
const coreBundle = path.join(path.dirname(corePackage), 'lib/coreBundle.js');
const pngPackage = localRequire.resolve('pngjs/package.json');
const sourceFiles = [
  __filename,
  path.join(__dirname, 'lib/public-viewport-strip-capture.ts'),
  corePackage,
  coreBundle,
  pngPackage,
  localRequire.resolve('pngjs'),
  path.join(path.dirname(pngPackage), 'lib/parser-sync.js'),
];
const pngjs = localRequire('pngjs') as {
  PNG: { sync: { read(bytes: Buffer): { width: number; height: number; data: Buffer } } };
};

const fixture = `<!doctype html><html><head><style>
  html, body { margin: 0; }
  body { min-width: 1100px; min-height: 3400px; background: white; }
  header { position: fixed; inset: 0 0 auto; height: 64px; background: red; z-index: 100; }
  figure { position: absolute; left: 450px; top: 210px; width: 260px; height: 2100px; margin: 0; box-sizing: border-box; border: 8px solid black; background: white; font: 16px Arial; }
  .pointer-sentinel { position: absolute; top: 0; left: 0; width: 180px; height: 24px; background: black; }
  .axis-sentinel { position: absolute; left: 12px; top: 400px; width: 24px; height: 24px; background: rgb(0, 128, 0); }
  .suffix-sentinel { position: absolute; left: 200px; top: 2040px; width: 40px; height: 40px; background: blue; }
  @media (pointer: coarse) { .pointer-sentinel { height: 48px; } }
</style></head><body><header aria-label="Capture header"></header><figure aria-label="Viewport strip fixture"><div class="pointer-sentinel" data-testid="capture-pointer-sentinel"></div><div class="axis-sentinel" data-testid="capture-axis-sentinel"></div><div class="suffix-sentinel" data-testid="capture-suffix-sentinel"></div></figure></body></html>`;

test.use({ screenshot: 'off', video: 'off', trace: 'off' });

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

async function documentRect(page: Page, testId: string): Promise<PublicCaptureRect> {
  return page.getByTestId(testId).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
  });
}

function pixel(bytes: Buffer, x: number, y: number) {
  const png = pngjs.PNG.sync.read(bytes);
  if (x < 0 || y < 0 || x >= png.width || y >= png.height)
    throw new Error('Pixel witness escapes the original PNG');
  const offset = (Math.floor(y) * png.width + Math.floor(x)) * 4;
  return [...png.data.subarray(offset, offset + 4)];
}

function stripPixel(
  evidence: PublicViewportCaptureEvidence,
  images: { index: number; bytes: Buffer }[],
  x: number,
  y: number,
) {
  const strip = evidence.strips.find(
    ({ documentRect: rect }) =>
      x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height,
  );
  if (!strip) throw new Error('Pixel witness is absent from strip coverage');
  const image = images.find((image) => image.index === strip.index);
  if (!image) throw new Error('Strip coverage has no corresponding original PNG');
  return pixel(image.bytes, x - strip.documentRect.x, y - strip.documentRect.y);
}

async function controlledContext(
  browser: Browser,
  testInfo: TestInfo,
  work: (
    page: Page,
    report: Record<string, unknown>,
    images: { name: string; bytes: Buffer }[],
  ) => Promise<void>,
) {
  const sourceStart = sourceSnapshot();
  const report: Record<string, unknown> = {
    scope:
      'Installed Chromium capture mechanism with an immutable local fixture; no public-page or other-browser acceptance.',
    sourceStart,
    contextClosed: false,
  };
  const images: { name: string; bytes: Buffer }[] = [];
  let context: BrowserContext | undefined;
  try {
    context = await browser.newContext({
      viewport: { width: 768, height: 844 },
      hasTouch: true,
      reducedMotion: 'reduce',
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.setContent(fixture, { waitUntil: 'load', timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await scroll(page, 120, 91);
    await work(page, report, images);
  } catch (error) {
    if (error instanceof PublicViewportCaptureError) {
      report['capture'] = error.capture.evidence;
      for (const image of error.capture.images)
        images.push({ name: `failed-viewport-strip-${image.index}`, bytes: image.bytes });
    }
    report['failure'] = error instanceof Error ? error.message : String(error);
    throw error;
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
      await testInfo.attach('viewport-strip-capture-evidence', {
        body: Buffer.from(JSON.stringify(report, null, 2)),
        contentType: 'application/json',
      });
      expect(report['contextClosed']).toBe(true);
      expect(report['sourceEnd']).toEqual(sourceStart);
    }
  }
}

async function originalCroppedStrip(
  page: Page,
  strip: PublicViewportStrip,
  clip: PublicCaptureRect,
) {
  const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
  const header = page.getByRole('banner', { name: 'Capture header' });
  await scroll(page, strip.before.scroll.x, strip.before.scroll.y);
  const before = await readPublicViewportCaptureState(frame, header);
  const bytes = await page.screenshot({
    type: 'png',
    fullPage: false,
    clip,
    scale: 'css',
    animations: 'allow',
    caret: 'initial',
    timeout: 10_000,
  });
  const after = await readPublicViewportCaptureState(frame, header);
  assertPublicViewportCaptureStateEqual(before, after);
  const decoded = pngjs.PNG.sync.read(bytes);
  expect({ width: decoded.width, height: decoded.height }).toEqual({
    width: clip.width,
    height: clip.height,
  });
  return {
    bytes,
    strip: {
      ...strip,
      clip,
      documentRect: {
        x: clip.x + before.scroll.x,
        y: clip.y + before.scroll.y,
        width: clip.width,
        height: clip.height,
      },
      before,
      after,
      png: {
        ...publicCapturePngDimensions(bytes),
        hash: createHash('sha256').update(bytes).digest('hex'),
      },
    },
  };
}

test('viewport strips preserve touch pixels and reject missing, gapped and truncated captures', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(90_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    const original = await readPublicViewportCaptureState(frame, header);
    expect(original.scroll).toEqual({ x: 120, y: 91 });
    expect(original.viewport.height).toBe(844);
    expect(original.media.coarse).toBe(true);
    expect(original.media.touch).toBe(1);
    const pointer = await documentRect(page, 'capture-pointer-sentinel');
    const axis = await documentRect(page, 'capture-axis-sentinel');
    const suffix = await documentRect(page, 'capture-suffix-sentinel');
    expect(pointer.height).toBe(48);
    const capture = await capturePublicViewportStrips(page, frame, {
      stickyHeader: header,
      bounds: 'union',
      sourceFiles,
      timeout: 30_000,
    });
    report['capture'] = capture.evidence;
    for (const image of capture.images)
      images.push({ name: `viewport-strip-${image.index}`, bytes: image.bytes });
    assertPublicViewportCapture(capture);
    const unsettled = structuredClone(capture.evidence);
    unsettled.readiness.samples.at(-1)!.runningAnimations = 1;
    expect(() => assertPublicViewportStripCoverage(unsettled)).toThrow('unsettled fonts');
    report['unsettled'] = unsettled;
    const late = structuredClone(capture.evidence);
    late.readiness.elapsedMs = 2_000;
    expect(() => assertPublicViewportStripCoverage(late)).toThrow('unsettled fonts');
    report['late'] = late;
    expect(() =>
      assertPublicViewportCapture({ ...capture, images: capture.images.slice(1) }),
    ).toThrow('originals are missing');
    assertPublicViewportCaptureStateEqual(original, capture.evidence.after!);
    expect(capture.evidence.strips.length).toBeGreaterThanOrEqual(3);
    for (const strip of capture.evidence.strips) {
      expect(strip.before.viewport.height).toBe(844);
      expect(strip.before.media.coarse).toBe(true);
      expect(strip.before.media.touch).toBe(1);
      expect(strip.safeTop).toBe(64);
      expect(strip.clip.y).toBeGreaterThanOrEqual(64);
      const bytes = capture.images.find((image) => image.index === strip.index)!.bytes;
      const decoded = pngjs.PNG.sync.read(bytes);
      expect({ width: decoded.width, height: decoded.height }).toEqual({
        width: strip.clip.width,
        height: strip.clip.height,
      });
      expect(strip.documentRect.x).toBe(strip.clip.x + strip.before.scroll.x);
      expect(strip.documentRect.y).toBe(strip.clip.y + strip.before.scroll.y);
    }
    expect(stripPixel(capture.evidence, capture.images, pointer.x + 120, pointer.y + 32)).toEqual([
      0, 0, 0, 255,
    ]);
    expect(stripPixel(capture.evidence, capture.images, axis.x + 12, axis.y + 12)).toEqual([
      0, 128, 0, 255,
    ]);
    expect(stripPixel(capture.evidence, capture.images, suffix.x + 20, suffix.y + 20)).toEqual([
      0, 0, 255, 255,
    ]);

    const missing = structuredClone(capture.evidence);
    missing.strips.splice(1, 1);
    expect(() => assertPublicViewportStripCoverage(missing)).toThrow('coverage has a gap');
    report['missing'] = missing;
    try {
      const middle = capture.evidence.strips[1];
      if (!middle) throw new Error('Fixture is missing its middle strip');
      const gap = await originalCroppedStrip(page, middle, {
        ...middle.clip,
        y: middle.clip.y + 80,
        height: middle.clip.height - 80,
      });
      images.push({ name: 'original-gap-control', bytes: gap.bytes });
      const gapped = structuredClone(capture.evidence);
      gapped.strips[1] = gap.strip;
      expect(() => assertPublicViewportStripCoverage(gapped)).toThrow('coverage has a gap');
      report['gapped'] = gapped;

      const last = capture.evidence.strips.at(-1)!;
      const crop = await originalCroppedStrip(page, last, {
        ...last.clip,
        height: last.clip.height - 48,
      });
      images.push({ name: 'original-suffix-control', bytes: crop.bytes });
      const cropped = structuredClone(capture.evidence);
      cropped.strips[cropped.strips.length - 1] = crop.strip;
      expect(() => assertPublicViewportStripCoverage(cropped)).toThrow(
        'coverage misses the suffix',
      );
      expect(() =>
        stripPixel(
          cropped,
          capture.images.slice(0, -1).concat({ index: last.index, bytes: crop.bytes }),
          suffix.x + 20,
          suffix.y + 20,
        ),
      ).toThrow('absent from strip coverage');
      report['cropped'] = cropped;
    } finally {
      await scroll(page, original.scroll.x, original.scroll.y);
      const restored = await readPublicViewportCaptureState(frame, header);
      report['controlRestored'] = restored;
      assertPublicViewportCaptureStateEqual(original, restored);
    }
  });
});

test('installed chromium full-page capture is rejected when touch pixels change', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(60_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    const before = await readPublicViewportCaptureState(frame, header);
    const pointer = await documentRect(page, 'capture-pointer-sentinel');
    expect(before.media.coarse).toBe(true);
    expect(before.media.touch).toBe(1);
    expect(pointer.height).toBe(48);
    const clip = before.frame.rect;
    const bytes = await page.screenshot({
      type: 'png',
      fullPage: true,
      clip,
      scale: 'css',
      animations: 'allow',
      caret: 'initial',
      timeout: 15_000,
    });
    images.push({ name: 'rejected-original-full-page', bytes });
    const after = await readPublicViewportCaptureState(frame, header);
    const pointerAfter = await documentRect(page, 'capture-pointer-sentinel');
    report['fullPage'] = {
      before,
      after,
      clip,
      png: {
        ...publicCapturePngDimensions(bytes),
        hash: createHash('sha256').update(bytes).digest('hex'),
      },
      pointerBefore: pointer,
      pointerAfter,
    };
    expect(after.viewport).toEqual(before.viewport);
    expect(after.media.coarse).toBe(false);
    expect(after.media.fine).toBe(true);
    expect(after.media.hover).toBe(true);
    expect(after.media.touch).toBe(0);
    expect(pointerAfter.height).toBe(24);
    expect(pixel(bytes, pointer.x + 120 - clip.x, pointer.y + 32 - clip.y)).toEqual([
      255, 255, 255, 255,
    ]);
    expect(() => assertPublicViewportCaptureStateEqual(before, after)).toThrow(
      'Viewport capture state changed',
    );
  });
});

test('static viewport capture rejects a native control with untracked browser state', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(60_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    await frame.evaluate((root) => {
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.setAttribute('aria-label', 'Native capture control');
      root.append(control);
    });
    await expect(frame.getByRole('checkbox', { name: 'Native capture control' })).toHaveCount(1);
    const capture = capturePublicViewportStrips(page, frame, {
      stickyHeader: header,
      bounds: 'union',
      sourceFiles,
    }).then((accepted) => {
      report['acceptedNativeControl'] = accepted.evidence;
      for (const image of accepted.images)
        images.push({ name: `accepted-native-control-${image.index}`, bytes: image.bytes });
      return accepted;
    });
    await expect(capture).rejects.toThrow('unsupported live surface or native control');
    report['nativeControl'] = 'Rejected rather than certifying untracked native state';
  });
});

for (const continuous of [false, true]) {
  test(`viewport capture ${continuous ? 'rejects continuous' : 'waits for finite'} frame motion`, async ({
    browser,
    browserName,
  }, testInfo) => {
    test.setTimeout(30_000);
    expect(browserName).toBe('chromium');
    await controlledContext(browser, testInfo, async (page, report, images) => {
      const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
      const header = page.getByRole('banner', { name: 'Capture header' });
      await frame.evaluate((root, continuous) => {
        const sentinel = root.querySelector('[data-testid="capture-pointer-sentinel"]');
        if (!sentinel) throw new Error('Motion fixture has no pointer sentinel');
        const animation = sentinel.animate(
          [{ backgroundColor: continuous ? 'black' : 'red' }, { backgroundColor: 'black' }],
          { duration: 1_200, iterations: continuous ? Infinity : 1, fill: 'forwards' },
        );
        animation.onfinish = () => root.setAttribute('data-motion-finished', 'true');
      }, continuous);
      const entry = await readPublicViewportCaptureState(frame, header);
      report['motionEntry'] = entry;
      expect(entry.runningAnimations).toBe(1);
      const entryTime = await frame.evaluate(
        (root) => root.getAnimations({ subtree: true })[0]?.currentTime,
      );
      report['motionEntryTime'] = entryTime;
      const pending = capturePublicViewportStrips(page, frame, {
        stickyHeader: header,
        bounds: 'union',
        sourceFiles,
        timeout: 6_000,
      });
      if (continuous) {
        try {
          const accepted = await pending;
          report['acceptedMotion'] = accepted.evidence;
          for (const image of accepted.images)
            images.push({ name: `accepted-motion-${image.index}`, bytes: image.bytes });
          throw new Error('Continuously moving frame was accepted');
        } catch (error) {
          if (!(error instanceof PublicViewportCaptureError)) throw error;
          report['rejectedMotion'] = error.capture.evidence;
          for (const image of error.capture.images)
            images.push({ name: `rejected-motion-${image.index}`, bytes: image.bytes });
          expect(error.message).toMatch(/unsettled fonts or running frame motion/u);
          expect(error.capture.images).toHaveLength(0);
          expect(error.capture.evidence.readiness.settled).toBe(false);
          expect(error.capture.evidence.readiness.samples[0]!.runningAnimations).toBe(1);
          expect(error.capture.evidence.readiness.elapsedMs).toBeGreaterThanOrEqual(1_800);
        }
        expect((await readPublicViewportCaptureState(frame, header)).runningAnimations).toBe(1);
        const afterTime = await frame.evaluate(
          (root) => root.getAnimations({ subtree: true })[0]?.currentTime,
        );
        report['motionAfterTime'] = afterTime;
        expect(typeof entryTime).toBe('number');
        expect(typeof afterTime).toBe('number');
        expect(Number(afterTime)).toBeGreaterThan(Number(entryTime));
        expect(await frame.getAttribute('data-motion-finished')).toBeNull();
        return;
      }
      const capture = await pending;
      report['capture'] = capture.evidence;
      for (const image of capture.images)
        images.push({ name: `viewport-strip-${image.index}`, bytes: image.bytes });
      assertPublicViewportCapture(capture);
      expect(capture.evidence.readiness.settled).toBe(true);
      expect(capture.evidence.readiness.samples[0]!.runningAnimations).toBe(1);
      expect(capture.evidence.readiness.samples.slice(-2)).toEqual([
        { fontsStatus: 'loaded', runningAnimations: 0 },
        { fontsStatus: 'loaded', runningAnimations: 0 },
      ]);
      expect(await frame.getAttribute('data-motion-finished')).toBe('true');
      expect(capture.evidence.before.runningAnimations).toBe(0);
      expect(capture.evidence.after!.runningAnimations).toBe(0);
      expect(capture.evidence.before.scroll).toEqual(entry.scroll);
      expect(capture.evidence.before.media).toEqual(entry.media);
      const pointer = await documentRect(page, 'capture-pointer-sentinel');
      expect(stripPixel(capture.evidence, capture.images, pointer.x + 120, pointer.y + 32)).toEqual(
        [0, 0, 0, 255],
      );
    });
  });
}

function delayNativeDelivery<T extends object>(
  target: T,
  method: keyof T,
  delivery: number,
  record: (value: { nativeResponseReceived: true; elapsedMs: number }) => void,
): T {
  let calls = 0;
  return new Proxy(target, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === method) {
        if (typeof value !== 'function') throw new Error('Delayed native method is not callable');
        return async (...args: unknown[]) => {
          const native = await Reflect.apply(value, target, args);
          calls += 1;
          if (calls === delivery) {
            const started = performance.now();
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_100);
            record({ nativeResponseReceived: true, elapsedMs: performance.now() - started });
          }
          return native;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function delayFrameDelivery(
  frame: ReturnType<Page['getByRole']>,
  delivery: number,
  record: (value: { nativeResponseReceived: true; elapsedMs: number }) => void,
) {
  return new Proxy(frame, {
    get(target, property) {
      if (property === 'elementHandle') {
        return async (options: Parameters<typeof frame.elementHandle>[0]) => {
          const handle = await target.elementHandle(options);
          return handle ? delayNativeDelivery(handle, 'evaluate', delivery, record) : handle;
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

test('viewport capture rejects a readiness response delivered after its deadline', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(30_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    const delayedFrame = delayFrameDelivery(frame, 2, (delivery) => {
      report['delayedDelivery'] = delivery;
    });
    try {
      const accepted = await capturePublicViewportStrips(page, delayedFrame, {
        stickyHeader: header,
        bounds: 'union',
        sourceFiles,
        timeout: 10_000,
      });
      report['acceptedLateReadiness'] = accepted.evidence;
      for (const image of accepted.images)
        images.push({ name: `accepted-late-readiness-${image.index}`, bytes: image.bytes });
      throw new Error('A readiness response delivered after its deadline was accepted');
    } catch (error) {
      if (!(error instanceof PublicViewportCaptureError)) throw error;
      report['rejectedLateReadiness'] = error.capture.evidence;
      for (const image of error.capture.images)
        images.push({ name: `rejected-late-readiness-${image.index}`, bytes: image.bytes });
      expect(error.message).toMatch(/unsettled fonts or running frame motion/u);
      expect(error.capture.images).toHaveLength(0);
      expect(error.capture.evidence.readiness.settled).toBe(false);
      expect(error.capture.evidence.readiness.elapsedMs).toBeGreaterThanOrEqual(2_000);
    }
    expect(report['delayedDelivery']).toMatchObject({ nativeResponseReceived: true });
    expect((await readPublicViewportCaptureState(frame, header)).runningAnimations).toBe(0);
  });
});

test('viewport capture reports elapsed time when the first readiness wait crosses its deadline', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(30_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    const delayedPage = delayNativeDelivery(page, 'evaluate', 1, (delivery) => {
      report['delayedFirstWait'] = delivery;
    });
    try {
      const accepted = await capturePublicViewportStrips(delayedPage, frame, {
        stickyHeader: header,
        bounds: 'union',
        sourceFiles,
        timeout: 10_000,
      });
      report['acceptedLateWait'] = accepted.evidence;
      for (const image of accepted.images)
        images.push({ name: `accepted-late-wait-${image.index}`, bytes: image.bytes });
      throw new Error('A first readiness wait delivered after its deadline was accepted');
    } catch (error) {
      if (!(error instanceof PublicViewportCaptureError)) throw error;
      report['rejectedLateWait'] = error.capture.evidence;
      expect(error.message).toMatch(/unsettled fonts or running frame motion/u);
      expect(error.capture.images).toHaveLength(0);
      expect(error.capture.evidence.readiness.settled).toBe(false);
      expect(error.capture.evidence.readiness.samples).toHaveLength(1);
      expect(error.capture.evidence.readiness.elapsedMs).toBeGreaterThanOrEqual(2_000);
    }
    expect(report['delayedFirstWait']).toMatchObject({ nativeResponseReceived: true });
    expect((await readPublicViewportCaptureState(frame, header)).scroll).toEqual({ x: 120, y: 91 });
  });
});

test('viewport capture keeps slow full snapshots outside the readiness budget', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(30_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    const delayedFrame = delayFrameDelivery(frame, 4, (delivery) => {
      report['delayedFullSnapshot'] = delivery;
    });
    const capture = await capturePublicViewportStrips(page, delayedFrame, {
      stickyHeader: header,
      bounds: 'union',
      sourceFiles,
      timeout: 10_000,
    });
    report['capture'] = capture.evidence;
    for (const image of capture.images)
      images.push({ name: `viewport-strip-${image.index}`, bytes: image.bytes });
    assertPublicViewportCapture(capture);
    expect(report['delayedFullSnapshot']).toMatchObject({ nativeResponseReceived: true });
    expect(capture.evidence.readiness.settled).toBe(true);
    expect(capture.evidence.readiness.elapsedMs).toBeLessThan(2_000);
    expect(capture.evidence.readiness.samples.slice(-2)).toEqual([
      { fontsStatus: 'loaded', runningAnimations: 0 },
      { fontsStatus: 'loaded', runningAnimations: 0 },
    ]);
    expect(capture.evidence.before.runningAnimations).toBe(0);
    expect(capture.evidence.after!.runningAnimations).toBe(0);
    expect(capture.evidence.before.scroll).toEqual({ x: 120, y: 91 });
    const suffix = await documentRect(page, 'capture-suffix-sentinel');
    expect(stripPixel(capture.evidence, capture.images, suffix.x + 10, suffix.y + 10)).toEqual([
      0, 0, 255, 255,
    ]);
  });
});

const localSvgFixture =
  '<svg xmlns="http://www.w3.org/2000/svg" data-testid="capture-svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position:absolute;left:32px;top:147.125px"><path data-testid="capture-svg-path" d="m12 19-7-7 7-7"/><circle data-testid="capture-svg-circle" cx="12" cy="12" r="10"/><rect data-testid="capture-svg-rect" x="3" y="11" width="18" height="11" rx="2" ry="2"/></svg><span data-testid="capture-text" style="position:absolute;left:32px;top:220px">Stable text</span>';

test('viewport SVG local geometry remains exact across native scroll positions', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(60_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    await frame.evaluate(
      (root, fixture) => root.insertAdjacentHTML('beforeend', fixture),
      localSvgFixture,
    );
    const capture = await capturePublicViewportStrips(page, frame, {
      stickyHeader: header,
      bounds: 'union',
      sourceFiles,
    });
    report['svgCapture'] = capture.evidence;
    for (const image of capture.images)
      images.push({ name: `svg-local-strip-${image.index}`, bytes: image.bytes });
    assertPublicViewportCapture(capture);
    expect(capture.evidence.before.svgGeometry).toHaveLength(3);
    const canonical = capture.evidence.before.svgGeometry.map(({ index, local, matrix, rect }) => ({
      index,
      local,
      matrix,
      rect,
    }));
    for (const strip of capture.evidence.strips) {
      expect(
        strip.before.svgGeometry.map(({ index, local, matrix, rect }) => ({
          index,
          local,
          matrix,
          rect,
        })),
      ).toEqual(canonical);
      expect(strip.before.fingerprints.geometry).toBe(
        capture.evidence.before.fingerprints.geometry,
      );
    }
    expect(capture.evidence.restored).toBe(true);
    const suffix = await documentRect(page, 'capture-suffix-sentinel');
    expect(stripPixel(capture.evidence, capture.images, suffix.x + 20, suffix.y + 20)).toEqual([
      0, 0, 255, 255,
    ]);
  });
});

for (const kind of ['path', 'circle', 'rect', 'html', 'text', 'layout'] as const) {
  test(
    'viewport geometry detects a genuine ' + kind + ' mutation',
    async ({ browser, browserName }, testInfo) => {
      test.setTimeout(30_000);
      expect(browserName).toBe('chromium');
      await controlledContext(browser, testInfo, async (page, report) => {
        const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
        const header = page.getByRole('banner', { name: 'Capture header' });
        await frame.evaluate(
          (root, fixture) => root.insertAdjacentHTML('beforeend', fixture),
          localSvgFixture,
        );
        const before = await readPublicViewportCaptureState(frame, header);
        report['mutationBefore'] = before;
        expect(before.svgGeometry).toHaveLength(3);
        const mutation = await frame.evaluate((root, kind) => {
          if (['path', 'circle', 'rect'].includes(kind)) {
            const shape = root.querySelector('[data-testid="capture-svg-' + kind + '"]');
            if (!(shape instanceof SVGGeometryElement))
              throw new Error('Missing native SVG mutation target');
            const matrix = shape.getScreenCTM();
            if (!matrix || !Number.isFinite(matrix.d) || matrix.d === 0)
              throw new Error('Unmeasured mutation scale');
            const shift = 1 / devicePixelRatio / matrix.d;
            shape.setAttribute('transform', 'translate(0 ' + shift + ')');
            return { kind, localShift: shift, cssPixelTarget: 1 / devicePixelRatio };
          }
          if (kind === 'html') {
            const node = root.querySelector('[data-testid="capture-axis-sentinel"]');
            if (!(node instanceof HTMLElement)) throw new Error('Missing HTML mutation target');
            node.style.transform = 'translateY(' + 1 / devicePixelRatio + 'px)';
          } else if (kind === 'text') {
            const node = root.querySelector('[data-testid="capture-text"]');
            if (!node) throw new Error('Missing text mutation target');
            node.textContent = 'Changed text content';
          } else if (kind === 'layout') {
            if (!(root instanceof HTMLElement)) throw new Error('Missing native layout target');
            root.style.width =
              Number.parseFloat(getComputedStyle(root).width) + 1 / devicePixelRatio + 'px';
          } else throw new Error('Unknown mutation control');
          return { kind };
        }, kind);
        const after = await readPublicViewportCaptureState(frame, header);
        report['mutation'] = mutation;
        report['mutationAfter'] = after;
        expect(after.fingerprints.geometry).not.toBe(before.fingerprints.geometry);
        if (['path', 'circle', 'rect'].includes(kind)) {
          expect(after.frame).toEqual(before.frame);
          const index = ['path', 'circle', 'rect'].indexOf(kind);
          expect(after.svgGeometry[index]!.local).toEqual(before.svgGeometry[index]!.local);
          expect(after.svgGeometry[index]!.matrix.f).not.toBe(before.svgGeometry[index]!.matrix.f);
          expect(after.svgGeometry[index]!.rect.y).not.toBe(before.svgGeometry[index]!.rect.y);
        }
        if (kind === 'text')
          expect(after.fingerprints.identity).not.toBe(before.fingerprints.identity);
        if (kind === 'layout') expect(after.frame.rect.width).not.toBe(before.frame.rect.width);
        expect(() => assertPublicViewportCaptureStateEqual(before, after)).toThrow(
          'Viewport capture state changed',
        );
      });
    },
  );
}

test('viewport SVG geometry refuses a degenerate native matrix', async ({
  browser,
  browserName,
}, testInfo) => {
  test.setTimeout(30_000);
  expect(browserName).toBe('chromium');
  await controlledContext(browser, testInfo, async (page, report) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    await frame.evaluate(
      (root, fixture) => root.insertAdjacentHTML('beforeend', fixture),
      localSvgFixture,
    );
    report['beforeDegenerate'] = await readPublicViewportCaptureState(frame, header);
    const native = await page.getByTestId('capture-svg-path').evaluate((shape) => {
      if (!(shape instanceof SVGGeometryElement))
        throw new Error('Missing degenerate native shape');
      shape.setAttribute('transform', 'scale(0)');
      const matrix = shape.getScreenCTM();
      if (!matrix) throw new Error('Missing actual native matrix');
      return { determinant: matrix.a * matrix.d - matrix.b * matrix.c, is2D: matrix.is2D };
    });
    report['degenerateNative'] = native;
    expect(native.determinant).toBe(0);
    await expect(readPublicViewportCaptureState(frame, header)).rejects.toThrow(
      'unmeasured local box or affine matrix',
    );
  });
});

const boxFreeFixture =
  '<div data-testid="capture-box-free" style="display:contents"><span data-testid="capture-box-free-child" style="position:absolute;left:32px;top:220px">Painted child</span></div>';

test('viewport strips retain box-free wrappers and their painted children', async ({
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  await controlledContext(browser, testInfo, async (page, report, images) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    await frame.evaluate(
      (root, fixture) => root.insertAdjacentHTML('beforeend', fixture),
      boxFreeFixture,
    );
    const native = await page.getByTestId('capture-box-free').evaluate((element) => ({
      boxes: element.getClientRects().length,
      rect: element.getBoundingClientRect().toJSON(),
    }));
    report['boxFreeNative'] = native;
    expect(native.boxes).toBe(0);
    expect(native.rect).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
    const capture = await capturePublicViewportStrips(page, frame, {
      stickyHeader: header,
      bounds: 'union',
      sourceFiles,
    });
    report['boxFreeCapture'] = capture.evidence;
    for (const image of capture.images)
      images.push({ name: `box-free-strip-${image.index}`, bytes: image.bytes });
    assertPublicViewportCapture(capture);
    for (const strip of capture.evidence.strips)
      expect(strip.before.fingerprints).toEqual(capture.evidence.before.fingerprints);
    expect(capture.evidence.restored).toBe(true);
  });
});

test('viewport geometry detects a painted child moving inside a box-free wrapper', async ({
  browser,
}, testInfo) => {
  test.setTimeout(30_000);
  await controlledContext(browser, testInfo, async (page, report) => {
    const frame = page.getByRole('figure', { name: 'Viewport strip fixture' });
    const header = page.getByRole('banner', { name: 'Capture header' });
    await frame.evaluate(
      (root, fixture) => root.insertAdjacentHTML('beforeend', fixture),
      boxFreeFixture,
    );
    const before = await readPublicViewportCaptureState(frame, header);
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent =
        '[data-testid="capture-box-free-child"] { transform: translateY(' +
        1 / devicePixelRatio +
        'px); }';
      document.head.append(style);
    });
    const after = await readPublicViewportCaptureState(frame, header);
    report['boxFreeMovement'] = { before, after };
    expect(after.frame).toEqual(before.frame);
    expect(after.fingerprints.identity).toBe(before.fingerprints.identity);
    expect(after.fingerprints.geometry).not.toBe(before.fingerprints.geometry);
    expect(() => assertPublicViewportCaptureStateEqual(before, after)).toThrow(
      'Viewport capture state changed',
    );
  });
});
