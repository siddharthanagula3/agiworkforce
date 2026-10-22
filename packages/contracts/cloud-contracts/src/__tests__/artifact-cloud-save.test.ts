import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_CLOUD_SAVE_REFUSALS,
  ArtifactCloudSaveRequestSchema,
  artifactCloudFileName,
  artifactCloudSaveByteLength,
  isArtifactCloudSaveRefusalCode,
} from '../artifact-cloud-save';

const valid = {
  fileName: 'Plan.html',
  mimeType: 'text/html',
  encoding: 'utf8',
  content: '<p>Plan</p>',
} as const;

describe('artifactCloudFileName', () => {
  it('replaces path separators and reserved characters', () => {
    expect(artifactCloudFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('replaces control characters', () => {
    expect(artifactCloudFileName('a\u0000b\nc')).toBe('a-b-c');
  });

  it('drops trailing dots and spaces and falls back when nothing is left', () => {
    expect(artifactCloudFileName('Report. .')).toBe('Report');
    expect(artifactCloudFileName('..')).toBe('artifact');
    expect(artifactCloudFileName('   ')).toBe('artifact');
  });

  it('is stable when applied twice', () => {
    const once = artifactCloudFileName('  a/b.. ');
    expect(artifactCloudFileName(once)).toBe(once);
  });
});

describe('ArtifactCloudSaveRequestSchema', () => {
  it('accepts a text file and a base64 file', () => {
    expect(ArtifactCloudSaveRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      ArtifactCloudSaveRequestSchema.safeParse({
        fileName: 'deck.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        encoding: 'base64',
        content: 'UEsDBA==',
      }).success,
    ).toBe(true);
  });

  it.each([
    ['a path separator in the name', { fileName: '../x.html' }],
    ['a reserved character in the name', { fileName: 'a:b.html' }],
    ['a malformed media type', { mimeType: 'text' }],
    ['a media type with parameters', { mimeType: 'text/html; charset=utf-8' }],
    ['base64 with illegal characters', { encoding: 'base64', content: 'not base64!' }],
    ['empty content', { content: '' }],
    ['an unknown encoding', { encoding: 'hex' }],
  ])('rejects %s', (_label, patch) => {
    expect(ArtifactCloudSaveRequestSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
});

describe('artifactCloudSaveByteLength', () => {
  it('counts utf8 bytes, not characters', () => {
    expect(artifactCloudSaveByteLength({ ...valid, content: 'é' })).toBe(2);
  });

  it('counts decoded base64 bytes including padding', () => {
    expect(artifactCloudSaveByteLength({ ...valid, encoding: 'base64', content: 'UEsDBA==' })).toBe(
      4,
    );
    expect(artifactCloudSaveByteLength({ ...valid, encoding: 'base64', content: 'UEsD' })).toBe(3);
    expect(artifactCloudSaveByteLength({ ...valid, encoding: 'base64', content: 'UEs=' })).toBe(2);
  });
});

describe('refusals', () => {
  it('names every connector the save can refuse', () => {
    expect(isArtifactCloudSaveRefusalCode('google_drive_not_connected')).toBe(true);
    expect(isArtifactCloudSaveRefusalCode('onedrive_write_not_granted')).toBe(true);
    expect(isArtifactCloudSaveRefusalCode('toString')).toBe(false);
    expect(Object.keys(ARTIFACT_CLOUD_SAVE_REFUSALS)).toHaveLength(6);
  });
});
