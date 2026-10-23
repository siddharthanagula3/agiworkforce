import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractEmbeddedProvenance } from '@agiworkforce/compliance';
import { buildAiGeneratedProvenance } from '@/lib/compliance/ai-act';
import {
  GeneratedMediaProvenanceError,
  markGeneratedImage,
  markGeneratedMediaBytes,
  markGeneratedVideoFile,
} from './generated-media-provenance';

vi.mock('server-only', () => ({}));

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function isoVideo(): Buffer {
  const ftyp = Buffer.from('00000014667479706d703432000000006d703432', 'hex');
  const mdat = Buffer.concat([
    Buffer.from('00000408', 'hex'),
    Buffer.from('mdat'),
    Buffer.alloc(1024),
  ]);
  return Buffer.concat([ftyp, mdat]);
}

const imageClaim = buildAiGeneratedProvenance({
  kind: 'image',
  provider: 'fixture-provider',
  model: 'fixture-image-model',
});
const videoClaim = buildAiGeneratedProvenance({
  kind: 'video',
  provider: 'fixture-provider',
  model: 'fixture-video-model',
});

describe('generated media provenance', () => {
  let directory: string;
  let file: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'agi-media-mark-'));
    file = path.join(directory, 'provider-output');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes the claim into an image and leaves the pixels alone', () => {
    const marked = markGeneratedImage(PNG, imageClaim);

    expect(extractEmbeddedProvenance(marked)).toEqual(imageClaim);
    expect(Buffer.from(marked).includes(PNG.subarray(33, 33 + 12 + 4))).toBe(true);
  });

  it('refuses an image it cannot mark', () => {
    expect(() => markGeneratedImage(Buffer.from('not an image'), imageClaim)).toThrow(
      GeneratedMediaProvenanceError,
    );
  });

  it('marks staged video in place and reports the size it now has', async () => {
    const original = isoVideo();
    await writeFile(file, original);

    const size = await markGeneratedVideoFile(file, 'video/mp4', videoClaim);

    const written = await readFile(file);
    expect(size).toBe(written.byteLength);
    expect((await stat(file)).size).toBe(size);
    expect(written.subarray(0, original.byteLength)).toEqual(original);
    expect(extractEmbeddedProvenance(written)).toEqual(videoClaim);
  });

  it('leaves a video it cannot mark exactly as it was', async () => {
    const damaged = Buffer.concat([isoVideo(), Buffer.from('trailing')]);
    await writeFile(file, damaged);

    await expect(markGeneratedVideoFile(file, 'video/mp4', videoClaim)).rejects.toBeInstanceOf(
      GeneratedMediaProvenanceError,
    );
    expect(await readFile(file)).toEqual(damaged);
  });

  it('refuses a video type it has no container rules for', async () => {
    await writeFile(file, isoVideo());

    await expect(markGeneratedVideoFile(file, 'video/x-flv', videoClaim)).rejects.toBeInstanceOf(
      GeneratedMediaProvenanceError,
    );
  });

  it('marks in-memory images and video by their declared type', async () => {
    const image = await markGeneratedMediaBytes(PNG, 'image/png', imageClaim);
    const video = await markGeneratedMediaBytes(isoVideo(), 'video/mp4; codecs=avc1', videoClaim);

    expect(extractEmbeddedProvenance(image)).toEqual(imageClaim);
    expect(extractEmbeddedProvenance(video)).toEqual(videoClaim);
  });
});
