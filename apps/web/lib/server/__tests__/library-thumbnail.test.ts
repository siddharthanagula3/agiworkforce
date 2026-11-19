import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { LIBRARY_THUMBNAIL_SOURCE_MAX_PIXELS, renderLibraryThumbnail } =
  await import('../library-thumbnail');

const PNG_IHDR_WIDTH_OFFSET = 16;
const PNG_IHDR_CRC_OFFSET = 29;
const PNG_IHDR_TYPE_OFFSET = 12;

async function pngClaimingSize(width: number, height: number): Promise<Buffer> {
  const png = await sharp({
    create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
  })
    .png()
    .toBuffer();
  png.writeUInt32BE(width, PNG_IHDR_WIDTH_OFFSET);
  png.writeUInt32BE(height, PNG_IHDR_WIDTH_OFFSET + 4);
  png.writeUInt32BE(
    crc32(png.subarray(PNG_IHDR_TYPE_OFFSET, PNG_IHDR_CRC_OFFSET)),
    PNG_IHDR_CRC_OFFSET,
  );
  return png;
}

describe('renderLibraryThumbnail', () => {
  it('refuses a picture whose header claims more pixels than a thumbnail source may have, before decoding it', async () => {
    const edge = Math.ceil(Math.sqrt(LIBRARY_THUMBNAIL_SOURCE_MAX_PIXELS)) + 1;
    const source = await pngClaimingSize(edge, edge);

    await expect(renderLibraryThumbnail(source)).rejects.toThrow(/exceeds pixel limit/);
  });

  it('refuses stored bytes that are not a raster picture whatever the stored type says', async () => {
    const vector = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#336699"/></svg>',
    );

    await expect(renderLibraryThumbnail(vector)).rejects.toThrow(/not a supported picture \(svg\)/);
  });

  it('still makes a small webp from an ordinary picture', async () => {
    const source = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 80, b: 40 } },
    })
      .jpeg()
      .toBuffer();

    const metadata = await sharp(await renderLibraryThumbnail(source)).metadata();

    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(640);
  });
});
