import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  assertPublicViewportCapture,
  assertPublicViewportStripCoverage,
  capturePublicViewportStrips,
  PublicViewportCaptureError,
  readPublicViewportCaptureState,
} from './lib/public-viewport-strip-capture';

test.use({ screenshot: 'off', video: 'off', trace: 'off' });

async function fixture(page: Page, height = 240) {
  await page.setViewportSize({ width: 1024, height: 844 });
  await page.setContent(
    `<style>body{margin:0}header{position:fixed;inset:0 0 auto;height:64px;background:white}.spacer{height:900px}.story{height:2200px}.stage{position:sticky;top:96px;width:320px;margin-left:500px}figure{margin:0;width:320px;height:${height}px;background:rgb(30,40,50);color:white}</style><header>Header</header><div class="spacer"></div><div class="story"><div class="stage"><figure aria-label="Static sticky preview"><p>Original static preview</p></figure></div></div>`,
  );
  await page.evaluate(async () => {
    scrollTo({ top: 1000, behavior: 'instant' });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  return {
    frame: page.getByRole('figure', { name: 'Static sticky preview', exact: true }),
    header: page.getByRole('banner'),
  };
}

async function trackNativeScroll(page: Page) {
  await page.evaluate(() => {
    const calls = { to: 0, by: 0, events: 0 };
    (window as typeof window & { __retainedScrollCalls?: typeof calls }).__retainedScrollCalls =
      calls;
    const nativeTo = window.scrollTo;
    const nativeBy = window.scrollBy;
    window.scrollTo = function (...args: unknown[]) {
      calls.to += 1;
      return Reflect.apply(nativeTo, window, args);
    };
    window.scrollBy = function (...args: unknown[]) {
      calls.by += 1;
      return Reflect.apply(nativeBy, window, args);
    };
    window.addEventListener(
      'scroll',
      () => {
        calls.events += 1;
      },
      { passive: true },
    );
  });
}

async function nativeScrollCalls(page: Page) {
  return page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    return (
      window as typeof window & {
        __retainedScrollCalls?: { to: number; by: number; events: number };
      }
    ).__retainedScrollCalls;
  });
}

function captureOptions(header: Locator) {
  return {
    stickyHeader: header,
    bounds: 'union' as const,
    preserveScroll: true,
    sourceFiles: [__filename],
  };
}

async function expectRejected(work: Promise<unknown>) {
  let caught: unknown;
  try {
    await work;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PublicViewportCaptureError);
  if (!(caught instanceof PublicViewportCaptureError))
    throw new Error('Missing failed capture evidence');
  return caught;
}

function afterNativeScreenshot(page: Page, work: () => Promise<void>) {
  return new Proxy(page, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === 'screenshot') {
        return async (...args: unknown[]) => {
          if (typeof value !== 'function') throw new Error('Native screenshot method is missing');
          const bytes = await Reflect.apply(value, target, args);
          await work();
          return bytes;
        };
      }
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

test('retained scroll captures the complete original sticky union without scroll calls', async ({
  page,
}) => {
  const { frame, header } = await fixture(page);
  const before = await readPublicViewportCaptureState(frame, header);
  const box = await frame.boundingBox();
  if (!box) throw new Error('Fixture frame has no visible geometry');
  const reference = await page.screenshot({ type: 'png', clip: box, scale: 'css' });
  await trackNativeScroll(page);
  const capture = await capturePublicViewportStrips(page, frame, captureOptions(header));
  assertPublicViewportCapture(capture);
  expect(capture.evidence.scrollPolicy).toBe('preserve');
  expect(capture.evidence.strips).toHaveLength(1);
  expect(capture.images).toHaveLength(1);
  expect(capture.images[0]?.bytes.equals(reference)).toBe(true);
  expect(capture.evidence.strips[0]?.before).toEqual(before);
  expect(capture.evidence.strips[0]?.after).toEqual(before);
  expect(await readPublicViewportCaptureState(frame, header)).toEqual(before);
  expect(await nativeScrollCalls(page)).toEqual({ to: 0, by: 0, events: 0 });
});

test('the scroll-call witness reads actual default strip and restoration calls', async ({
  page,
}) => {
  const { frame, header } = await fixture(page);
  await trackNativeScroll(page);
  const error = await expectRejected(
    capturePublicViewportStrips(page, frame, {
      stickyHeader: header,
      bounds: 'union',
      sourceFiles: [__filename],
    }),
  );
  expect(error.message).toContain('frame changed across scrolling');
  const calls = await nativeScrollCalls(page);
  expect(calls?.to).toBeGreaterThan(0);
});

for (const cause of ['suffix', 'header'] as const) {
  test(`retained scroll rejects a ${cause} clip without scroll or restore calls`, async ({
    page,
  }) => {
    const { frame, header } = await fixture(page, cause === 'suffix' ? 900 : 240);
    if (cause === 'header')
      await header.evaluate((root) => {
        root.style.height = '128px';
      });
    const before = await readPublicViewportCaptureState(frame, header);
    await trackNativeScroll(page);
    const error = await expectRejected(
      capturePublicViewportStrips(page, frame, captureOptions(header)),
    );
    expect(error.message).toContain('entire original target below the header');
    expect(error.capture.images).toHaveLength(0);
    expect(error.capture.evidence.strips).toHaveLength(0);
    expect(error.capture.evidence.failures).not.toEqual([]);
    expect(error.capture.evidence.restored).toBe(true);
    expect(await readPublicViewportCaptureState(frame, header)).toEqual(before);
    expect(await nativeScrollCalls(page)).toEqual({ to: 0, by: 0, events: 0 });
  });
}

test('retained evidence rejects missing policy and scroll or coordinated header mutations', async ({
  page,
}) => {
  const { frame, header } = await fixture(page);
  const capture = await capturePublicViewportStrips(page, frame, captureOptions(header));
  const missing = structuredClone(capture.evidence);
  Reflect.deleteProperty(missing, 'scrollPolicy');
  expect(() => assertPublicViewportStripCoverage(missing)).toThrow('unsupported scroll policy');
  const unknown = structuredClone(capture.evidence);
  Reflect.set(unknown, 'scrollPolicy', 'unknown');
  expect(() => assertPublicViewportStripCoverage(unknown)).toThrow('unsupported scroll policy');
  const moved = structuredClone(capture.evidence);
  moved.strips[0]!.before.scroll.y += 1;
  moved.strips[0]!.after.scroll.y += 1;
  moved.strips[0]!.clip.y -= 1;
  expect(() => assertPublicViewportStripCoverage(moved)).toThrow('Viewport capture state changed');
  const wrongHeader = structuredClone(capture.evidence);
  if (!wrongHeader.before.header || !wrongHeader.after?.header)
    throw new Error('Fixture is missing its baseline header');
  wrongHeader.before.header.height = 200;
  wrongHeader.after.header.height = 200;
  expect(() => assertPublicViewportStripCoverage(wrongHeader)).toThrow(
    'Viewport capture state changed',
  );
  const wrongExclusion = structuredClone(capture.evidence);
  wrongExclusion.strips[0]!.safeTop = 32;
  expect(() => assertPublicViewportStripCoverage(wrongExclusion)).toThrow(
    'header exclusion differs',
  );
});

for (const mutation of ['scroll', 'header'] as const) {
  test(`retained capture rejects native ${mutation} mutation after PNG`, async ({ page }) => {
    const { frame, header } = await fixture(page);
    await trackNativeScroll(page);
    let nativeScreenshotReturned = false;
    const instrumented = afterNativeScreenshot(page, async () => {
      nativeScreenshotReturned = true;
      if (mutation === 'scroll')
        await page.evaluate(() => scrollBy({ top: 1, behavior: 'instant' }));
      else
        await header.evaluate((root) => {
          root.style.height = '128px';
        });
    });
    const error = await expectRejected(
      capturePublicViewportStrips(instrumented, frame, captureOptions(header)),
    );
    expect(nativeScreenshotReturned).toBe(true);
    expect(error.message).toBe('Viewport capture state changed');
    expect(error.capture.images).toHaveLength(1);
    expect(error.capture.evidence.failures).toHaveLength(2);
    expect(error.capture.evidence.restored).toBe(false);
    const calls = await nativeScrollCalls(page);
    expect(calls?.to).toBe(0);
    expect(calls?.by).toBe(mutation === 'scroll' ? 1 : 0);
  });
}

test('retained capture keeps primary native screenshot failure and failed restoration evidence', async ({
  page,
}) => {
  const { frame, header } = await fixture(page);
  await trackNativeScroll(page);
  let nativeScreenshotReturned = false;
  let removalScrollWitness: Awaited<ReturnType<typeof nativeScrollCalls>>;
  const instrumented = afterNativeScreenshot(page, async () => {
    nativeScreenshotReturned = true;
    await frame.evaluate((root) => root.remove());
    removalScrollWitness = await nativeScrollCalls(page);
    throw new Error('primary native screenshot delivery failure');
  });
  const error = await expectRejected(
    capturePublicViewportStrips(instrumented, frame, captureOptions(header)),
  );
  expect(nativeScreenshotReturned).toBe(true);
  expect(error.message).toBe('primary native screenshot delivery failure');
  expect(error.capture.evidence.failures[0]).toBe('primary native screenshot delivery failure');
  expect(error.capture.evidence.failures).toHaveLength(2);
  expect(error.capture.evidence.failures[1]).toContain('Capture frame is disconnected');
  expect(error.capture.evidence.restored).toBe(false);
  expect(error.capture.images).toHaveLength(0);
  expect(removalScrollWitness).toBeDefined();
  expect(removalScrollWitness?.to).toBe(0);
  expect(removalScrollWitness?.by).toBe(0);
  expect(await nativeScrollCalls(page)).toEqual(removalScrollWitness);
});
