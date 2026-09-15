import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CLIPBOARD_TEXT_LENGTH } from '@agiworkforce/local-runtime-contract';

const readText = vi.fn<() => Promise<string>>();
const read = vi.fn<() => Promise<unknown[]>>();
const createFromBuffer = vi.fn();

vi.mock('electron', () => ({
  clipboard: { readText, read },
  nativeImage: { createFromBuffer },
}));

const { readClipboard } = await import('../runtime/clipboardService');

const PNG = Buffer.from([1, 2, 3]);

function imageItem() {
  return {
    types: ['image/png'],
    getType: async () => ({
      arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength),
    }),
  };
}

beforeEach(() => {
  readText.mockReset().mockResolvedValue('');
  read.mockReset().mockResolvedValue([]);
  createFromBuffer.mockReset().mockReturnValue({ getSize: () => ({ width: 800, height: 600 }) });
});

describe('readClipboard', () => {
  it('reports an empty clipboard as empty', async () => {
    await expect(readClipboard()).resolves.toEqual({ textTruncated: false });
  });

  it('returns copied text', async () => {
    readText.mockResolvedValue('hello');
    await expect(readClipboard()).resolves.toEqual({ text: 'hello', textTruncated: false });
  });

  it('returns a copied image as base64 png with its size', async () => {
    read.mockResolvedValue([imageItem()]);
    await expect(readClipboard()).resolves.toEqual({
      textTruncated: false,
      image: { base64: PNG.toString('base64'), width: 800, height: 600 },
    });
    expect(createFromBuffer).toHaveBeenCalledWith(PNG);
  });

  it('returns both when a copy carries text and an image', async () => {
    readText.mockResolvedValue('cell');
    read.mockResolvedValue([
      { types: ['text/plain'], getType: async () => new Blob([]) },
      imageItem(),
    ]);
    const snapshot = await readClipboard();
    expect(snapshot.text).toBe('cell');
    expect(snapshot.image).toBeDefined();
  });

  it('bounds very long text and says it did', async () => {
    readText.mockResolvedValue('x'.repeat(MAX_CLIPBOARD_TEXT_LENGTH + 10));
    const snapshot = await readClipboard();
    expect(snapshot.text).toHaveLength(MAX_CLIPBOARD_TEXT_LENGTH);
    expect(snapshot.textTruncated).toBe(true);
  });
});
