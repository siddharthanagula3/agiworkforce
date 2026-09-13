import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_CLIPBOARD_TEXT_LENGTH } from '@agiworkforce/local-runtime-contract';

const readText = vi.fn<() => string>();
const readImage = vi.fn();

vi.mock('electron', () => ({ clipboard: { readText, readImage } }));

const { readClipboard } = await import('../runtime/clipboardService');

function image(options: { empty: boolean; width?: number; height?: number }) {
  return {
    isEmpty: () => options.empty,
    getSize: () => ({ width: options.width ?? 4, height: options.height ?? 2 }),
    toPNG: () => Buffer.from([1, 2, 3]),
  };
}

beforeEach(() => {
  readText.mockReset().mockReturnValue('');
  readImage.mockReset().mockReturnValue(image({ empty: true }));
});

describe('readClipboard', () => {
  it('reports an empty clipboard as empty', () => {
    expect(readClipboard()).toEqual({ textTruncated: false });
  });

  it('returns copied text', () => {
    readText.mockReturnValue('hello');
    expect(readClipboard()).toEqual({ text: 'hello', textTruncated: false });
  });

  it('returns a copied image as base64 png with its size', () => {
    readImage.mockReturnValue(image({ empty: false, width: 800, height: 600 }));
    expect(readClipboard()).toEqual({
      textTruncated: false,
      image: { base64: Buffer.from([1, 2, 3]).toString('base64'), width: 800, height: 600 },
    });
  });

  it('returns both when a copy carries text and an image', () => {
    readText.mockReturnValue('cell');
    readImage.mockReturnValue(image({ empty: false }));
    const snapshot = readClipboard();
    expect(snapshot.text).toBe('cell');
    expect(snapshot.image).toBeDefined();
  });

  it('bounds very long text and says it did', () => {
    readText.mockReturnValue('x'.repeat(MAX_CLIPBOARD_TEXT_LENGTH + 10));
    const snapshot = readClipboard();
    expect(snapshot.text).toHaveLength(MAX_CLIPBOARD_TEXT_LENGTH);
    expect(snapshot.textTruncated).toBe(true);
  });
});
