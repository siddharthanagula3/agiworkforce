import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { CHAT_MODEL_IMAGE_ENVELOPE } from '@agiworkforce/cloud-contracts';

vi.mock('server-only', () => ({}));

import { ModelImageUnreadableError, prepareModelImage } from './model-image';

const SMALL_EDGE = { ...CHAT_MODEL_IMAGE_ENVELOPE, maxEdgePixels: 64 };

function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

function noise(width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
      noise: { type: 'gaussian', mean: 128, sigma: 60 },
    },
  });
}

/** Opaque red on the left half, fully transparent on the right half. */
function halfTransparent(width: number, height: number): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const at = (row * width + column) * 4;
      if (column < width / 2) pixels.set([255, 0, 0, 255], at);
    }
  }
  return pixels;
}

async function alphaAt(image: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * info.channels + 3]!;
}

describe('the picture a model is handed', () => {
  it('sends a photo that already fits every route exactly as it was stored', async () => {
    const photo = await noise(120, 80).jpeg({ quality: 80 }).toBuffer();

    const image = await prepareModelImage(photo, 'photo.jpg');

    expect(image.mimeType).toBe('image/jpeg');
    expect(image.data.equals(photo)).toBe(true);
    expect(image.note).toBeNull();
  });

  it('shrinks a photo past the route byte ceiling until its base64 fits, still a JPEG', async () => {
    const photo = await noise(600, 450).jpeg({ quality: 100 }).toBuffer();
    const envelope = {
      ...CHAT_MODEL_IMAGE_ENVELOPE,
      maxBase64Bytes: Math.floor(base64Length(photo.byteLength) / 3),
    };
    expect(base64Length(photo.byteLength)).toBeGreaterThan(envelope.maxBase64Bytes);

    const image = await prepareModelImage(photo, 'photo.jpg', envelope);

    expect(image.mimeType).toBe('image/jpeg');
    expect(base64Length(image.data.byteLength)).toBeLessThanOrEqual(envelope.maxBase64Bytes);
    const { width, height } = await sharp(image.data).metadata();
    expect(width / height).toBeCloseTo(600 / 450, 1);
  });

  it('takes a 20 MB class photo down to the 5 MB of base64 every route accepts', async () => {
    const photo = await noise(2400, 2400)
      .jpeg({ quality: 100, chromaSubsampling: '4:4:4' })
      .toBuffer();
    expect(base64Length(photo.byteLength)).toBeGreaterThan(
      CHAT_MODEL_IMAGE_ENVELOPE.maxBase64Bytes,
    );

    const image = await prepareModelImage(photo, 'camera.jpg');

    expect(image.mimeType).toBe('image/jpeg');
    expect(base64Length(image.data.byteLength)).toBeLessThanOrEqual(
      CHAT_MODEL_IMAGE_ENVELOPE.maxBase64Bytes,
    );
  }, 30_000);

  it('keeps the transparency of a PNG it has to make smaller', async () => {
    const png = await sharp(halfTransparent(200, 100), {
      raw: { width: 200, height: 100, channels: 4 },
    })
      .png()
      .toBuffer();

    const image = await prepareModelImage(png, 'logo.png', SMALL_EDGE);

    expect(image.mimeType).toBe('image/png');
    const metadata = await sharp(image.data).metadata();
    expect([metadata.width, metadata.height]).toEqual([64, 32]);
    expect(metadata.hasAlpha).toBe(true);
    expect(await alphaAt(image.data, 2, 16)).toBe(255);
    expect(await alphaAt(image.data, 60, 16)).toBe(0);
  });

  it('moves a transparent PNG that cannot fit as a PNG to WebP, which keeps the alpha', async () => {
    const pixels = halfTransparent(256, 256);
    const raw = await noise(256, 256).ensureAlpha().raw().toBuffer();
    for (let index = 3; index < raw.length; index += 4) raw[index] = pixels[index]!;
    const png = await sharp(raw, { raw: { width: 256, height: 256, channels: 4 } })
      .png()
      .toBuffer();
    const envelope = {
      ...CHAT_MODEL_IMAGE_ENVELOPE,
      maxBase64Bytes: base64Length(png.byteLength) - 1,
    };

    const image = await prepareModelImage(png, 'cutout.png', envelope);

    expect(image.mimeType).toBe('image/webp');
    expect(base64Length(image.data.byteLength)).toBeLessThanOrEqual(envelope.maxBase64Bytes);
    expect((await sharp(image.data).metadata()).hasAlpha).toBe(true);
    expect(await alphaAt(image.data, 250, 128)).toBe(0);
  });

  it('shows the model the first frame of an animated GIF, keeps its transparency and says so', async () => {
    const gif = readFileSync(path.join(__dirname, '__fixtures__', 'half-transparent-animated.gif'));
    expect((await sharp(gif).metadata()).pages).toBe(3);

    const image = await prepareModelImage(gif, 'wave.gif');

    expect(image.mimeType).toBe('image/png');
    const metadata = await sharp(image.data).metadata();
    expect([metadata.width, metadata.height]).toEqual([16, 8]);
    expect(await alphaAt(image.data, 1, 4)).toBe(255);
    expect(await alphaAt(image.data, 14, 4)).toBe(0);
    expect(image.note).toBe('[wave.gif is animated; the model is shown its first frame only]');
  });

  it('turns a still GIF into a PNG, since not every route reads GIF', async () => {
    const gif = await sharp(halfTransparent(16, 8), { raw: { width: 16, height: 8, channels: 4 } })
      .gif()
      .toBuffer();

    const image = await prepareModelImage(gif, 'icon.gif');

    expect(image.mimeType).toBe('image/png');
    expect(image.note).toBeNull();
    expect(await alphaAt(image.data, 14, 4)).toBe(0);
  });

  it('names the file when its bytes are not a picture', async () => {
    await expect(prepareModelImage(Buffer.from('not a picture'), 'fake.png')).rejects.toEqual(
      new ModelImageUnreadableError('fake.png'),
    );
  });
});
