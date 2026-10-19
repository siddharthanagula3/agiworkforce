import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fitScreenshotToViewport,
  SCREENSHOT_MIME_TYPE,
} from '../src/features/computer-use/screenshotEncoding';

const CAPTURE = btoa('device-pixel capture');
const SCALED = 'viewport-scaled capture';

function stubCanvas(captureWidth: number) {
  const drawImage = vi.fn();
  const canvases: Array<{ width: number; height: number }> = [];
  const convertToBlob = vi.fn(async (options: { type: string; quality: number }) => {
    expect(options).toEqual({ type: SCREENSHOT_MIME_TYPE, quality: 0.8 });
    return { arrayBuffer: async () => new TextEncoder().encode(SCALED).buffer };
  });
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(
        public width: number,
        public height: number,
      ) {
        canvases.push(this);
      }
      getContext() {
        return { drawImage };
      }
      convertToBlob = convertToBlob;
    },
  );
  const bitmap = { width: captureWidth, height: captureWidth * 0.7, close: vi.fn() };
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
  return { drawImage, canvases, bitmap };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fitScreenshotToViewport', () => {
  it('scales a high-density capture down to the CSS viewport the browser tools address', async () => {
    const { drawImage, canvases, bitmap } = stubCanvas(2000);
    const result = await fitScreenshotToViewport(CAPTURE, { clientWidth: 1000, clientHeight: 700 });
    expect(canvases).toEqual([expect.objectContaining({ width: 1000, height: 700 })]);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1000, 700);
    expect(atob(result)).toBe(SCALED);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('keeps a capture already at CSS pixels as it is', async () => {
    const { canvases } = stubCanvas(1000);
    await expect(
      fitScreenshotToViewport(CAPTURE, { clientWidth: 1000, clientHeight: 700 }),
    ).resolves.toBe(CAPTURE);
    expect(canvases).toHaveLength(0);
  });

  it('keeps the capture when the viewport size is unknown', async () => {
    const { canvases } = stubCanvas(2000);
    await expect(fitScreenshotToViewport(CAPTURE, undefined)).resolves.toBe(CAPTURE);
    expect(canvases).toHaveLength(0);
  });
});
