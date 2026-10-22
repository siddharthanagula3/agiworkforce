import { describe, expect, it } from 'vitest';
import type { SkillCaptureRecording } from '@agiworkforce/local-runtime-contract';
import { defaultSelection, formatClock, recordingFiles } from '../lib/recording-files';

const JPEG_BYTES = [0xff, 0xd8, 0xff, 0xd9];

function recording(count: number): SkillCaptureRecording {
  return {
    startedAt: 1_000,
    durationMs: count * 3_000,
    channels: ['screen'],
    frames: Array.from({ length: count }, (_, index) => ({
      offsetMs: index * 3_000,
      mimeType: 'image/jpeg' as const,
      imageBase64: btoa(String.fromCharCode(...JPEG_BYTES)),
      width: 1280,
      height: 800,
    })),
  };
}

describe('defaultSelection', () => {
  it('keeps every screenshot when they fit', () => {
    expect(defaultSelection(3, 10)).toEqual([0, 1, 2]);
  });

  it('spreads the picks and keeps the first and last screenshot', () => {
    expect(defaultSelection(10, 4)).toEqual([0, 3, 6, 9]);
  });

  it('picks nothing when the plan allows no attachments', () => {
    expect(defaultSelection(5, 0)).toEqual([]);
  });
});

describe('recordingFiles', () => {
  it('turns the chosen frames into JPEG files in recording order', async () => {
    const files = recordingFiles(recording(4), [3, 1]);

    expect(files.map((file) => file.name)).toEqual([
      'recording-1000-2.jpg',
      'recording-1000-4.jpg',
    ]);
    expect(files.every((file) => file.type === 'image/jpeg')).toBe(true);
    expect(files[0]?.lastModified).toBe(4_000);
    expect([...new Uint8Array(await files[0]!.arrayBuffer())]).toEqual(JPEG_BYTES);
  });
});

describe('formatClock', () => {
  it('formats minutes and seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(83_400)).toBe('1:23');
  });
});
