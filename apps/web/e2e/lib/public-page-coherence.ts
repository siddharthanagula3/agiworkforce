import { createHash } from 'node:crypto';
import type { Page } from '@playwright/test';

export interface PublicPageCoherence {
  phase: string;
  url: string;
  theme: {
    marker: string | null;
    light: boolean;
    dark: boolean;
    scheme: string;
    prefersDark: boolean;
    rootBackground: string;
    bodyBackground: string;
    bodyColor: string;
  };
  fonts: {
    status: FontFaceSetLoadStatus;
    sans: string;
    mono: string;
    registered: string[];
    assignmentsDigest: string;
    availabilityDigest: string;
    body: string;
    heading: string | null;
  };
  main: { count: number; textLength: number; textDigest: string };
  paint: {
    count: number;
    textDigest: string;
    stylesDigest: string;
    geometryDigest: string;
    unmeasured: string[];
  };
  diagnostics: {
    registeredFaces: { descriptors: string; status: FontFaceLoadStatus }[];
    fontRequests: { font: string; text: string; available: boolean; runs: number }[];
    sources: { kind: string; text: string; geometrySpace: string }[];
    scroll: { x: number; y: number };
    limits: string[];
  };
}

export interface PublicPageCoherenceFinding {
  phase: string;
  field: 'url' | 'theme' | 'fonts' | 'main' | 'paint';
  before: unknown;
  after: unknown;
}

export async function capturePublicPageCoherence(
  page: Page,
  phase: string,
): Promise<PublicPageCoherence> {
  const state = await page.evaluate(() => {
    if (!document.body) throw new Error('Public coherence has no document body');
    const root = document.documentElement;
    const rootStyle = getComputedStyle(root);
    const bodyStyle = getComputedStyle(document.body);
    const mains = Array.from(document.querySelectorAll('main, [role="main"]'));
    const heading = document.querySelector('main h1, [role="main"] h1');
    const cssCache = new Map<Element, CSSStyleDeclaration>();
    const cssOf = (element: Element) => {
      let css = cssCache.get(element);
      if (!css) {
        css = getComputedStyle(element);
        cssCache.set(element, css);
      }
      return css;
    };
    const normalizeFamily = (family: string) =>
      family
        .trim()
        .replace(/^["']|["']$/g, '')
        .toLowerCase();
    const primaryFamily = (family: string) =>
      (family.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,]+/g)?.[0] ?? '').trim();
    const fontProperties = [
      'font-family',
      'font-size',
      'font-style',
      'font-weight',
      'font-stretch',
      'line-height',
      'font-variant',
      'font-feature-settings',
      'font-variation-settings',
      'font-optical-sizing',
      'font-kerning',
      'font-synthesis',
      'letter-spacing',
      'word-spacing',
      'text-transform',
    ];
    const paintProperties = [
      'color',
      '-webkit-text-fill-color',
      '-webkit-text-stroke-color',
      '-webkit-text-stroke-width',
      'text-shadow',
      'fill',
      'fill-opacity',
      'stroke',
      'stroke-width',
      'stroke-opacity',
      'text-decoration-color',
      'text-decoration-line',
      'text-decoration-style',
      'white-space',
      'word-break',
      'overflow-wrap',
      'text-align',
      'direction',
      'writing-mode',
      'display',
      'visibility',
      'opacity',
      'position',
      'top',
      'right',
      'bottom',
      'left',
      'width',
      'height',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'margin-top',
      'margin-right',
      'margin-bottom',
      'margin-left',
      'transform',
      'zoom',
    ];
    const ancestorProperties = [
      'display',
      'visibility',
      'opacity',
      'content-visibility',
      'clip',
      'clip-path',
      'overflow-x',
      'overflow-y',
      'filter',
      'backdrop-filter',
      'transform',
      'zoom',
      'background-color',
      'background-image',
      'background-clip',
      'mask-image',
      'mix-blend-mode',
      'position',
      'top',
      'right',
      'bottom',
      'left',
    ];
    const values = (css: CSSStyleDeclaration, properties: string[]) =>
      properties.map((property) => css.getPropertyValue(property));
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const pen = canvas.getContext('2d');
    if (!pen) throw new Error('Public coherence has no colour probe');
    const transparent = (color: string) => {
      if (color === 'none') return true;
      pen.clearRect(0, 0, 1, 1);
      pen.fillStyle = color;
      pen.fillRect(0, 0, 1, 1);
      return (pen.getImageData(0, 0, 1, 1).data[3] ?? 0) === 0;
    };
    type Box = { left: number; top: number; right: number; bottom: number };
    const clip = (box: Box, parent: Box, x = true, y = true): Box => ({
      left: x ? Math.max(box.left, parent.left) : box.left,
      top: y ? Math.max(box.top, parent.top) : box.top,
      right: x ? Math.min(box.right, parent.right) : box.right,
      bottom: y ? Math.min(box.bottom, parent.bottom) : box.bottom,
    });
    const area = (box: Box) => box.right > box.left && box.bottom > box.top;
    const round = (value: number) => Math.round(value * 100) / 100;
    const unmeasured = new Set<string>();
    const samples: {
      kind: string;
      text: string;
      font: string[];
      styles: string[];
      ancestors: string[][];
      geometry: number[][];
      clippedGeometry: number[][];
      geometrySpace: string;
    }[] = [];
    const requests = new Map<string, { font: string; text: string; runs: number }>();
    const usedFamilies = new Set<string>();
    const stretchKeywords = new Map([
      ['50%', 'ultra-condensed'],
      ['62.5%', 'extra-condensed'],
      ['75%', 'condensed'],
      ['87.5%', 'semi-condensed'],
      ['100%', 'normal'],
      ['112.5%', 'semi-expanded'],
      ['125%', 'expanded'],
      ['150%', 'extra-expanded'],
      ['200%', 'ultra-expanded'],
    ]);
    const addRequest = (css: CSSStyleDeclaration, text: string) => {
      const family = primaryFamily(css.fontFamily);
      if (!family) throw new Error('Unmeasured public font request: no primary family');
      const stretch = stretchKeywords.get(css.fontStretch) ?? css.fontStretch;
      if (!/^(normal|(?:ultra-|extra-|semi-)?(?:condensed|expanded))$/.test(stretch))
        throw new Error('Unmeasured public font request: font stretch ' + css.fontStretch);
      const font = [css.fontStyle, css.fontWeight, stretch, css.fontSize, family].join(' ');
      if (!CSS.supports('font', font))
        throw new Error('Unmeasured public font request: invalid shorthand ' + font);
      const glyphText =
        css.textTransform === 'uppercase'
          ? text.toLocaleUpperCase()
          : css.textTransform === 'lowercase'
            ? text.toLocaleLowerCase()
            : text;
      const codepoints = [
        ...new Set(
          [...glyphText]
            .filter((character) => !/\s/u.test(character))
            .map((character) => character.codePointAt(0) ?? 0),
        ),
      ].sort((a, b) => a - b);
      const characters = codepoints.map((point) => String.fromCodePoint(point)).join('');
      const key = font + '\u0000' + characters;
      const request = requests.get(key) ?? { font, text: characters, runs: 0 };
      if (codepoints.length > 2048 || (!requests.has(key) && requests.size >= 2048))
        throw new Error('Public coherence font requests exceeded their bounded budget');
      request.runs += 1;
      requests.set(key, request);
      usedFamilies.add(normalizeFamily(family));
    };
    const sample = (
      element: Element,
      text: string,
      kind: string,
      css: CSSStyleDeclaration,
      rectangles: DOMRect[],
      glyphsKnown = true,
    ) => {
      if (!text.trim() || css.display === 'none' || ['hidden', 'collapse'].includes(css.visibility))
        return;
      const foreground = element.closest('svg') ? css.fill : css.webkitTextFillColor || css.color;
      const stroke = element.closest('svg') ? css.stroke : css.webkitTextStrokeColor;
      const strokeWidth = element.closest('svg') ? css.strokeWidth : css.webkitTextStrokeWidth;
      const stroked = parseFloat(strokeWidth) > 0 && !transparent(stroke);
      const clippedBackground =
        css.backgroundClip === 'text' || css.webkitBackgroundClip === 'text';
      if ((transparent(foreground) && !stroked && !clippedBackground) || Number(css.opacity) === 0)
        return;
      const chain: Element[] = [];
      for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
        const style = cssOf(ancestor);
        if (
          style.display === 'none' ||
          style.contentVisibility === 'hidden' ||
          Number(style.opacity) === 0
        )
          return;
        chain.push(ancestor);
      }
      const anchor = chain.find((ancestor) =>
        ['fixed', 'sticky'].includes(cssOf(ancestor).position),
      );
      const anchorBox = anchor?.getBoundingClientRect();
      const geometrySpace = anchor ? cssOf(anchor).position + '-local' : 'document';
      const x = anchorBox ? -anchorBox.left : scrollX;
      const y = anchorBox ? -anchorBox.top : scrollY;
      const coordinates = (box: Box) =>
        [box.left + x, box.top + y, box.right + x, box.bottom + y].map(round);
      const original = rectangles.filter(area);
      const clipped = original.flatMap((rectangle) => {
        let box: Box = rectangle;
        for (const ancestor of chain) {
          const style = cssOf(ancestor);
          const bounds = ancestor.getBoundingClientRect();
          if (style.clip !== 'auto') {
            const match =
              /^rect\(\s*([+-]?[\d.]+)px[, ]+([+-]?[\d.]+)px[, ]+([+-]?[\d.]+)px[, ]+([+-]?[\d.]+)px\s*\)$/.exec(
                style.clip,
              );
            if (match && ['absolute', 'fixed'].includes(style.position)) {
              box = clip(box, {
                top: bounds.top + Number(match[1]),
                right: bounds.left + Number(match[2]),
                bottom: bounds.top + Number(match[3]),
                left: bounds.left + Number(match[4]),
              });
            } else unmeasured.add('unsupported-clip-geometry');
          }
          if (ancestor !== root && ancestor !== document.body) {
            box = clip(box, bounds, style.overflowX !== 'visible', style.overflowY !== 'visible');
          }
          if (style.clipPath !== 'none' || style.maskImage !== 'none')
            unmeasured.add('masked-text-geometry');
          if (!area(box)) return [];
        }
        return [box];
      });
      if (!clipped.length) return;
      if (stroked || clippedBackground) unmeasured.add('non-solid-text-paint');
      if (glyphsKnown) addRequest(css, text);
      samples.push({
        kind,
        text,
        font: values(css, fontProperties),
        styles: values(css, paintProperties),
        ancestors: chain.map((ancestor) => values(cssOf(ancestor), ancestorProperties)),
        geometry: original.map(coordinates),
        clippedGeometry: clipped.map(coordinates),
        geometrySpace,
      });
      if (samples.length > 15_000)
        throw new Error('Public coherence painted text exceeded its bounded budget');
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let visited = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (++visited > 15_000)
        throw new Error('Public coherence text traversal exceeded its bounded budget');
      const parent = node.parentElement;
      const text = node.textContent ?? '';
      if (
        !parent ||
        !text.trim() ||
        parent.closest('script,style,template,noscript,input,textarea,select')
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      sample(parent, text, 'text', cssOf(parent), Array.from(range.getClientRects()));
    }
    for (const element of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      'input:not([type="hidden"]),textarea',
    )) {
      const input = element instanceof HTMLInputElement ? element : null;
      if (input && /^(checkbox|radio|range|color)$/.test(input.type)) continue;
      const kind = element.value ? 'value' : 'placeholder';
      const native = Boolean(
        input &&
        /^(password|file|date|datetime-local|month|week|time)$/.test(input.type) &&
        element.value,
      );
      const text = native
        ? 'native-' + input?.type + ':' + element.value.length
        : element.value || element.getAttribute('placeholder') || '';
      if (!text) continue;
      const css =
        kind === 'placeholder' ? getComputedStyle(element, '::placeholder') : cssOf(element);
      const before = samples.length;
      sample(element, text, kind, css, Array.from(element.getClientRects()), !native);
      if (samples.length > before)
        unmeasured.add(native ? 'native-control-glyphs' : 'control-glyph-geometry');
    }
    for (const element of document.querySelectorAll<HTMLSelectElement>('select')) {
      const text = Array.from(element.selectedOptions)
        .map((option) => option.textContent ?? '')
        .join(' ');
      const before = samples.length;
      sample(element, text, 'value', cssOf(element), Array.from(element.getClientRects()));
      if (samples.length > before) unmeasured.add('control-glyph-geometry');
    }
    const elements = Array.from(document.body.querySelectorAll('*'));
    if (elements.length > 15_000)
      throw new Error('Public coherence pseudo traversal exceeded its bounded budget');
    for (const element of elements) {
      if (element.closest('script,style,template,noscript')) continue;
      for (const pseudo of ['before', 'after'] as const) {
        const css = getComputedStyle(element, '::' + pseudo);
        if (!css.content || ['none', 'normal', '""'].includes(css.content)) continue;
        let text = css.content;
        let known = false;
        try {
          const decoded: unknown = JSON.parse(css.content);
          if (typeof decoded === 'string') {
            text = decoded;
            known = true;
          }
        } catch {
          known = false;
        }
        const before = samples.length;
        sample(element, text, 'pseudo-' + pseudo, css, Array.from(element.getClientRects()), known);
        if (samples.length > before)
          unmeasured.add(known ? 'pseudo-glyph-geometry' : 'unsupported-generated-content');
      }
    }
    const fontRequests = Array.from(requests.values(), ({ font, text, runs }) => ({
      font,
      text,
      available: document.fonts.check(font, text),
      runs,
    })).sort((a, b) => a.font.localeCompare(b.font) || a.text.localeCompare(b.text));
    const registeredFaces = Array.from(document.fonts, (face) => {
      const extended = face as FontFace & { variationSettings?: string; sizeAdjust?: string };
      return {
        family: normalizeFamily(face.family),
        descriptors: JSON.stringify([
          face.family,
          face.style,
          face.weight,
          face.stretch,
          face.unicodeRange,
          face.featureSettings,
          extended.variationSettings ?? null,
          face.display,
          face.ascentOverride,
          face.descentOverride,
          face.lineGapOverride,
          extended.sizeAdjust ?? null,
        ]),
        status: face.status,
      };
    }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return {
      url: location.href,
      theme: {
        marker: root.dataset['theme'] ?? null,
        light: root.classList.contains('light'),
        dark: root.classList.contains('dark'),
        scheme: rootStyle.colorScheme,
        prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
        rootBackground: rootStyle.backgroundColor,
        bodyBackground: bodyStyle.backgroundColor,
        bodyColor: bodyStyle.color,
      },
      fonts: {
        status: document.fonts.status,
        sans: rootStyle.getPropertyValue('--font-geist-sans').trim(),
        mono: rootStyle.getPropertyValue('--font-geist-mono').trim(),
        registered: registeredFaces
          .filter((face) => usedFamilies.has(face.family))
          .map((face) => face.descriptors)
          .sort(),
        body: bodyStyle.fontFamily,
        heading: heading ? cssOf(heading).fontFamily : null,
      },
      mainCount: mains.length,
      mainText: mains
        .map((main) => {
          const texts: string[] = [];
          const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.parentElement?.closest('script,style,template,noscript'))
              texts.push(node.textContent ?? '');
          }
          return texts.join('');
        })
        .join('\u0000'),
      samples,
      unmeasured: Array.from(unmeasured).sort(),
      fontRequests,
      registeredFaces: registeredFaces.map(({ descriptors, status }) => ({ descriptors, status })),
      scroll: { x: scrollX, y: scrollY },
    };
  });
  const digest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return {
    phase,
    url: state.url,
    theme: state.theme,
    fonts: {
      ...state.fonts,
      assignmentsDigest: digest(state.samples.map((sample) => [sample.kind, sample.font])),
      availabilityDigest: digest(state.fontRequests),
    },
    main: {
      count: state.mainCount,
      textLength: state.mainText.length,
      textDigest: digest(state.mainText),
    },
    paint: {
      count: state.samples.length,
      textDigest: digest(state.samples.map((sample) => [sample.kind, sample.text])),
      stylesDigest: digest(state.samples.map((sample) => [sample.styles, sample.ancestors])),
      geometryDigest: digest(
        state.samples.map((sample) => [
          sample.geometrySpace,
          sample.geometry,
          sample.clippedGeometry,
        ]),
      ),
      unmeasured: state.unmeasured,
    },
    diagnostics: {
      registeredFaces: state.registeredFaces,
      fontRequests: state.fontRequests,
      sources: state.samples.map(({ kind, text, geometrySpace }) => ({
        kind,
        text,
        geometrySpace,
      })),
      scroll: state.scroll,
      limits: [
        'Font checks are read-only primary-family request availability, not glyph-level font identity or proof that a family exists; readiness supplies registration and coverage evidence.',
        'Global and individual font load statuses are diagnostic; used-family descriptors, painted assignments and request availability are compared.',
        'Text geometry covers document content without viewport cropping; fixed and sticky ancestry uses local coordinates and retains positioning styles.',
        'Native control and generated text use host boxes; exact glyph geometry and unsupported masks/content remain explicitly unmeasured.',
        'This is a DOM/style snapshot, not pixel proof of overlays, shadow roots, embedded documents or changes between snapshots.',
      ],
    },
  };
}

export function comparePublicPageCoherence(
  before: PublicPageCoherence,
  after: PublicPageCoherence,
): PublicPageCoherenceFinding[] {
  const comparableFonts = ({ status: _status, ...fonts }: PublicPageCoherence['fonts']) => fonts;
  return (['url', 'theme', 'fonts', 'main', 'paint'] as const).flatMap((field) => {
    const previous = field === 'fonts' ? comparableFonts(before.fonts) : before[field];
    const current = field === 'fonts' ? comparableFonts(after.fonts) : after[field];
    return JSON.stringify(previous) === JSON.stringify(current)
      ? []
      : [{ phase: after.phase, field, before: previous, after: current }];
  });
}
