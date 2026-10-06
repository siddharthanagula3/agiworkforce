import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { ElementHandle, Locator, Page } from '@playwright/test';

export type PublicCaptureRect = { x: number; y: number; width: number; height: number };
type CaptureHandle = ElementHandle<HTMLElement | SVGElement>;
const READINESS_WINDOW_MS = 2_000;

async function bounded<T>(work: Promise<T>, timeout: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} exceeded its time bound`)),
          Math.max(1, timeout),
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function readNativeCaptureState(
  root: HTMLElement | SVGElement,
  { header, details }: { header: HTMLElement | SVGElement | null; details: boolean },
) {
  if (!root.isConnected || !document.body) throw new Error('Capture frame is disconnected');
  const environment = () => {
    const fonts = {
      status: document.fonts.status,
      faces: [...document.fonts]
        .map((face) => [
          face.family,
          face.style,
          face.weight,
          face.stretch,
          face.unicodeRange,
          face.status,
        ])
        .sort(),
    };
    const visual = visualViewport;
    return {
      scroll: { x: scrollX, y: scrollY },
      viewport: {
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
        visual: visual
          ? {
              width: visual.width,
              height: visual.height,
              scale: visual.scale,
              offsetLeft: visual.offsetLeft,
              offsetTop: visual.offsetTop,
            }
          : null,
      },
      document: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      media: {
        coarse: matchMedia('(pointer: coarse)').matches,
        fine: matchMedia('(pointer: fine)').matches,
        hover: matchMedia('(hover: hover)').matches,
        anyCoarse: matchMedia('(any-pointer: coarse)').matches,
        anyFine: matchMedia('(any-pointer: fine)').matches,
        anyHover: matchMedia('(any-hover: hover)').matches,
        touch: navigator.maxTouchPoints,
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        dark: matchMedia('(prefers-color-scheme: dark)').matches,
      },
      fonts,
      runningAnimations: root
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === 'running').length,
    };
  };
  if (!details) return { ...environment(), material: null };
  const rectOf = (rect: DOMRect) => ({
    x: rect.x + scrollX,
    y: rect.y + scrollY,
    width: rect.width,
    height: rect.height,
  });
  const stylesOf = (element: Element, pseudo?: string) => {
    const style = getComputedStyle(element, pseudo);
    return [...style].sort().map((name) => [name, style.getPropertyValue(name)]);
  };
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 1_000) throw new Error('Capture frame exceeds its element bound');
  const unsupported =
    'canvas,audio,video,iframe,object,embed,input,textarea,select,button,summary,a[href],area[href],[contenteditable],[tabindex]';
  const selection = document.getSelection();
  const selected =
    selection &&
    !selection.isCollapsed &&
    Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index)).some(
      (range) => range.intersectsNode(root),
    );
  if (
    root.matches(unsupported) ||
    root.querySelector(unsupported) ||
    elements.some(
      (element) =>
        element instanceof HTMLElement && (element.isContentEditable || element.tabIndex >= 0),
    ) ||
    selected
  )
    throw new Error('Capture frame contains an unsupported live surface or native control');
  const identity = elements.map((element) => ({
    tag: element.localName,
    attributes: [...element.attributes]
      .map((attribute) => [attribute.name, attribute.value])
      .sort(),
    value:
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
        ? element.value
        : null,
  }));
  const paint = elements.map((element) => ({
    style: stylesOf(element),
    before: stylesOf(element, '::before'),
    after: stylesOf(element, '::after'),
  }));
  const hasCssBoxes = elements.map((element) => element.getClientRects().length > 0);
  const rawRects = elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    return hasCssBoxes[index]
      ? rectOf(rect)
      : { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const svgGeometry: {
    index: number;
    rawRect: ReturnType<typeof rectOf>;
    local: ReturnType<typeof rectOf>;
    matrix: { a: number; b: number; c: number; d: number; e: number; f: number };
    rect: ReturnType<typeof rectOf>;
  }[] = [];
  const geometry = elements.map((element, index) => {
    let rect = rawRects[index]!;
    let svg: Pick<(typeof svgGeometry)[number], 'local' | 'matrix'> | null = null;
    if (element instanceof SVGGeometryElement) {
      for (let parent: Element | null = element; parent; parent = parent.parentElement) {
        const css = getComputedStyle(parent);
        if (
          css.perspective !== 'none' ||
          (css.transform !== 'none' && !new DOMMatrixReadOnly(css.transform).is2D)
        )
          throw new Error('Capture SVG geometry has an unsupported non-affine transform');
      }
      const box = element.getBBox();
      const native = element.getScreenCTM();
      const determinant = native ? native.a * native.d - native.b * native.c : NaN;
      if (
        !native ||
        ![
          box.x,
          box.y,
          box.width,
          box.height,
          native.a,
          native.b,
          native.c,
          native.d,
          native.e,
          native.f,
        ].every(Number.isFinite) ||
        box.width < 0 ||
        box.height < 0 ||
        !Number.isFinite(determinant) ||
        determinant === 0
      )
        throw new Error('Capture SVG geometry has an unmeasured local box or affine matrix');
      const local = { x: box.x, y: box.y, width: box.width, height: box.height };
      const matrix = {
        a: native.a,
        b: native.b,
        c: native.c,
        d: native.d,
        e: native.e + scrollX,
        f: native.f + scrollY,
      };
      const corners = [
        [box.x, box.y],
        [box.x + box.width, box.y],
        [box.x, box.y + box.height],
        [box.x + box.width, box.y + box.height],
      ].map(([x, y]) => ({
        x: matrix.a * x! + matrix.c * y! + matrix.e,
        y: matrix.b * x! + matrix.d * y! + matrix.f,
      }));
      const left = Math.min(...corners.map(({ x }) => x));
      const top = Math.min(...corners.map(({ y }) => y));
      const right = Math.max(...corners.map(({ x }) => x));
      const bottom = Math.max(...corners.map(({ y }) => y));
      rect = { x: left, y: top, width: right - left, height: bottom - top };
      if (![...Object.values(matrix), ...Object.values(rect)].every(Number.isFinite))
        throw new Error('Capture SVG geometry has non-finite document bounds');
      svg = { local, matrix };
      svgGeometry.push({ index, rawRect: rawRects[index]!, local, matrix, rect });
    }
    return {
      rect,
      svg,
      hasCssBoxes: hasCssBoxes[index],
      client: [element.clientWidth, element.clientHeight],
      scroll: [element.scrollLeft, element.scrollTop, element.scrollWidth, element.scrollHeight],
    };
  });
  const text = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest('script,style,noscript')) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    text.push({ text: node.data, rects: [...range.getClientRects()].map(rectOf) });
  }
  const rect = rectOf(root.getBoundingClientRect());
  const boxes = [rect, ...rawRects, ...text.flatMap((entry) => entry.rects)].filter(
    (box) => box.width > 0 && box.height > 0,
  );
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const ancestors = [];
  for (let element = root.parentElement; element; element = element.parentElement) {
    ancestors.push({
      tag: element.localName,
      attributes: [...element.attributes]
        .map((attribute) => [attribute.name, attribute.value])
        .sort(),
      style: stylesOf(element),
    });
  }
  const headerRect = header?.getBoundingClientRect();
  const headerStyle = header ? getComputedStyle(header) : null;
  const headerVisible = Boolean(
    headerRect &&
    headerRect.width > 0 &&
    headerRect.height > 0 &&
    headerStyle?.display !== 'none' &&
    headerStyle?.visibility !== 'hidden' &&
    Number(headerStyle?.opacity) !== 0,
  );
  return {
    ...environment(),
    material: {
      frame: {
        rect,
        union: { x: left, y: top, width: right - left, height: bottom - top },
        elements: elements.length,
        textNodes: text.length,
      },
      header:
        headerVisible && headerRect
          ? {
              x: headerRect.x,
              y: headerRect.y,
              width: headerRect.width,
              height: headerRect.height,
              position: headerStyle?.position,
            }
          : null,
      identity,
      paint,
      geometry,
      svgGeometry,
      text,
      ancestors,
    },
  };
}

async function readReadiness(handle: CaptureHandle) {
  return handle.evaluate(readNativeCaptureState, { header: null, details: false });
}

async function readState(handle: CaptureHandle, header: CaptureHandle | null) {
  const { material, ...state } = await handle.evaluate(readNativeCaptureState, {
    header,
    details: true,
  });
  if (!material) throw new Error('Capture has no complete snapshot');
  const digest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const {
    identity,
    paint,
    geometry,
    svgGeometry,
    text,
    ancestors,
    frame,
    header: headerRect,
  } = material;
  return {
    ...state,
    frame,
    header: headerRect,
    svgGeometry,
    ancestorAttributes: ancestors.map(({ tag, attributes }) => ({ tag, attributes })),
    fingerprints: {
      identity: digest({ identity, text: text.map((entry) => entry.text) }),
      paint: digest({ paint, ancestors }),
      geometry: digest({ geometry, text: text.map((entry) => entry.rects) }),
    },
  };
}

export type PublicViewportCaptureState = Awaited<ReturnType<typeof readState>>;
export type PublicViewportStrip = {
  index: number;
  clip: PublicCaptureRect;
  documentRect: PublicCaptureRect;
  safeTop: number;
  before: PublicViewportCaptureState;
  after: PublicViewportCaptureState;
  png: { width: number; height: number; hash: string; path?: string };
};
export type PublicViewportCaptureEvidence = {
  target: PublicCaptureRect;
  bounds: 'frame' | 'union';
  scrollPolicy: 'strips' | 'preserve';
  before: PublicViewportCaptureState;
  after?: PublicViewportCaptureState;
  strips: PublicViewportStrip[];
  sourceStart: Record<string, string>;
  sourceEnd?: Record<string, string>;
  restored: boolean;
  readiness: {
    settled: boolean;
    elapsedMs: number;
    samples: {
      fontsStatus: PublicViewportCaptureState['fonts']['status'];
      runningAnimations: number;
    }[];
  };
  rejectedStrip?: {
    index: number;
    cursor: number;
    safeTop: number;
    state: PublicViewportCaptureState;
    changedInvariantFields: string[];
    changedFingerprints: string[];
  };
  failures: string[];
  limits: string[];
};
export type PublicViewportCapture = {
  evidence: PublicViewportCaptureEvidence;
  images: { index: number; bytes: Buffer; path?: string }[];
};

export class PublicViewportCaptureError extends Error {
  constructor(
    message: string,
    readonly capture: PublicViewportCapture,
  ) {
    super(message);
    this.name = 'PublicViewportCaptureError';
  }
}

function hashSources(files: readonly string[]) {
  return Object.fromEntries(
    [...new Set([__filename, ...files])].sort().map((file) => {
      if (!path.isAbsolute(file)) throw new Error('Capture source paths must be absolute');
      return [file, createHash('sha256').update(readFileSync(file)).digest('hex')];
    }),
  );
}

export function publicCapturePngDimensions(bytes: Buffer) {
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw new Error('Capture did not return a PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

export function assertPublicViewportCaptureStateEqual(
  before: PublicViewportCaptureState,
  after: PublicViewportCaptureState,
) {
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new Error('Viewport capture state changed');
}

function invariant(state: PublicViewportCaptureState) {
  return {
    viewport: state.viewport,
    document: state.document,
    media: state.media,
    fonts: state.fonts,
    frame: state.frame,
    fingerprints: state.fingerprints,
    runningAnimations: state.runningAnimations,
  };
}

function enclosingRect(box: PublicCaptureRect): PublicCaptureRect {
  return {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.ceil(box.x + box.width) - Math.floor(box.x),
    height: Math.ceil(box.y + box.height) - Math.floor(box.y),
  };
}

export function assertPublicViewportStripCoverage(evidence: PublicViewportCaptureEvidence) {
  const { target, strips } = evidence;
  if (evidence.rejectedStrip !== undefined)
    throw new Error('Viewport strip capture retains a rejected state witness');
  if (evidence.scrollPolicy !== 'strips' && evidence.scrollPolicy !== 'preserve')
    throw new Error('Viewport strip capture has an unsupported scroll policy');
  if (
    !evidence.readiness.settled ||
    !Number.isFinite(evidence.readiness.elapsedMs) ||
    evidence.readiness.elapsedMs < 0 ||
    evidence.readiness.elapsedMs >= READINESS_WINDOW_MS ||
    evidence.readiness.samples.length < 3 ||
    evidence.readiness.samples
      .slice(-2)
      .some((sample) => sample.fontsStatus !== 'loaded' || sample.runningAnimations !== 0) ||
    evidence.before.fonts.status !== 'loaded' ||
    evidence.before.runningAnimations !== 0
  )
    throw new Error('Viewport strip capture has unsettled fonts or running frame motion');
  const original =
    evidence.bounds === 'union' ? evidence.before.frame.union : evidence.before.frame.rect;
  if (JSON.stringify(target) !== JSON.stringify(enclosingRect(original)))
    throw new Error('Viewport strip target differs from the original frame bounds');
  if (!strips.length) throw new Error('Viewport strip coverage has no images');
  if (evidence.scrollPolicy === 'preserve') {
    if (strips.length !== 1)
      throw new Error('Retained viewport capture requires exactly one original strip');
    assertPublicViewportCaptureStateEqual(evidence.before, strips[0]!.before);
    assertPublicViewportCaptureStateEqual(evidence.before, strips[0]!.after);
  }
  let end = target.y;
  for (const strip of strips) {
    assertPublicViewportCaptureStateEqual(strip.before, strip.after);
    if (JSON.stringify(invariant(strip.before)) !== JSON.stringify(invariant(evidence.before)))
      throw new Error('Viewport strip frame changed across scrolling');
    const { clip, documentRect, before, png } = strip;
    if (
      strip.safeTop !==
      Math.max(0, Math.ceil((before.header?.y ?? 0) + (before.header?.height ?? 0)))
    )
      throw new Error('Viewport strip header exclusion differs from the actual header');
    if (
      clip.x < 0 ||
      clip.y < strip.safeTop ||
      clip.width <= 0 ||
      clip.height <= 0 ||
      clip.x + clip.width > before.viewport.width ||
      clip.y + clip.height > before.viewport.height
    )
      throw new Error('Viewport strip clip escapes the actual viewport');
    if (png.width !== clip.width || png.height !== clip.height)
      throw new Error('Viewport strip PNG is cropped');
    if (
      documentRect.x !== clip.x + before.scroll.x ||
      documentRect.y !== clip.y + before.scroll.y ||
      documentRect.width !== clip.width ||
      documentRect.height !== clip.height
    )
      throw new Error('Viewport strip document and viewport axes disagree');
    if (documentRect.x !== target.x || documentRect.width !== target.width)
      throw new Error('Viewport strip does not cover the target width');
    if (documentRect.y > end) throw new Error('Viewport strip coverage has a gap');
    if (
      documentRect.y < target.y ||
      documentRect.y + documentRect.height > target.y + target.height
    )
      throw new Error('Viewport strip escapes target bounds');
    end = Math.max(end, documentRect.y + documentRect.height);
  }
  if (end !== target.y + target.height)
    throw new Error('Viewport strip coverage misses the suffix');
  if (!evidence.after || !evidence.restored)
    throw new Error('Viewport strip capture did not restore the original state');
  assertPublicViewportCaptureStateEqual(evidence.before, evidence.after);
  if (JSON.stringify(evidence.sourceStart) !== JSON.stringify(evidence.sourceEnd))
    throw new Error('Viewport strip capture sources changed');
  if (evidence.failures.length) throw new Error('Viewport strip capture retains failed witnesses');
}

export function assertPublicViewportCapture(capture: PublicViewportCapture) {
  assertPublicViewportStripCoverage(capture.evidence);
  if (capture.images.length !== capture.evidence.strips.length)
    throw new Error('Viewport strip originals are missing');
  capture.evidence.strips.forEach((strip, index) => {
    const image = capture.images[index];
    if (!image || strip.index !== index || image.index !== index || image.path !== strip.png.path)
      throw new Error('Viewport strip original identity differs');
    const dimensions = publicCapturePngDimensions(image.bytes);
    if (
      dimensions.width !== strip.png.width ||
      dimensions.height !== strip.png.height ||
      createHash('sha256').update(image.bytes).digest('hex') !== strip.png.hash
    )
      throw new Error('Viewport strip original PNG differs');
  });
}

export async function readPublicViewportCaptureState(
  frame: Locator,
  stickyHeader?: Locator,
  timeout = 10_000,
) {
  const deadline = performance.now() + timeout;
  const remaining = () => Math.max(1, Math.ceil(deadline - performance.now()));
  let handle: CaptureHandle | null = null;
  let header: CaptureHandle | null = null;
  try {
    if (
      (await bounded(frame.count(), remaining(), 'Frame lookup')) !== 1 ||
      (stickyHeader && (await bounded(stickyHeader.count(), remaining(), 'Header lookup')) !== 1)
    )
      throw new Error('Capture requires one frame and one supplied header');
    handle = await frame.elementHandle({ timeout: remaining() });
    header = stickyHeader ? await stickyHeader.elementHandle({ timeout: remaining() }) : null;
    if (!handle || (stickyHeader && !header))
      throw new Error('Capture frame or supplied header is missing');
    return await bounded(readState(handle, header), remaining(), 'Capture state');
  } finally {
    await bounded(
      Promise.all([header?.dispose(), handle?.dispose()]),
      2_000,
      'Capture handle cleanup',
    );
  }
}

export async function capturePublicViewportStrips(
  page: Page,
  frame: Locator,
  options: {
    stickyHeader?: Locator;
    bounds?: 'frame' | 'union';
    preserveScroll?: boolean;
    sourceFiles?: readonly string[];
    outputPath?: (index: number) => string;
    overlap?: number;
    maxStrips?: number;
    timeout?: number;
  } = {},
): Promise<PublicViewportCapture> {
  const sourceFiles = options.sourceFiles ?? [];
  const sourceStart = hashSources(sourceFiles);
  const overlap = options.overlap ?? 32;
  const maxStrips = options.maxStrips ?? 32;
  const timeout = options.timeout ?? 30_000;
  if (options.preserveScroll !== undefined && typeof options.preserveScroll !== 'boolean')
    throw new Error('Capture needs a boolean retained-scroll option');
  const preserveScroll = options.preserveScroll ?? false;
  if (
    ![overlap, maxStrips, timeout].every((value) => Number.isInteger(value) && value > 0) ||
    maxStrips > 64
  )
    throw new Error('Capture needs finite bounded strip options');
  const deadline = performance.now() + timeout;
  const remaining = () => Math.max(1, Math.ceil(deadline - performance.now()));
  let handle: CaptureHandle | null = null;
  let header: CaptureHandle | null = null;
  const images: PublicViewportCapture['images'] = [];
  let evidence: PublicViewportCaptureEvidence | undefined;
  let failure: unknown;
  const scroll = async (x: number, y: number, budget = remaining()) => {
    await bounded(
      page.evaluate(
        async ({ x, y }) => {
          scrollTo({ left: x, top: y, behavior: 'instant' });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        },
        { x, y },
      ),
      budget,
      'Viewport scrolling',
    );
  };
  try {
    if (
      (await bounded(frame.count(), remaining(), 'Frame lookup')) !== 1 ||
      (options.stickyHeader &&
        (await bounded(options.stickyHeader.count(), remaining(), 'Header lookup')) !== 1)
    )
      throw new Error('Capture requires one frame and one supplied header');
    handle = await frame.elementHandle({ timeout: remaining() });
    header = options.stickyHeader
      ? await options.stickyHeader.elementHandle({ timeout: remaining() })
      : null;
    if (!handle || (options.stickyHeader && !header))
      throw new Error('Capture frame or supplied header is missing');
    let before = await bounded(readState(handle, header), remaining(), 'Original capture state');
    const initialState = before;
    let target = enclosingRect(options.bounds === 'union' ? before.frame.union : before.frame.rect);
    evidence = {
      target,
      bounds: options.bounds ?? 'frame',
      scrollPolicy: preserveScroll ? 'preserve' : 'strips',
      before,
      strips: [],
      sourceStart,
      restored: false,
      readiness: {
        settled: false,
        elapsedMs: 0,
        samples: [
          { fontsStatus: before.fonts.status, runningAnimations: before.runningAnimations },
        ],
      },
      failures: [],
      limits: [
        'Original viewport PNGs cover document bounds; they are not stitched or composited.',
        'SVGGeometryElement fingerprints use native local boxes and affine document matrices; raw shape rectangles remain diagnostic and still determine the unrounded target union.',
        'Native controls, focusable and editable elements and live surfaces are rejected; only static frames are supported.',
        'Only the supplied header is excluded; other overlays, internal scroll contents and glyph fallback are not certified.',
        'Only listed source files and bounded state samples are proven stable; timed-out native work requires caller context cleanup.',
      ],
    };
    const viewport = page.viewportSize();
    if (
      !viewport ||
      viewport.width !== before.viewport.width ||
      viewport.height !== before.viewport.height ||
      before.viewport.visual?.scale !== 1 ||
      before.viewport.visual.offsetLeft !== 0 ||
      before.viewport.visual.offsetTop !== 0
    )
      throw new Error('Capture has an unsupported visual viewport');
    const settlementStart = performance.now();
    const settlementDeadline = Math.min(deadline, settlementStart + READINESS_WINDOW_MS);
    const unsettledMessage = 'Capture has unsettled fonts or running frame motion';
    const readinessEvidence = evidence.readiness;
    let settledSamples = 0;
    const assertDeadline = () => {
      if (performance.now() >= settlementDeadline || readinessEvidence.samples.length >= 128)
        throw new Error(unsettledMessage);
    };
    const assertEnvironment = (
      state: Pick<PublicViewportCaptureState, 'viewport' | 'media' | 'scroll'>,
    ) => {
      if (
        JSON.stringify([state.viewport, state.media, state.scroll]) !==
        JSON.stringify([initialState.viewport, initialState.media, initialState.scroll])
      )
        throw new Error('Viewport or pointer state changed while settling');
    };
    try {
      while (settledSamples < 2) {
        const settlementRemaining = () =>
          Math.max(1, Math.ceil(settlementDeadline - performance.now()));
        assertDeadline();
        await bounded(
          page.evaluate(
            () =>
              new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
              ),
          ),
          settlementRemaining(),
          unsettledMessage,
        );
        assertDeadline();
        const readiness = await bounded(
          readReadiness(handle),
          settlementRemaining(),
          unsettledMessage,
        );
        assertDeadline();
        readinessEvidence.samples.push({
          fontsStatus: readiness.fonts.status,
          runningAnimations: readiness.runningAnimations,
        });
        assertEnvironment(readiness);
        settledSamples =
          readiness.fonts.status === 'loaded' && !readiness.runningAnimations
            ? settledSamples + 1
            : 0;
      }
      assertDeadline();
      readinessEvidence.settled = true;
    } finally {
      readinessEvidence.elapsedMs = performance.now() - settlementStart;
    }
    before = await bounded(readState(handle, header), remaining(), 'Settled capture snapshot');
    assertEnvironment(before);
    if (before.fonts.status !== 'loaded' || before.runningAnimations)
      throw new Error(unsettledMessage);
    evidence.before = before;
    target = enclosingRect(options.bounds === 'union' ? before.frame.union : before.frame.rect);
    evidence.target = target;
    if (
      !Object.values(target).every(Number.isFinite) ||
      target.width <= 0 ||
      target.height <= 0 ||
      target.width > viewport.width ||
      target.x < 0 ||
      target.y < 0 ||
      target.x + target.width > before.document.width ||
      target.y + target.height > before.document.height
    )
      throw new Error('Capture target cannot fit viewport strips');
    const maxX = Math.max(0, before.document.width - viewport.width);
    const maxY = Math.max(0, before.document.height - viewport.height);
    const x = Math.min(target.x, maxX);
    if (preserveScroll) {
      const safeTop = Math.max(
        0,
        Math.ceil((before.header?.y ?? 0) + (before.header?.height ?? 0)),
      );
      const clip = {
        x: target.x - before.scroll.x,
        y: target.y - before.scroll.y,
        width: target.width,
        height: target.height,
      };
      if (
        clip.x < 0 ||
        clip.y < safeTop ||
        clip.x + clip.width > viewport.width ||
        clip.y + clip.height > viewport.height
      )
        throw new Error(
          'Retained viewport capture needs the entire original target below the header',
        );
    }
    let cursor = target.y;
    let state = before;
    while (cursor < target.y + target.height) {
      if (evidence.strips.length >= maxStrips || performance.now() >= deadline)
        throw new Error('Capture exceeded its strip or time bound');
      let safeTop = Math.max(0, Math.ceil((state.header?.y ?? 0) + (state.header?.height ?? 0)));
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (!preserveScroll) {
          const upper = Math.max(0, Math.min(cursor - safeTop, maxY));
          const lower = Math.max(0, Math.min(target.y + target.height - viewport.height, maxY));
          const nextY = lower > upper ? upper : Math.min(upper, Math.max(state.scroll.y, lower));
          await scroll(x, nextY);
        }
        state = await bounded(readState(handle, header), remaining(), 'Strip capture state');
        safeTop = Math.max(0, Math.ceil((state.header?.y ?? 0) + (state.header?.height ?? 0)));
        if (cursor - state.scroll.y >= safeTop) break;
      }
      if (preserveScroll) assertPublicViewportCaptureStateEqual(before, state);
      if (JSON.stringify(invariant(state)) !== JSON.stringify(invariant(before))) {
        const expected = invariant(before);
        const actual = invariant(state);
        const changed = (left: object, right: object) =>
          Object.keys(left).filter(
            (key) =>
              JSON.stringify(Reflect.get(left, key)) !== JSON.stringify(Reflect.get(right, key)),
          );
        evidence.rejectedStrip = {
          index: evidence.strips.length,
          cursor,
          safeTop,
          state,
          changedInvariantFields: changed(expected, actual),
          changedFingerprints: changed(before.fingerprints, state.fingerprints),
        };
        throw new Error('Viewport strip frame changed across scrolling');
      }
      const clip = {
        x: target.x - state.scroll.x,
        y: cursor - state.scroll.y,
        width: target.width,
        height: Math.min(target.y + target.height, state.scroll.y + viewport.height) - cursor,
      };
      if (
        ![clip.x, clip.y, clip.width, clip.height].every(Number.isInteger) ||
        clip.x < 0 ||
        clip.y < safeTop ||
        clip.height <= 0 ||
        clip.x + clip.width > viewport.width ||
        clip.y + clip.height > viewport.height
      )
        throw new Error(
          'Capture strip is not fully below the current header in the actual viewport',
        );
      const index = evidence.strips.length;
      const destination = options.outputPath?.(index);
      const bytes = await page.screenshot({
        path: destination,
        type: 'png',
        fullPage: false,
        clip,
        scale: 'css',
        animations: 'allow',
        caret: 'initial',
        timeout: Math.max(1, Math.ceil(deadline - performance.now())),
      });
      const after = await bounded(readState(handle, header), remaining(), 'Post-screenshot state');
      const dimensions = publicCapturePngDimensions(bytes);
      images.push({ index, bytes, path: destination });
      evidence.strips.push({
        index,
        clip,
        documentRect: {
          x: clip.x + state.scroll.x,
          y: clip.y + state.scroll.y,
          width: clip.width,
          height: clip.height,
        },
        safeTop,
        before: state,
        after,
        png: {
          ...dimensions,
          hash: createHash('sha256').update(bytes).digest('hex'),
          path: destination,
        },
      });
      assertPublicViewportCaptureStateEqual(state, after);
      const covered = cursor + clip.height;
      if (covered === target.y + target.height) break;
      if (clip.height <= overlap) throw new Error('Capture overlap leaves no forward progress');
      cursor = covered - overlap;
    }
  } catch (error) {
    failure = error;
    evidence?.failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    if (evidence && handle) {
      try {
        const restoreDeadline = performance.now() + 5_000;
        if (!preserveScroll)
          await scroll(evidence.before.scroll.x, evidence.before.scroll.y, 5_000);
        evidence.after = await bounded(
          readState(handle, header),
          Math.max(1, Math.ceil(restoreDeadline - performance.now())),
          'Restored capture state',
        );
        assertPublicViewportCaptureStateEqual(evidence.before, evidence.after);
        evidence.restored = true;
      } catch (error) {
        evidence.failures.push(error instanceof Error ? error.message : String(error));
        failure ??= error;
      }
      try {
        evidence.sourceEnd = hashSources(sourceFiles);
      } catch (error) {
        evidence.failures.push(error instanceof Error ? error.message : String(error));
        failure ??= error;
      }
    }
    try {
      await bounded(
        Promise.all([header?.dispose(), handle?.dispose()]),
        2_000,
        'Capture handle cleanup',
      );
    } catch (error) {
      evidence?.failures.push(error instanceof Error ? error.message : String(error));
      failure ??= error;
    }
  }
  if (!evidence) throw failure ?? new Error('Capture has no original state');
  const capture = { evidence, images };
  try {
    if (failure) throw failure;
    assertPublicViewportCapture(capture);
  } catch (error) {
    throw new PublicViewportCaptureError(
      error instanceof Error ? error.message : String(error),
      capture,
    );
  }
  return capture;
}
