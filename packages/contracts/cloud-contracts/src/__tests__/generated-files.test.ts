
import { describe, expect, it } from 'vitest';
import {
  GeneratedFileWireSchema,
  parseGeneratedFilesDelta,
  resolveGeneratedFileUri,
} from '../generated-files';

const wireFile = {
  id: 'gf-1',
  file_name: 'report.pdf',
  mime_type: 'application/pdf',
  uri: '/api/files/gf-1',
  byte_count: 2048,
  kind: 'pdf',
  checksum_sha256: 'a'.repeat(64),
  surface: 'file',
  previewable: true,
};

describe('GeneratedFileWireSchema', () => {
  it('accepts the server wire shape (generated-file-persist.ts GeneratedFileWire)', () => {
    expect(GeneratedFileWireSchema.safeParse(wireFile).success).toBe(true);
  });

  it('accepts a descriptor without checksum_sha256', () => {
    const { checksum_sha256: _omitted, ...rest } = wireFile;
    expect(GeneratedFileWireSchema.safeParse(rest).success).toBe(true);
  });

  it('rejects a descriptor missing the uri', () => {
    const { uri: _omitted, ...rest } = wireFile;
    expect(GeneratedFileWireSchema.safeParse(rest).success).toBe(false);
  });

  it('defaults surface/previewable on pre-classification payloads (backward compat)', () => {
    const { surface: _s, previewable: _p, ...legacy } = wireFile;
    const parsed = GeneratedFileWireSchema.parse(legacy);
    expect(parsed.surface).toBe('file');
    expect(parsed.previewable).toBe(false);
  });

  it('folds an unknown surface value to file instead of rejecting the descriptor', () => {
    const parsed = GeneratedFileWireSchema.parse({ ...wireFile, surface: 'canvas' });
    expect(parsed.surface).toBe('file');
  });

  it('accepts the artifact surface', () => {
    const parsed = GeneratedFileWireSchema.parse({
      ...wireFile,
      file_name: 'index.html',
      mime_type: 'text/html',
      kind: 'html',
      surface: 'artifact',
      previewable: true,
    });
    expect(parsed.surface).toBe('artifact');
    expect(parsed.previewable).toBe(true);
  });
});

describe('parseGeneratedFilesDelta', () => {
  it('parses a valid delta payload', () => {
    expect(parseGeneratedFilesDelta({ files: [wireFile] })).toEqual([wireFile]);
  });

  it('salvages valid files and drops malformed entries', () => {
    const parsed = parseGeneratedFilesDelta({
      files: [wireFile, { id: 'broken' }, null, 'nope'],
    });
    expect(parsed).toEqual([wireFile]);
  });

  it('returns [] for absent or malformed payloads', () => {
    expect(parseGeneratedFilesDelta(undefined)).toEqual([]);
    expect(parseGeneratedFilesDelta(null)).toEqual([]);
    expect(parseGeneratedFilesDelta('x')).toEqual([]);
    expect(parseGeneratedFilesDelta({})).toEqual([]);
    expect(parseGeneratedFilesDelta({ files: 'not-an-array' })).toEqual([]);
  });
});

describe('resolveGeneratedFileUri', () => {
  it('joins a relative /api/files uri onto the cloud API base', () => {
    expect(resolveGeneratedFileUri('/api/files/gf-1', 'https://agiworkforce.com')).toBe(
      'https://agiworkforce.com/api/files/gf-1',
    );
  });

  it('normalizes a trailing slash on the base', () => {
    expect(resolveGeneratedFileUri('/api/files/gf-1', 'https://agiworkforce.com/')).toBe(
      'https://agiworkforce.com/api/files/gf-1',
    );
  });

  it('passes absolute http(s) uris through unchanged', () => {
    expect(resolveGeneratedFileUri('https://media.example/x.pdf', 'https://agiworkforce.com')).toBe(
      'https://media.example/x.pdf',
    );
  });

  it('returns the uri as-is when the base is empty (same-origin web)', () => {
    expect(resolveGeneratedFileUri('/api/files/gf-1', '')).toBe('/api/files/gf-1');
  });
});
