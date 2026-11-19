import { CHAT_LARGE_FILE_MAX_BYTES } from '@agiworkforce/cloud-contracts';
import { describe, expect, it } from 'vitest';

import {
  CLAMD_SOURCE_SCAN_SETTINGS,
  SOURCE_SCAN_DEFAULTS,
  clamdSizeBytes,
  loadSourceScanConfig,
} from '../src/config.ts';
import { MAX_SCAN_BYTES } from '../src/server.ts';

const STREAM_MAX_BYTES = clamdSizeBytes(CLAMD_SOURCE_SCAN_SETTINGS['StreamMaxLength'] ?? '0');

describe('source scan size limit', () => {
  it('is the built 520 MiB, which clamd accepts whole on one stream', () => {
    expect(SOURCE_SCAN_DEFAULTS.maxBytes).toBe(545_259_520);
    expect(STREAM_MAX_BYTES).toBe(SOURCE_SCAN_DEFAULTS.maxBytes);
  });

  it('is above the legacy limit, so a source scan never refuses what the buffered path takes', () => {
    expect(SOURCE_SCAN_DEFAULTS.maxBytes).toBeGreaterThan(MAX_SCAN_BYTES);
  });

  it('holds the largest chat file the contracts allow', () => {
    expect(SOURCE_SCAN_DEFAULTS.maxBytes).toBeGreaterThanOrEqual(CHAT_LARGE_FILE_MAX_BYTES);
  });

  it('cannot be configured above what clamd reads', () => {
    const hosts = { UPLOAD_SCAN_SOURCE_HOSTS: 'storage.example.com' };
    expect(
      loadSourceScanConfig({ ...hosts, MAX_SOURCE_SCAN_BYTES: String(STREAM_MAX_BYTES) })?.maxBytes,
    ).toBe(STREAM_MAX_BYTES);
    expect(() =>
      loadSourceScanConfig({ ...hosts, MAX_SOURCE_SCAN_BYTES: String(STREAM_MAX_BYTES + 1) }),
    ).toThrow();
  });
});
