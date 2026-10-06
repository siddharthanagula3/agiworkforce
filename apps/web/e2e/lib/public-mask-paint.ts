import type { JSHandle, Page } from '@playwright/test';

export type PublicMaskBox = { left: number; top: number; right: number; bottom: number };

export type PublicMaskPaint =
  | { mask: 'none' }
  | { mask: 'unsupported'; image: string; reason: string }
  | {
      mask: 'fade';
      image: string;
      opaque: PublicMaskBox;
      clip: (box: PublicMaskBox) => PublicMaskBox | null;
    };

export type PublicMaskPaintResolver = (element: Element) => PublicMaskPaint;

export const PUBLIC_APPROVED_FADES = {
  figure: {
    image: /^linear-gradient\(rgb\(\d+, \d+, \d+\) 58%, rgba\(0, 0, 0, 0\) 100%\)$/u,
    opaqueShare: 0.58,
  },
  bento: {
    image: /^linear-gradient\(rgb\(\d+, \d+, \d+\) 50%, rgba\(0, 0, 0, 0\) 96%\)$/u,
    opaqueShare: 0.5,
  },
} as const;

// Serialized into the page by evaluateHandle: it may not reference module scope.
export function createPublicMaskPaintResolver(): PublicMaskPaintResolver {
  const minimumPaintedPx = 2;
  const stop = String.raw`(-?\d+(?:\.\d+)?%|-?\d+(?:\.\d+)?px|calc\(\d+(?:\.\d+)?% [-+] \d+(?:\.\d+)?px\))`;
  const fade = new RegExp(
    String.raw`^linear-gradient\(rgb\(\d+, \d+, \d+\) ${stop}, rgba\(\d+, \d+, \d+, 0\)(?: ${stop})?\)$`,
  );
  const initialLayer: [string, string][] = [
    ['mask-size', 'auto'],
    ['mask-position', '0% 0%'],
    ['mask-repeat', 'repeat'],
    ['mask-origin', 'border-box'],
    ['mask-clip', 'border-box'],
    ['mask-composite', 'add'],
    ['mask-mode', 'match-source'],
  ];
  const px = (value: string) => (/^-?\d+(?:\.\d+)?px$/.test(value) ? parseFloat(value) : null);
  const resolveStop = (value: string, extent: number, scale: number) => {
    const calc = /^calc\((\d+(?:\.\d+)?)% ([-+]) (\d+(?:\.\d+)?)px\)$/.exec(value);
    if (calc)
      return (
        (Number(calc[1]) / 100) * extent + (calc[2] === '-' ? -1 : 1) * Number(calc[3]) * scale
      );
    return value.endsWith('%') ? (parseFloat(value) / 100) * extent : parseFloat(value) * scale;
  };
  const projection = (element: Element) => {
    let transformed = false;
    let towardViewer = 0;
    let nearestPerspective = Infinity;
    for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
      const css = getComputedStyle(ancestor);
      for (const property of ['rotate', 'scale', 'offset-path'])
        if (!['', 'none'].includes(css.getPropertyValue(property))) return null;
      if (!['', '1', 'normal'].includes(css.getPropertyValue('zoom'))) return null;
      const perspective = css.perspective === 'none' ? Infinity : px(css.perspective);
      if (perspective === null || perspective <= 0) return null;
      nearestPerspective = Math.min(nearestPerspective, perspective);
      if (css.transform === 'none') continue;
      const matrix = new DOMMatrix(css.transform);
      if (
        !(matrix.m11 > 0 && matrix.m22 > 0 && matrix.m33 === 1 && matrix.m44 === 1) ||
        [
          matrix.m12,
          matrix.m13,
          matrix.m14,
          matrix.m21,
          matrix.m23,
          matrix.m24,
          matrix.m31,
          matrix.m32,
          matrix.m34,
        ].some((entry) => entry !== 0)
      )
        return null;
      transformed = true;
      towardViewer += Math.max(0, matrix.m43);
    }
    return towardViewer < nearestPerspective ? { transformed } : null;
  };
  return (element) => {
    const css = getComputedStyle(element);
    const image =
      css.getPropertyValue('mask-image') || css.getPropertyValue('-webkit-mask-image') || 'none';
    const border = ['mask-border-source', '-webkit-mask-box-image-source']
      .map((property) => css.getPropertyValue(property))
      .find((value) => value && value !== 'none');
    if (image === 'none' && !border) return { mask: 'none' };
    const unsupported = (reason: string): PublicMaskPaint => ({
      mask: 'unsupported',
      image,
      reason,
    });
    if (border) return unsupported('mask border image');
    const stops = fade.exec(image);
    if (!stops)
      return unsupported('not one top-to-bottom two-stop gradient from opaque to transparent');
    for (const [property, expected] of initialLayer)
      if (css.getPropertyValue(property) !== expected)
        return unsupported(`non-initial ${property}`);
    const height = px(css.height);
    const edges = [
      css.paddingTop,
      css.paddingBottom,
      css.borderTopWidth,
      css.borderBottomWidth,
    ].map(px);
    if (height === null || edges.some((edge) => edge === null))
      return unsupported('mask owner has no block border box');
    const localHeight =
      css.boxSizing === 'border-box'
        ? height
        : edges.reduce<number>((total, edge) => total + (edge ?? 0), height);
    const projected = projection(element);
    if (!projected) return unsupported('mask owner is not projected upright and axis-aligned');
    const rect = element.getBoundingClientRect();
    const scale = rect.height / localHeight;
    if (
      !(localHeight > 0) ||
      !Number.isFinite(scale) ||
      scale <= 0 ||
      (!projected.transformed && Math.abs(scale - 1) > 0.01)
    )
      return unsupported('mask owner box does not map to its rendered box');
    const end = resolveStop(stops[1] ?? '', rect.height, scale);
    if (!Number.isFinite(end) || end < minimumPaintedPx)
      return unsupported('gradient has no fully opaque band');
    const opaque = {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: Math.min(rect.bottom, rect.top + end),
    };
    return {
      mask: 'fade',
      image,
      opaque,
      clip: (box) => {
        const painted = {
          left: Math.max(box.left, opaque.left),
          top: Math.max(box.top, opaque.top),
          right: Math.min(box.right, opaque.right),
          bottom: Math.min(box.bottom, opaque.bottom),
        };
        return painted.right - painted.left < minimumPaintedPx ||
          painted.bottom - painted.top < minimumPaintedPx
          ? null
          : painted;
      },
    };
  };
}

export function publicMaskPaintHandle(page: Page): Promise<JSHandle<PublicMaskPaintResolver>> {
  return page.evaluateHandle(createPublicMaskPaintResolver);
}
