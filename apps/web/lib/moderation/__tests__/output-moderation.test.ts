import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { streamMock, metadataMock, hasKeyMock, loggerMock } = vi.hoisted(() => ({
  streamMock: vi.fn(),
  metadataMock: vi.fn(),
  hasKeyMock: vi.fn(),
  loggerMock: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({ logger: loggerMock }));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  buildServerProviderAdapter: () => ({ stream: streamMock }),
  hasServerProviderKey: (...args: unknown[]) => hasKeyMock(...args),
  toApiModelId: (id: string) => id,
}));
vi.mock('@agiworkforce/types', () => ({
  getModelMetadataById: (...args: unknown[]) => metadataMock(...args),
}));

import {
  GENERATED_OUTPUT_REFUSAL,
  moderateGeneratedMedia,
  moderateUploadedImage,
  parseClassifierVerdict,
} from '../output-moderation';
import { resetOutputClassifierModelCache } from '../output-classifier-model';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function* verdictStream(text: string) {
  yield { type: 'text-delta' as const, delta: text };
}

beforeEach(() => {
  delete process.env['MODERATION_HASH_DENYLIST'];
  delete process.env['MEDIA_OUTPUT_MODERATION_MODEL'];
  resetOutputClassifierModelCache();
  streamMock.mockReset();
  metadataMock.mockReset();
  hasKeyMock.mockReset().mockReturnValue(true);
  loggerMock.error.mockReset();
  loggerMock.warn.mockReset();
});

afterEach(() => {
  delete process.env['MODERATION_HASH_DENYLIST'];
  delete process.env['MEDIA_OUTPUT_MODERATION_MODEL'];
  resetOutputClassifierModelCache();
});

describe('moderateGeneratedMedia', () => {
  it('allows a structurally valid generated image', async () => {
    const verdict = await moderateGeneratedMedia({
      userId: 'user_1',
      media: 'image',
      operation: 'generate',
      bytes: PNG_1X1,
      mimeType: 'image/png',
    });
    expect(verdict.allowed).toBe(true);
    expect(streamMock).not.toHaveBeenCalled();
  });

  it('blocks generated output whose digest is on the hash denylist and audits it', async () => {
    process.env['MODERATION_HASH_DENYLIST'] = `ncmec:${sha256(PNG_1X1)}`;
    const verdict = await moderateGeneratedMedia({
      userId: 'user_1',
      media: 'image',
      operation: 'generate',
      bytes: PNG_1X1,
      prompt: 'a landscape',
    });
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error('expected a refusal');
    expect(verdict.reason).toBe('output_hash_denylist');
    expect(verdict.refusal).toBe(GENERATED_OUTPUT_REFUSAL);
    expect(loggerMock.error).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'generated-output', action: 'block' }),
      expect.any(String),
    );
  });

  it('re-checks edit output through the catalogue classifier and blocks on its verdict', async () => {
    process.env['MEDIA_OUTPUT_MODERATION_MODEL'] = 'vision-classifier';
    metadataMock.mockReturnValue({
      id: 'vision-classifier',
      provider: 'openai',
      inputModalities: ['text', 'image'],
    });
    streamMock.mockImplementation(() =>
      verdictStream('{"verdict":"block","categories":["likeness"]}'),
    );

    const verdict = await moderateGeneratedMedia({
      userId: 'user_1',
      media: 'image',
      operation: 'edit',
      bytes: PNG_1X1,
      mimeType: 'image/png',
    });

    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(verdict.allowed).toBe(false);
    if (verdict.allowed) throw new Error('expected a refusal');
    expect(verdict.reason).toBe('output_classifier');
    expect(verdict.categories).toEqual(['likeness']);
  });

  it('ignores a configured classifier model that cannot read images', async () => {
    process.env['MEDIA_OUTPUT_MODERATION_MODEL'] = 'text-only';
    metadataMock.mockReturnValue({
      id: 'text-only',
      provider: 'openai',
      inputModalities: ['text'],
    });

    const verdict = await moderateGeneratedMedia({
      userId: 'user_1',
      media: 'image',
      operation: 'generate',
      bytes: PNG_1X1,
    });

    expect(streamMock).not.toHaveBeenCalled();
    expect(verdict.allowed).toBe(true);
  });

  it('fails open when the classifier transport throws', async () => {
    process.env['MEDIA_OUTPUT_MODERATION_MODEL'] = 'vision-classifier';
    metadataMock.mockReturnValue({
      id: 'vision-classifier',
      provider: 'openai',
      inputModalities: ['image'],
    });
    streamMock.mockImplementation(() => {
      throw new Error('upstream down');
    });

    const verdict = await moderateGeneratedMedia({
      userId: 'user_1',
      media: 'image',
      operation: 'generate',
      bytes: PNG_1X1,
    });
    expect(verdict.allowed).toBe(true);
    expect(loggerMock.warn).toHaveBeenCalled();
  });
});

describe('moderateUploadedImage', () => {
  it('accepts a real image and a format this parser does not know', () => {
    expect(moderateUploadedImage(PNG_1X1).allowed).toBe(true);
    expect(moderateUploadedImage(Buffer.from('not an image at all')).allowed).toBe(true);
  });

  it('refuses empty bytes and a truncated image of a recognised format', () => {
    expect(moderateUploadedImage(Buffer.alloc(0)).reason).toBe('empty');
    expect(moderateUploadedImage(PNG_1X1.subarray(0, 40)).reason).toBe('malformed');
  });

  it('refuses a polyglot whose payload sits past the image terminator', () => {
    expect(moderateUploadedImage(Buffer.concat([PNG_1X1, Buffer.alloc(64, 0x41)])).reason).toBe(
      'malformed',
    );
  });

  it('refuses markup dressed as an image upload', () => {
    expect(
      moderateUploadedImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))
        .reason,
    ).toBe('active_content');
    expect(
      moderateUploadedImage(Buffer.concat([PNG_1X1, Buffer.from('<script>alert(1)</script>')]))
        .reason,
    ).toBe('active_content');
  });
});

describe('parseClassifierVerdict', () => {
  it('reads a verdict out of a fenced reply and drops unknown categories', () => {
    expect(
      parseClassifierVerdict('```json\n{"verdict":"block","categories":["csae","nope"]}\n```'),
    ).toEqual({ verdict: 'block', categories: ['csae'] });
  });

  it('returns null when the reply is not a verdict', () => {
    expect(parseClassifierVerdict('I cannot help with that')).toBeNull();
    expect(parseClassifierVerdict('{"verdict":"maybe"}')).toBeNull();
  });
});
