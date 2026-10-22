import { describe, expect, it } from 'vitest';
import {
  PREVIEW_ERROR_LIMIT,
  PREVIEW_ERROR_TEXT_LIMIT,
} from '@agiworkforce/local-runtime-contract';
import { PreviewConsoleBuffer } from '../previewConsole';

describe('the errors a preview page logged', () => {
  it('keeps each error with where it came from, in the order logged', () => {
    const buffer = new PreviewConsoleBuffer();
    buffer.record({
      message: 'Uncaught TypeError: x is undefined',
      source: 'http://localhost:5173/src/app.ts',
      line: 12,
    });
    buffer.record({ message: 'Failed to load resource' });

    expect(buffer.read(false)).toEqual({
      errors: [
        {
          message: 'Uncaught TypeError: x is undefined',
          source: 'http://localhost:5173/src/app.ts',
          line: 12,
          count: 1,
        },
        { message: 'Failed to load resource', source: null, line: null, count: 1 },
      ],
      dropped: 0,
    });
  });

  it('counts an error repeated in a row instead of listing it again', () => {
    const buffer = new PreviewConsoleBuffer();
    for (let index = 0; index < 4; index += 1) buffer.record({ message: 'tick failed', line: 3 });
    buffer.record({ message: 'other' });
    buffer.record({ message: 'tick failed', line: 3 });

    expect(buffer.read(false).errors.map((error) => [error.message, error.count])).toEqual([
      ['tick failed', 4],
      ['other', 1],
      ['tick failed', 1],
    ]);
  });

  it('stops at its bound and says how many it could not keep', () => {
    const buffer = new PreviewConsoleBuffer();
    for (let index = 0; index < PREVIEW_ERROR_LIMIT + 7; index += 1) {
      buffer.record({ message: `error ${index}` });
    }
    const { errors, dropped } = buffer.read(false);
    expect(errors).toHaveLength(PREVIEW_ERROR_LIMIT);
    expect(dropped).toBe(7);
  });

  it('cuts a long message and ignores an empty one', () => {
    const buffer = new PreviewConsoleBuffer();
    buffer.record({ message: 'x'.repeat(PREVIEW_ERROR_TEXT_LIMIT * 3) });
    buffer.record({ message: '   ' });

    const { errors } = buffer.read(false);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toHaveLength(PREVIEW_ERROR_TEXT_LIMIT);
    expect(errors[0]?.message.endsWith('…')).toBe(true);
  });

  it('clears what it returned only when asked, and returns copies', () => {
    const buffer = new PreviewConsoleBuffer();
    buffer.record({ message: 'boom' });

    const first = buffer.read(false);
    first.errors[0]!.message = 'changed';
    expect(buffer.read(false).errors[0]?.message).toBe('boom');

    expect(buffer.read(true).errors).toHaveLength(1);
    expect(buffer.read(false)).toEqual({ errors: [], dropped: 0 });
  });
});
