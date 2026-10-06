export type PublicTypographyOptions = {
  pageType: 'marketing' | 'docs' | 'legal';
  pathname?: string;
  scopeSelector?: string;
};

export type PublicTypographyIssue = {
  kind: string;
  selector: string;
  text: string;
  actual?: number;
  expected?: string;
  sourceKey?: string;
};

export type PublicTypographyRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type PublicTypographyRgba = { r: number; g: number; b: number; a: number };

export type PublicTypographySample = {
  sourceKey: string;
  selector: string;
  text: string;
  kind: 'text' | 'placeholder' | 'value' | 'pseudo-before' | 'pseudo-after';
  role: string;
  fontFamily: string;
  declaredSize: number;
  renderedSize: number | null;
  scaleX: number | null;
  scaleY: number | null;
  weight: number;
  mono: boolean;
  lineHeightRatio: number | null;
  rects: PublicTypographyRect[];
  foreground: PublicTypographyRgba | null;
  color: string;
  cumulativeOpacity: number;
  backgroundLayers: {
    selector: string;
    color: string;
    rgba: PublicTypographyRgba | null;
    opacity: number;
    image: string;
    filter: string;
    backdropFilter: string;
    blendMode: string;
    visibility: string;
  }[];
  paintUnmeasured: string[];
};

export type PublicTypographyReport = {
  scope?: { selector: string; elementIndex: number; tag: string; label: string | null };
  findings: PublicTypographyIssue[];
  unmeasured: PublicTypographyIssue[];
  excluded: { selector: string; text: string; reason: string }[];
  samples: PublicTypographySample[];
  lines: { selector: string; kind: 'heading' | 'running'; lines: string[]; longest: number }[];
  scrollContainers: {
    key: string;
    selector: string;
    elementIndex: number;
    x: number;
    y: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    viewport: PublicTypographyRect;
  }[];
  scrollCoverage: {
    sourceKey: string;
    sourceText: string;
    containerKeys: string[];
    requiredRanges: [number, number][];
    visibleRanges: [number, number][];
  }[];
  coverage: {
    textNodes: number;
    paintedTextNodes: number;
    textSamples: number;
    runningBlocks: number;
    headings: number;
    generatedText: number;
    excluded: number;
    unsupported: number;
  };
  canvasColorScheme: string;
  canvasColor: PublicTypographyRgba | null;
  prefersDark: boolean;
};

export function scanPublicTypography(
  options: PublicTypographyOptions = { pageType: 'marketing' },
): PublicTypographyReport {
  const findings: PublicTypographyIssue[] = [];
  const unmeasured: PublicTypographyIssue[] = [];
  const excluded: PublicTypographyReport['excluded'] = [];
  const samples: PublicTypographySample[] = [];
  const lines: PublicTypographyReport['lines'] = [];
  const scrollContainers: PublicTypographyReport['scrollContainers'] = [];
  const scrollCoverage: PublicTypographyReport['scrollCoverage'] = [];
  const coverage = {
    textNodes: 0,
    paintedTextNodes: 0,
    textSamples: 0,
    runningBlocks: 0,
    headings: 0,
    generatedText: 0,
    excluded: 0,
    unsupported: 0,
  };
  const root = document.documentElement;
  const canvasColorScheme = getComputedStyle(root).colorScheme;
  let canvasColor: PublicTypographyRgba | null = null;
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  let scope: PublicTypographyReport['scope'];
  let scopeElement: Element | undefined;
  const finish = (): PublicTypographyReport => {
    coverage.textSamples = samples.length;
    coverage.excluded = excluded.length;
    coverage.unsupported = unmeasured.length;
    return {
      findings,
      unmeasured,
      excluded,
      samples,
      lines,
      scrollContainers,
      scrollCoverage,
      coverage,
      canvasColorScheme,
      canvasColor,
      prefersDark,
      ...(scope ? { scope } : {}),
    };
  };
  if (!document.body) {
    unmeasured.push({ kind: 'missing-body', selector: 'html', text: '' });
    return finish();
  }
  if (options.scopeSelector !== undefined) {
    if (typeof options.scopeSelector !== 'string' || !options.scopeSelector.trim())
      throw new Error('Typography scopeSelector must be a non-empty selector');
    const matches = document.querySelectorAll(options.scopeSelector);
    if (matches.length !== 1)
      throw new Error('Typography scopeSelector must resolve exactly one element');
    const element = matches[0]!;
    if (!element.isConnected || !document.body.contains(element))
      throw new Error('Typography scopeSelector must resolve inside the connected body');
    scopeElement = element;
    scope = {
      selector: options.scopeSelector,
      elementIndex: [...document.querySelectorAll('*')].indexOf(element),
      tag: element.localName,
      label: element.getAttribute('aria-label'),
    };
  }
  const owns = (element: Element) => !scopeElement || scopeElement.contains(element);
  if (document.fonts.status !== 'loaded') {
    unmeasured.push({ kind: 'fonts-not-settled', selector: 'html', text: '' });
  }
  const tolerance = 0.05;
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const styleOf = (element: Element) => {
    let style = styles.get(element);
    if (!style) {
      style = getComputedStyle(element);
      styles.set(element, style);
    }
    return style;
  };
  const selectorOf = (element: Element) => {
    if (element.id) return `#${CSS.escape(element.id)}`;
    const testId = element.getAttribute('data-testid');
    if (testId) return `${element.localName}[data-testid=${JSON.stringify(testId)}]`;
    const classes = [...element.classList]
      .slice(0, 3)
      .map((name) => `.${CSS.escape(name)}`)
      .join('');
    return element.localName + classes;
  };
  const issue = (
    collection: PublicTypographyIssue[],
    kind: string,
    element: Element,
    text: string,
    actual?: number,
    expected?: string,
  ) => collection.push({ kind, selector: selectorOf(element), text, actual, expected });
  const firstFamily = (value: string) =>
    (value.split(',')[0] ?? '')
      .trim()
      .replace(/^['"]|['"]$/g, '')
      .toLowerCase();
  const rectOf = (rect: DOMRect | PublicTypographyRect): PublicTypographyRect => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
  });
  const intersection = (left: PublicTypographyRect, right: PublicTypographyRect) => {
    const box = {
      left: Math.max(left.left, right.left),
      top: Math.max(left.top, right.top),
      right: Math.min(left.right, right.right),
      bottom: Math.min(left.bottom, right.bottom),
      width: 0,
      height: 0,
    };
    box.width = Math.max(0, box.right - box.left);
    box.height = Math.max(0, box.bottom - box.top);
    return box;
  };
  const ancestry = (element: Element) => {
    const elements: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) {
      elements.push(current);
    }
    return elements;
  };
  const bounds = new WeakMap<Element, PublicTypographyRect>();
  const boundsOf = (element: Element) => {
    let box = bounds.get(element);
    if (!box) {
      box = rectOf(element.getBoundingClientRect());
      bounds.set(element, box);
    }
    return box;
  };
  const backing = document.createElement('canvas');
  backing.width = 1;
  backing.height = 1;
  const pen = backing.getContext('2d', { willReadFrequently: true });
  const colors = new Map<string, PublicTypographyRgba | null>();
  const rgba = (value: string): PublicTypographyRgba | null => {
    if (colors.has(value)) return colors.get(value) ?? null;
    if (!pen || !CSS.supports('color', value)) return null;
    pen.globalCompositeOperation = 'copy';
    pen.fillStyle = 'rgba(0, 0, 0, 0)';
    pen.fillStyle = value;
    pen.fillRect(0, 0, 1, 1);
    const values = pen.getImageData(0, 0, 1, 1).data;
    const result = { r: values[0]!, g: values[1]!, b: values[2]!, a: values[3]! / 255 };
    colors.set(value, result);
    return result;
  };
  const canvasProbe = document.createElement('div');
  canvasProbe.style.cssText =
    'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none;background-color:Canvas;';
  root.append(canvasProbe);
  try {
    canvasColor = rgba(getComputedStyle(canvasProbe).backgroundColor);
  } finally {
    canvasProbe.remove();
  }
  if (!canvasColor)
    unmeasured.push({ kind: 'unresolved-canvas-color', selector: 'html', text: '' });
  const transforms = new WeakMap<
    Element,
    { x: number | null; y: number | null; axisAligned: boolean; reason?: string }
  >();
  const transformOf = (element: Element) => {
    const existing = transforms.get(element);
    if (existing) return existing;
    let matrix = new DOMMatrix();
    let reason: string | undefined;
    for (const ancestor of ancestry(element).reverse()) {
      const style = styleOf(ancestor);
      if (style.perspective !== 'none') {
        reason = 'perspective';
        break;
      }
      let local = new DOMMatrix();
      const rotation = style.getPropertyValue('rotate');
      if (rotation && rotation !== 'none') {
        const angle = rotation.match(/^(?:z\s+)?(-?[\d.]+)(deg|rad|grad|turn)$/);
        if (!angle) {
          reason = 'individual-3d-rotate';
          break;
        }
        const factors: Record<string, number> = {
          deg: 1,
          rad: 180 / Math.PI,
          grad: 0.9,
          turn: 360,
        };
        const factor = factors[angle[2]!];
        local = local.rotate(Number(angle[1]) * (factor ?? Number.NaN));
      }
      const scale = style.getPropertyValue('scale');
      if (scale && scale !== 'none') {
        const parts = scale
          .trim()
          .split(/\s+/)
          .map((part) =>
            /^-?[\d.]+%?$/.test(part)
              ? parseFloat(part) / (part.endsWith('%') ? 100 : 1)
              : Number.NaN,
          );
        if (parts.length > 2 || parts.some((part) => !Number.isFinite(part))) {
          reason = 'individual-3d-scale';
          break;
        }
        local = local.scale(parts[0]!, parts[1] ?? parts[0]!);
      }
      const translation = style.getPropertyValue('translate');
      if (translation && translation !== 'none' && translation.trim().split(/\s+/).length > 2) {
        reason = 'individual-3d-translate';
        break;
      }
      if (style.transform !== 'none') {
        const transform = new DOMMatrix(style.transform);
        if (!transform.is2D) {
          reason = '3d-transform';
          break;
        }
        local = local.multiply(transform);
      }
      const zoomValue = style.getPropertyValue('zoom');
      const zoom =
        !zoomValue || zoomValue === 'normal'
          ? 1
          : parseFloat(zoomValue) / (zoomValue.endsWith('%') ? 100 : 1);
      if (!Number.isFinite(zoom) || zoom <= 0) {
        reason = 'invalid-zoom';
        break;
      }
      matrix = matrix.multiply(local.scale(zoom));
    }
    const x = Math.hypot(matrix.a, matrix.b);
    const y = Math.hypot(matrix.c, matrix.d);
    if (!reason && (!Number.isFinite(x) || !Number.isFinite(y))) reason = 'invalid-transform';
    const axisAligned = Math.abs(matrix.b) < tolerance && Math.abs(matrix.c) < tolerance;
    const result = reason
      ? { x: null, y: null, axisAligned: false, reason }
      : { x, y, axisAligned };
    transforms.set(element, result);
    return result;
  };
  const hiddenReason = (element: Element) => {
    const ownStyle = styleOf(element);
    if (ownStyle.visibility === 'hidden' || ownStyle.visibility === 'collapse') return 'visibility';
    for (const ancestor of ancestry(element)) {
      const style = styleOf(ancestor);
      if (style.display === 'none') return 'display-none';
      if (style.getPropertyValue('content-visibility') === 'hidden') return 'content-visibility';
      if (Number(style.opacity) === 0) return 'opacity-zero';
      const clip = style.clip.replace(/[,\s]+/g, '');
      if (/^rect\(0(?:px)?0(?:px)?0(?:px)?0(?:px)?\)$/.test(clip)) return 'zero-clip';
      if (/^inset\(50%(?:\s+50%){0,3}\)$/.test(style.clipPath)) return 'zero-clip-path';
    }
    return null;
  };
  const elementIndexes = new WeakMap<Element, number>();
  [...document.querySelectorAll('*')].forEach((element, index) =>
    elementIndexes.set(element, index),
  );
  const scrollers = new WeakMap<
    Element,
    PublicTypographyReport['scrollContainers'][number] | null
  >();
  const scrollContainerOf = (element: Element) => {
    if (scrollers.has(element)) return scrollers.get(element) ?? null;
    const style = styleOf(element);
    const horizontal =
      /^(auto|scroll|overlay)$/.test(style.overflowX) &&
      element.scrollWidth > element.clientWidth + 1;
    const vertical =
      /^(auto|scroll|overlay)$/.test(style.overflowY) &&
      element.scrollHeight > element.clientHeight + 1;
    if (element === root || element === document.body || (!horizontal && !vertical)) {
      scrollers.set(element, null);
      return null;
    }
    const box = boundsOf(element);
    const transform = transformOf(element);
    const scaleX = transform.x ?? 1;
    const scaleY = transform.y ?? 1;
    const left = box.left + element.clientLeft * scaleX;
    const top = box.top + element.clientTop * scaleY;
    const elementIndex = elementIndexes.get(element)!;
    const horizontalExtent = horizontal ? element.scrollWidth - element.clientWidth : 0;
    const verticalExtent = vertical ? element.scrollHeight - element.clientHeight : 0;
    const rtl = style.direction === 'rtl';
    const viewport = rectOf({
      left,
      top,
      right: left + element.clientWidth * scaleX,
      bottom: top + element.clientHeight * scaleY,
      width: element.clientWidth * scaleX,
      height: element.clientHeight * scaleY,
    });
    const result = {
      key: `element:${elementIndex}`,
      selector: selectorOf(element),
      elementIndex,
      x: element.scrollLeft,
      y: element.scrollTop,
      minX: rtl ? -horizontalExtent : 0,
      maxX: rtl ? 0 : horizontalExtent,
      minY: 0,
      maxY: verticalExtent,
      viewport,
    };
    scrollers.set(element, result);
    scrollContainers.push(result);
    if (
      style.writingMode !== 'horizontal-tb' ||
      (/^(inline-)?flex$/.test(style.display) && /-reverse$/.test(style.flexDirection))
    )
      issue(
        unmeasured,
        'unsupported-scroll-coordinate-system',
        element,
        '',
        undefined,
        `${style.writingMode};${style.flexDirection}`,
      );
    return result;
  };
  const clippedRects = (element: Element, source: PublicTypographyRect[]) => {
    let rectangles = source;
    let permanentRectangles = source;
    let clipped = false;
    let unsupported: string | null = null;
    const scrollAxes = { x: [] as string[], y: [] as string[] };
    const pendingScrolls = new Set<string>();
    const containerKeys = new Set<string>();
    const apply = (input: PublicTypographyRect[], clip: PublicTypographyRect) =>
      input
        .map((rect) => intersection(rect, clip))
        .filter((rect) => rect.width > tolerance && rect.height > tolerance);
    const losesGeometry = (input: PublicTypographyRect[], output: PublicTypographyRect[]) =>
      input.length !== output.length ||
      input.some((rect, index) => {
        const next = output[index];
        return !next || next.width < rect.width - 1 || next.height < rect.height - 1;
      });
    for (const ancestor of ancestry(element)) {
      const style = styleOf(ancestor);
      const bounds = boundsOf(ancestor);
      const scroller = scrollContainerOf(ancestor);
      if (scroller) {
        containerKeys.add(scroller.key);
        if (!transformOf(ancestor).axisAligned) unsupported = 'rotated-scrollport';
        else {
          if (scroller.minX !== scroller.maxX) scrollAxes.x.push(scroller.key);
          if (scroller.minY !== scroller.maxY) scrollAxes.y.push(scroller.key);
          const viewport = {
            left: /^(auto|scroll|overlay|hidden|clip)$/.test(style.overflowX)
              ? scroller.viewport.left
              : -Infinity,
            right: /^(auto|scroll|overlay|hidden|clip)$/.test(style.overflowX)
              ? scroller.viewport.right
              : Infinity,
            top: /^(auto|scroll|overlay|hidden|clip)$/.test(style.overflowY)
              ? scroller.viewport.top
              : -Infinity,
            bottom: /^(auto|scroll|overlay|hidden|clip)$/.test(style.overflowY)
              ? scroller.viewport.bottom
              : Infinity,
            width: scroller.viewport.width,
            height: scroller.viewport.height,
          };
          const next = apply(rectangles, viewport);
          if (losesGeometry(rectangles, next)) {
            for (const key of [...scrollAxes.x, ...scrollAxes.y]) pendingScrolls.add(key);
          }
          rectangles = next;
        }
      }
      let clip: PublicTypographyRect | null = null;
      if (
        style.display !== 'inline' &&
        style.display !== 'contents' &&
        (/^(hidden|clip)$/.test(style.overflowX) || /^(hidden|clip)$/.test(style.overflowY))
      ) {
        clip = {
          left: /^(hidden|clip)$/.test(style.overflowX) ? bounds.left : -Infinity,
          right: /^(hidden|clip)$/.test(style.overflowX) ? bounds.right : Infinity,
          top: /^(hidden|clip)$/.test(style.overflowY) ? bounds.top : -Infinity,
          bottom: /^(hidden|clip)$/.test(style.overflowY) ? bounds.bottom : Infinity,
          width: bounds.width,
          height: bounds.height,
        };
      }
      if (style.clipPath !== 'none') {
        const inset = style.clipPath.match(/^inset\(([^)]+)\)$/);
        const values = inset?.[1]?.trim().split(/\s+/);
        if (
          !values ||
          values.length > 4 ||
          values.some((value) => !/^-?[\d.]+(?:px|%)$/.test(value))
        ) {
          unsupported = 'unsupported-clip-path';
        } else {
          const expanded = [
            values[0]!,
            values[1] ?? values[0]!,
            values[2] ?? values[0]!,
            values[3] ?? values[1] ?? values[0]!,
          ];
          const offsets = expanded.map(
            (value, index) =>
              parseFloat(value) *
              (value.endsWith('%') ? (index % 2 ? bounds.width : bounds.height) / 100 : 1),
          );
          const insetBox = {
            left: bounds.left + offsets[3]!,
            top: bounds.top + offsets[0]!,
            right: bounds.right - offsets[1]!,
            bottom: bounds.bottom - offsets[2]!,
            width: 0,
            height: 0,
          };
          clip = clip ? intersection(clip, insetBox) : insetBox;
        }
      }
      if (
        style.clip !== 'auto' &&
        !/^rect\(0(?:px)?[,\s]+0(?:px)?[,\s]+0(?:px)?[,\s]+0(?:px)?\)$/.test(style.clip)
      ) {
        unsupported = 'nonzero-legacy-clip';
      }
      if (clip) {
        if (!transformOf(ancestor).axisAligned) {
          unsupported = 'rotated-clipping';
          continue;
        }
        const permanentClip = {
          left: scrollAxes.x.length ? -Infinity : clip.left,
          right: scrollAxes.x.length ? Infinity : clip.right,
          top: scrollAxes.y.length ? -Infinity : clip.top,
          bottom: scrollAxes.y.length ? Infinity : clip.bottom,
          width: clip.width,
          height: clip.height,
        };
        const permanentNext = apply(permanentRectangles, permanentClip);
        if (losesGeometry(permanentRectangles, permanentNext)) clipped = true;
        permanentRectangles = permanentNext;
        const next = apply(rectangles, clip);
        if (losesGeometry(rectangles, next)) {
          for (const key of [...scrollAxes.x, ...scrollAxes.y]) pendingScrolls.add(key);
        }
        rectangles = next;
      }
    }
    return {
      rectangles,
      permanentRectangles,
      clipped,
      unsupported,
      pendingScrolls: [...pendingScrolls],
      containerKeys: [...containerKeys],
    };
  };
  const blockOf = (element: Element) => {
    const block = element.closest('h1,h2,h3,h4,h5,h6,[role="heading"],p,li,dd,dt,blockquote');
    const illustration = element.closest('figure,svg,pre,.agi-dev,[data-illustration]');
    return block && illustration && !illustration.contains(block) ? null : block;
  };
  const isHeading = (element: Element) => element.matches('h1,h2,h3,h4,h5,h6,[role="heading"]');
  const isRunning = (element: Element) =>
    !isHeading(element) &&
    !element.closest('header,footer,nav,figure,svg,pre,.agi-dev,[data-illustration]');
  const wordmarkOf = (element: Element, text: string) => {
    const wordmark = element.closest(
      '.agi-mark-word,.agi-footer-wordmark,.agi-footer-mark-word,.agi-fl-hero-brand,.agi-ds-wordmark,.agi-ds-footer-wordmark',
    );
    return text.trim() === 'AGI' && wordmark?.textContent?.replace(/\s+/g, ' ').trim() === 'AGI';
  };
  const roleOf = (element: Element, text: string, mono: boolean) => {
    if (wordmarkOf(element, text)) return 'wordmark';
    const heading = element.closest('h1,h2,h3,h4,h5,h6,[role="heading"]');
    if (heading) {
      const navigation = heading.closest('nav,[role="navigation"]');
      const landmark = heading.closest('header,footer,[role="banner"],[role="contentinfo"]');
      if (
        navigation ||
        (landmark &&
          (landmark.matches('[role="banner"],[role="contentinfo"]') ||
            !landmark.closest('main,article,aside,section')))
      )
        return 'ui';
      if (
        (options.pathname ?? location.pathname) === '/' &&
        heading.closest('.agi-home-hero,.agi-fl-hero,.agi-lp-hero')
      )
        return 'home-hero';
      return heading.matches('h1,[role="heading"][aria-level="1"]')
        ? 'page-title'
        : 'section-heading';
    }
    if (element.closest('.agi-ds-lede,.agi-ds-pagehead-lede,[data-public-type="lede"]'))
      return 'lede';
    if (element.closest('sup,sub')) return 'ui';
    if (element.closest('code,pre,kbd,samp')) return 'code';
    const block = blockOf(element);
    if (block && isRunning(block)) return options.pageType === 'marketing' ? 'body' : 'reading';
    if (mono) return 'code';
    return 'ui';
  };
  const allowedSize = (size: number, role: string, mono: boolean, element: Element) => {
    const between = (minimum: number, maximum: number) =>
      size >= minimum - tolerance && size <= maximum + tolerance;
    if (role === 'body') return between(17, 18);
    if (role === 'reading') return between(16, 17);
    if (role === 'lede') return between(20, 22);
    if (role === 'section-heading') return between(24, 30);
    if (role === 'page-title') return between(34, 48);
    if (role === 'home-hero') return size >= 34 - tolerance;
    if (
      role === 'wordmark' &&
      (options.pathname ?? location.pathname) === '/' &&
      element.closest('.agi-fl-hero')
    )
      return size >= 14 - tolerance;
    return (
      Math.abs(size - 14) <= tolerance ||
      (mono && Math.abs(size - 15) <= tolerance) ||
      Math.abs(size - 16) <= tolerance ||
      between(17, 18) ||
      between(20, 22) ||
      (role === 'wordmark' && (between(24, 30) || between(34, 48)))
    );
  };
  const blocks = new Set<Element>();
  const graphemes = new Intl.Segmenter(document.documentElement.lang || 'en', {
    granularity: 'grapheme',
  });
  const words = new Intl.Segmenter(document.documentElement.lang || 'en', { granularity: 'word' });
  const mergedRanges = (ranges: [number, number][]) => {
    const merged: [number, number][] = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && previous[1] >= range[0]) previous[1] = Math.max(previous[1], range[1]);
      else merged.push([range[0], range[1]]);
    }
    return merged;
  };
  const sampleFor = (
    element: Element,
    text: string,
    kind: PublicTypographySample['kind'],
    style: CSSStyleDeclaration,
    source: PublicTypographyRect[],
    sourceKey: string,
    sourceNode?: Text,
  ) => {
    const hidden = hiddenReason(element);
    if (
      hidden ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0
    ) {
      excluded.push({ selector: selectorOf(element), text, reason: hidden ?? 'generated-hidden' });
      return;
    }
    const generated = kind.startsWith('pseudo-');
    const clipped = generated
      ? {
          rectangles: source,
          permanentRectangles: source,
          clipped: false,
          unsupported: null,
          pendingScrolls: [] as string[],
          containerKeys: [] as string[],
        }
      : clippedRects(element, source);
    if (generated) issue(unmeasured, 'generated-text-geometry', element, text);
    if (clipped.clipped) issue(findings, 'text-clipped', element, text);
    if (clipped.unsupported) issue(unmeasured, clipped.unsupported, element, text);
    if (
      !generated &&
      (!source.length || (!clipped.rectangles.length && !clipped.pendingScrolls.length))
    ) {
      excluded.push({
        selector: selectorOf(element),
        text,
        reason: source.length ? 'fully-clipped' : 'no-text-geometry',
      });
      return;
    }
    if (clipped.pendingScrolls.length) {
      unmeasured.push({
        kind: 'unobserved-scroll-state',
        selector: selectorOf(element),
        text,
        sourceKey,
        expected: clipped.pendingScrolls.join(','),
      });
    }
    if (sourceNode && clipped.containerKeys.length) {
      const requiredRanges: [number, number][] = [];
      const visibleRanges: [number, number][] = [];
      for (const segment of graphemes.segment(sourceNode.data)) {
        const range = document.createRange();
        range.setStart(sourceNode, segment.index);
        range.setEnd(sourceNode, segment.index + segment.segment.length);
        const rectangles = [...range.getClientRects()]
          .filter((rect) => rect.width > tolerance && rect.height > tolerance)
          .map(rectOf);
        if (!rectangles.length || /^\s+$/u.test(segment.segment)) continue;
        const interval: [number, number] = [segment.index, segment.index + segment.segment.length];
        requiredRanges.push(interval);
        const glyph = clippedRects(element, rectangles);
        if (
          !glyph.unsupported &&
          !glyph.clipped &&
          !glyph.pendingScrolls.length &&
          glyph.rectangles.length === rectangles.length
        )
          visibleRanges.push(interval);
      }
      scrollCoverage.push({
        sourceKey,
        sourceText: sourceNode.data,
        containerKeys: clipped.containerKeys,
        requiredRanges: mergedRanges(requiredRanges),
        visibleRanges: mergedRanges(visibleRanges),
      });
      if (!requiredRanges.length) issue(unmeasured, 'missing-scroll-text-geometry', element, text);
    } else if (!generated && clipped.containerKeys.length) {
      scrollCoverage.push({
        sourceKey,
        sourceText: text,
        containerKeys: clipped.containerKeys,
        requiredRanges: [[0, text.length]],
        visibleRanges:
          !clipped.clipped && !clipped.unsupported && !clipped.pendingScrolls.length
            ? [[0, text.length]]
            : [],
      });
    }
    const family = firstFamily(style.fontFamily);
    const sans = firstFamily(styleOf(element).getPropertyValue('--font-geist-sans'));
    const canonicalMono = firstFamily(styleOf(element).getPropertyValue('--font-geist-mono'));
    const mono =
      Boolean(element.closest('code,pre,kbd,samp')) ||
      (Boolean(canonicalMono) && family === canonicalMono) ||
      /mono/i.test(style.fontFamily);
    const role = roleOf(element, text, mono);
    const declaredSize = parseFloat(style.fontSize);
    const transform = transformOf(element);
    const renderedSize =
      transform.x !== null && transform.y !== null
        ? declaredSize * Math.min(transform.x, transform.y)
        : null;
    const sizeFloor = Math.max(mono ? 15 : 14, role === 'body' ? 17 : role === 'reading' ? 16 : 14);
    if (!Number.isFinite(declaredSize) || declaredSize <= 0)
      issue(unmeasured, 'invalid-font-size', element, text);
    else {
      if (declaredSize < sizeFloor - tolerance)
        issue(findings, 'declared-size-floor', element, text, declaredSize, `>=${sizeFloor}px`);
      if (!allowedSize(declaredSize, role, mono, element))
        issue(findings, 'size-outside-scale', element, text, declaredSize, role);
    }
    if (transform.reason)
      issue(unmeasured, 'unsupported-text-transform', element, text, undefined, transform.reason);
    if (renderedSize !== null && renderedSize < sizeFloor - tolerance)
      issue(findings, 'rendered-size-floor', element, text, renderedSize, `>=${sizeFloor}px`);
    if (
      renderedSize !== null &&
      Math.abs(renderedSize - declaredSize) > tolerance &&
      !allowedSize(renderedSize, role, mono, element)
    )
      issue(findings, 'rendered-size-outside-scale', element, text, renderedSize, role);
    const headingFamilyRequired = Boolean(element.closest('h1,h2,h3,h4,h5,h6,[role="heading"]'));
    const expectedFamily = mono && !headingFamilyRequired ? canonicalMono : sans;
    if (!expectedFamily && role !== 'wordmark')
      issue(
        unmeasured,
        'missing-canonical-font',
        element,
        text,
        undefined,
        mono ? '--font-geist-mono' : '--font-geist-sans',
      );
    else if (role !== 'wordmark' && family !== expectedFamily)
      issue(findings, 'font-family', element, text, undefined, expectedFamily);
    const lineHeight = parseFloat(style.lineHeight);
    const lineHeightRatio =
      Number.isFinite(lineHeight) && declaredSize > 0 ? lineHeight / declaredSize : null;
    if (
      role === 'reading' &&
      (lineHeightRatio === null || lineHeightRatio < 1.595 || lineHeightRatio > 1.755)
    )
      issue(
        findings,
        'reading-line-height',
        element,
        text,
        lineHeightRatio ?? undefined,
        '1.6–1.75',
      );
    const backgroundLayers = ancestry(element).map((ancestor) => {
      const background = styleOf(ancestor);
      return {
        selector: selectorOf(ancestor),
        color: background.backgroundColor,
        rgba: rgba(background.backgroundColor),
        opacity: Number(background.opacity),
        image: background.backgroundImage,
        filter: background.filter,
        backdropFilter: background.getPropertyValue('backdrop-filter'),
        blendMode: background.mixBlendMode,
        visibility: background.visibility,
      };
    });
    if (kind.startsWith('pseudo-') || kind === 'placeholder') {
      backgroundLayers.unshift({
        selector: `${selectorOf(element)}::${kind === 'placeholder' ? 'placeholder' : kind.slice(7)}`,
        color: style.backgroundColor,
        rgba: rgba(style.backgroundColor),
        opacity: Number(style.opacity),
        image: style.backgroundImage,
        filter: style.filter,
        backdropFilter: style.getPropertyValue('backdrop-filter'),
        blendMode: style.mixBlendMode,
        visibility: style.visibility,
      });
    }
    const cumulativeOpacity = backgroundLayers.reduce(
      (product, layer) => product * layer.opacity,
      1,
    );
    if (cumulativeOpacity < 1 - tolerance / 100)
      issue(findings, 'text-opacity', element, text, cumulativeOpacity, '1');
    const paintUnmeasured: string[] = [];
    if (generated) paintUnmeasured.push('generated-text-geometry');
    if (clipped.pendingScrolls.length) paintUnmeasured.push('unobserved-scroll-state');
    for (const ancestor of ancestry(element)) {
      const paint = styleOf(ancestor);
      if (paint.filter !== 'none') paintUnmeasured.push('filter');
      if (
        paint.getPropertyValue('backdrop-filter') &&
        paint.getPropertyValue('backdrop-filter') !== 'none'
      )
        paintUnmeasured.push('backdrop-filter');
      if (paint.mixBlendMode !== 'normal') paintUnmeasured.push('blend-mode');
      const mask =
        paint.getPropertyValue('mask-image') ||
        paint.getPropertyValue('-webkit-mask-image') ||
        'none';
      if (mask !== 'none') paintUnmeasured.push('mask-image');
    }
    const color = style.getPropertyValue('-webkit-text-fill-color') || style.color;
    const foreground = rgba(color);
    if (!foreground) paintUnmeasured.push('foreground-color');
    if (foreground?.a === 0) paintUnmeasured.push('transparent-text-fill');
    if (
      (style.getPropertyValue('background-clip') ||
        style.getPropertyValue('-webkit-background-clip')) === 'text'
    )
      paintUnmeasured.push('background-clip-text');
    if (parseFloat(style.getPropertyValue('-webkit-text-stroke-width')) > 0)
      paintUnmeasured.push('text-stroke');
    samples.push({
      sourceKey,
      selector: selectorOf(element),
      text,
      kind,
      role,
      fontFamily: style.fontFamily,
      declaredSize,
      renderedSize,
      scaleX: transform.x,
      scaleY: transform.y,
      weight: Number(style.fontWeight),
      mono,
      lineHeightRatio,
      rects: clipped.rectangles,
      foreground,
      color,
      cumulativeOpacity,
      backgroundLayers,
      paintUnmeasured: [...new Set(paintUnmeasured)],
    });
    if (kind === 'text') {
      coverage.paintedTextNodes += 1;
      const block = blockOf(element);
      if (block && (isHeading(block) || isRunning(block)) && role !== 'wordmark') {
        if (!owns(block))
          issue(unmeasured, 'scope-enclosing-block', element, text, undefined, selectorOf(block));
        else blocks.add(block);
      }
    } else coverage.generatedText += 1;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let sourceTextIndex = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const element = node.parentElement;
    if (!element || element.closest('script,style,noscript,textarea,option')) continue;
    const text = node.data.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    sourceTextIndex += 1;
    if (!owns(element)) continue;
    coverage.textNodes += 1;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rectangles = [...range.getClientRects()]
      .filter((rect) => rect.width > tolerance && rect.height > tolerance)
      .map(rectOf);
    sampleFor(element, text, 'text', styleOf(element), rectangles, `text:${sourceTextIndex}`, node);
  }
  for (const element of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    'input:not([type="hidden"]),textarea',
  )) {
    if (!owns(element)) continue;
    const input = element instanceof HTMLInputElement ? element : null;
    if (input && /^(checkbox|radio|range|color)$/.test(input.type)) continue;
    if (input && /^(file|date|datetime-local|month|week|time)$/.test(input.type)) {
      if (!hiddenReason(element))
        issue(unmeasured, 'native-control-text', element, '', undefined, input.type);
      continue;
    }
    const text =
      input?.type === 'password' && element.value
        ? '•'.repeat(element.value.length)
        : element.value || element.getAttribute('placeholder');
    if (!text && input && /^(submit|reset)$/.test(input.type) && !hiddenReason(element))
      issue(unmeasured, 'native-input-label', element, '', undefined, input.type);
    if (!text) continue;
    const kind = element.value ? 'value' : 'placeholder';
    const style =
      kind === 'placeholder' ? getComputedStyle(element, '::placeholder') : styleOf(element);
    sampleFor(
      element,
      text,
      kind,
      style,
      [boundsOf(element)],
      `control:${elementIndexes.get(element)}`,
    );
  }
  for (const element of document.querySelectorAll<HTMLSelectElement>('select')) {
    if (!owns(element)) continue;
    const text = [...element.selectedOptions]
      .map((option) => option.textContent ?? '')
      .join(' ')
      .trim();
    if (text)
      sampleFor(
        element,
        text,
        'value',
        styleOf(element),
        [boundsOf(element)],
        `control:${elementIndexes.get(element)}`,
      );
  }
  const generatedElements = scopeElement
    ? [scopeElement, ...scopeElement.querySelectorAll('*')]
    : [...document.body.querySelectorAll('*')];
  for (const element of generatedElements) {
    if (element.closest('script,style,noscript')) continue;
    for (const pseudo of ['before', 'after'] as const) {
      const style = getComputedStyle(element, `::${pseudo}`);
      const content = style.content;
      if (!content || content === 'none' || content === 'normal' || content === '""') continue;
      if (
        hiddenReason(element) ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0
      )
        continue;
      let text: string;
      try {
        text = JSON.parse(content) as string;
      } catch {
        issue(unmeasured, 'unsupported-generated-content', element, content);
        continue;
      }
      if (!/[\p{L}\p{N}]/u.test(text)) continue;
      sampleFor(
        element,
        text,
        `pseudo-${pseudo}`,
        style,
        [boundsOf(element)],
        `pseudo:${elementIndexes.get(element)}:${pseudo}`,
      );
      const block = blockOf(element);
      if (block && (isHeading(block) || isRunning(block))) {
        if (!owns(block))
          issue(unmeasured, 'scope-enclosing-block', element, text, undefined, selectorOf(block));
        else issue(unmeasured, 'generated-prose-line-geometry', element, text);
      }
    }
  }
  for (const block of blocks) {
    const heading = isHeading(block);
    if (heading) coverage.headings += 1;
    else coverage.runningBlocks += 1;
    const pieces: { text: string; start: number; end: number; line: number }[] = [];
    const grouped: {
      top: number;
      bottom: number;
      center: number;
      items: { text: string; order: number; preserve: boolean }[];
    }[] = [];
    let fullText = '';
    let previousFlow: Element | null = null;
    const flowOf = (element: Element) => {
      for (
        let current: Element | null = element;
        current && current !== block;
        current = current.parentElement
      ) {
        if (
          !/^(inline|inline-block|inline-flex|inline-grid|contents)$/.test(styleOf(current).display)
        )
          return current;
      }
      return block;
    };
    const blockWalker = document.createTreeWalker(
      block,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    );
    while (blockWalker.nextNode()) {
      const current = blockWalker.currentNode;
      if (current.nodeType === Node.ELEMENT_NODE) {
        if ((current as Element).localName === 'br') fullText += '\n';
        continue;
      }
      const node = current as Text;
      const element = node.parentElement;
      if (!element || element.closest('script,style,noscript') || blockOf(element) !== block)
        continue;
      if (hiddenReason(element)) continue;
      const flow = flowOf(element);
      if (previousFlow && previousFlow !== flow) fullText += '\n';
      previousFlow = flow;
      const offset = fullText.length;
      fullText += node.data;
      if (transformOf(element).reason) continue;
      for (const segment of graphemes.segment(node.data)) {
        const range = document.createRange();
        range.setStart(node, segment.index);
        range.setEnd(node, segment.index + segment.segment.length);
        const raw = [...range.getClientRects()]
          .filter((rect) => rect.width > tolerance && rect.height > tolerance)
          .map(rectOf);
        const painted = clippedRects(element, raw).permanentRectangles;
        const rect = painted.sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (!rect) continue;
        const center = (rect.top + rect.bottom) / 2;
        let index = grouped.findIndex(
          (line) =>
            Math.abs(line.center - center) < Math.max(line.bottom - line.top, rect.height) * 0.65,
        );
        if (index < 0) {
          index = grouped.length;
          grouped.push({ top: rect.top, bottom: rect.bottom, center, items: [] });
        }
        const line = grouped[index]!;
        const preserve = /^(pre|pre-wrap|break-spaces)$/.test(styleOf(element).whiteSpace);
        const transformed = styleOf(element).textTransform;
        let text = segment.segment;
        if (transformed === 'uppercase')
          text = text.toLocaleUpperCase(document.documentElement.lang || 'en');
        if (transformed === 'lowercase')
          text = text.toLocaleLowerCase(document.documentElement.lang || 'en');
        if (!preserve && /\s/u.test(text)) text = ' ';
        line.items.push({ text, order: offset + segment.index, preserve });
        pieces.push({
          text,
          start: offset + segment.index,
          end: offset + segment.index + segment.segment.length,
          line: index,
        });
      }
    }
    const ordered = grouped
      .map((line, index) => ({
        top: line.top,
        bottom: line.bottom,
        center: line.center,
        items: line.items,
        index,
      }))
      .sort((a, b) => a.center - b.center);
    const rendered = ordered
      .map((line) => {
        let text = '';
        for (const item of line.items.sort((a, b) => a.order - b.order)) {
          if (!item.preserve && item.text === ' ' && text.endsWith(' ')) continue;
          text += item.text;
        }
        return text.replace(/[\r\n]/g, '').trim();
      })
      .filter(Boolean);
    if (!rendered.length) {
      issue(unmeasured, 'missing-line-geometry', block, fullText.trim());
      continue;
    }
    const lengths = rendered.map((text) => [...graphemes.segment(text)].length);
    const longest = Math.max(...lengths);
    lines.push({
      selector: selectorOf(block),
      kind: heading ? 'heading' : 'running',
      lines: rendered,
      longest,
    });
    if (!heading && longest > 82)
      issue(
        findings,
        'running-line-length',
        block,
        rendered[lengths.indexOf(longest)]!,
        longest,
        '<=82 characters',
      );
    if (heading) {
      const title = block.matches('h1,[role="heading"][aria-level="1"]');
      const width = document.documentElement.clientWidth;
      const maximum = width >= 1920 ? 2 : width >= 1440 ? 3 : null;
      if (title && maximum !== null && rendered.length > maximum)
        issue(
          findings,
          'title-line-count',
          block,
          fullText.trim(),
          rendered.length,
          `<=${maximum} lines`,
        );
      const last = rendered[rendered.length - 1]!;
      const lastWords = [...words.segment(last)].filter((part) => part.isWordLike);
      if (
        rendered.length > 1 &&
        lastWords.length === 1 &&
        [...graphemes.segment(lastWords[0]!.segment)].length <= 8
      )
        issue(findings, 'heading-orphan', block, last);
      for (const word of words.segment(fullText)) {
        if (!word.isWordLike) continue;
        const wordLines = new Set(
          pieces
            .filter(
              (piece) => piece.start < word.index + word.segment.length && piece.end > word.index,
            )
            .map((piece) => piece.line),
        );
        if (wordLines.size > 1) issue(findings, 'heading-word-split', block, word.segment);
      }
    }
  }
  if (!samples.length) unmeasured.push({ kind: 'no-painted-text', selector: 'body', text: '' });
  return finish();
}
