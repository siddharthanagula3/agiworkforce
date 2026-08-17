import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export const maximumDiffPixelRatio = 0.005;
export const maximumContentDiffPixelRatio = 0.1;

const backgroundChannelTolerance = 8;

export type Rgb = readonly [number, number, number];

export type PixelImage = { width: number; height: number; data: Buffer };

export function dominantColor(image: PixelImage): Rgb {
  const counts = new Map<number, number>();
  for (let i = 0; i < image.data.length; i += 4) {
    const key =
      (image.data.readUInt8(i) << 16) |
      (image.data.readUInt8(i + 1) << 8) |
      image.data.readUInt8(i + 2);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let dominantKey = 0;
  let dominantCount = -1;
  for (const [key, count] of counts) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantKey = key;
    }
  }
  return [(dominantKey >> 16) & 0xff, (dominantKey >> 8) & 0xff, dominantKey & 0xff];
}

export function countContentPixels(image: PixelImage): number {
  const [red, green, blue] = dominantColor(image);
  let content = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    if (
      Math.abs(image.data.readUInt8(i) - red) > backgroundChannelTolerance ||
      Math.abs(image.data.readUInt8(i + 1) - green) > backgroundChannelTolerance ||
      Math.abs(image.data.readUInt8(i + 2) - blue) > backgroundChannelTolerance
    ) {
      content += 1;
    }
  }
  return content;
}

export function fillWith(width: number, height: number, color: Rgb): PixelImage {
  const image: PixelImage = new PNG({ width, height });
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = color[0];
    image.data[i + 1] = color[1];
    image.data[i + 2] = color[2];
    image.data[i + 3] = 0xff;
  }
  return image;
}

export type VisualComparison = {
  diff: PixelImage;
  diffPixels: number;
  totalPixels: number;
  contentPixels: number;
  diffPixelRatio: number;
  contentDiffPixelRatio: number;
  withinBudget: boolean;
};

export function compareToBaseline(baseline: PixelImage, actual: PixelImage): VisualComparison {
  const diff: PixelImage = new PNG({ width: baseline.width, height: baseline.height });
  const diffPixels = pixelmatch(
    baseline.data,
    actual.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold: 0.1 },
  );
  const totalPixels = baseline.width * baseline.height;
  const contentPixels = Math.max(countContentPixels(baseline), 1);
  const diffPixelRatio = diffPixels / totalPixels;
  const contentDiffPixelRatio = diffPixels / contentPixels;

  return {
    diff,
    diffPixels,
    totalPixels,
    contentPixels,
    diffPixelRatio,
    contentDiffPixelRatio,
    withinBudget:
      diffPixelRatio <= maximumDiffPixelRatio &&
      contentDiffPixelRatio <= maximumContentDiffPixelRatio,
  };
}

export function describeComparison(comparison: VisualComparison): string {
  return [
    `${comparison.diffPixels}/${comparison.totalPixels} pixels differ from the reviewed baseline`,
    `(${(comparison.diffPixelRatio * 100).toFixed(3)}% of the canvas, budget ${maximumDiffPixelRatio * 100}%;`,
    `${(comparison.contentDiffPixelRatio * 100).toFixed(3)}% of the ${comparison.contentPixels} rendered content pixels, budget ${maximumContentDiffPixelRatio * 100}%).`,
  ].join(' ');
}
