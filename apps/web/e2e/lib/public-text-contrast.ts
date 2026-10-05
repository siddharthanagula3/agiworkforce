import type { scanPublicTypography } from './public-typography';

type TextSample = ReturnType<typeof scanPublicTypography>['samples'][number];
type Rgba = { r: number; g: number; b: number; a: number };

export type PublicContrastFinding = {
  kind: 'contrast' | 'text-opacity';
  selector: string;
  text: string;
  ratio?: number;
  minimum?: number;
};

export type PublicContrastReport = {
  findings: PublicContrastFinding[];
  unmeasured: { selector: string; text: string; reasons: string[] }[];
  coverage: { eligible: number; measured: number };
};

function composite(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top.a + bottom.a * (1 - top.a);
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
    g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
    b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
    a: alpha,
  };
}

function luminance(color: Rgba): number {
  const channels = [color.r, color.g, color.b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function validColor(color: Rgba | null): color is Rgba {
  return (
    color !== null &&
    [color.r, color.g, color.b, color.a].every(Number.isFinite) &&
    [color.r, color.g, color.b].every((channel) => channel >= 0 && channel <= 255) &&
    color.a >= 0 &&
    color.a <= 1
  );
}

export function evaluatePublicTextContrast(
  samples: readonly TextSample[],
  canvas: Rgba,
): PublicContrastReport {
  if (!validColor(canvas) || canvas.a !== 1) {
    throw new Error('The backing canvas must be an opaque, resolved colour');
  }
  if (samples.length === 0)
    throw new Error('No painted text was supplied for contrast measurement');

  const report: PublicContrastReport = {
    findings: [],
    unmeasured: [],
    coverage: { eligible: samples.length, measured: 0 },
  };

  for (const sample of samples) {
    const reasons = [...sample.paintUnmeasured];
    const foreground = sample.foreground;
    const size = sample.renderedSize ?? Number.NaN;
    if (!validColor(foreground)) reasons.push('Foreground colour did not resolve');
    if (!Number.isFinite(size) || size <= 0)
      reasons.push('Rendered font size was not finite and positive');
    if (!Number.isFinite(sample.cumulativeOpacity)) reasons.push('Text opacity was not finite');
    if (sample.cumulativeOpacity < 1 || (foreground !== null && foreground.a < 1)) {
      report.findings.push({ kind: 'text-opacity', selector: sample.selector, text: sample.text });
    }
    if (sample.cumulativeOpacity < 1)
      reasons.push('Ancestor group opacity requires painted-pixel measurement');

    for (const layer of sample.backgroundLayers) {
      if (layer.filter !== 'none' || layer.backdropFilter !== 'none') {
        reasons.push('A filter changes the painted text/background');
      }
      if (layer.blendMode !== 'normal')
        reasons.push('A blend mode changes the painted text/background');
    }

    const visibleLayers = sample.backgroundLayers.filter(
      (layer) => layer.visibility !== 'hidden' && layer.visibility !== 'collapse',
    );
    const opaqueIndex = visibleLayers.findIndex((layer) => layer.rgba?.a === 1);
    const paintedLayers = opaqueIndex < 0 ? visibleLayers : visibleLayers.slice(0, opaqueIndex + 1);
    for (const layer of paintedLayers) {
      if (!validColor(layer.rgba)) reasons.push('Background colour did not resolve');
      if (layer.image !== 'none')
        reasons.push('Background image or gradient needs painted-pixel measurement');
    }

    if (reasons.length > 0) {
      report.unmeasured.push({
        selector: sample.selector,
        text: sample.text,
        reasons: [...new Set(reasons)],
      });
      continue;
    }

    let background = canvas;
    for (let index = paintedLayers.length - 1; index >= 0; index -= 1) {
      background = composite(paintedLayers[index]!.rgba!, background);
    }
    const flatForeground = composite(foreground!, background);
    const foregroundLight = luminance(flatForeground);
    const backgroundLight = luminance(background);
    const ratio =
      (Math.max(foregroundLight, backgroundLight) + 0.05) /
      (Math.min(foregroundLight, backgroundLight) + 0.05);
    const large = size >= 24 || (size >= 18.6666666667 && Number(sample.weight) >= 700);
    const minimum = size < 16 ? 7 : large ? 3 : 4.5;
    if (!Number.isFinite(ratio)) throw new Error('Contrast ratio was not finite');
    report.coverage.measured += 1;
    if (ratio + 0.000001 < minimum) {
      report.findings.push({
        kind: 'contrast',
        selector: sample.selector,
        text: sample.text,
        ratio,
        minimum,
      });
    }
  }
  return report;
}
