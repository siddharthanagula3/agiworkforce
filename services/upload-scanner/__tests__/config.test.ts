import { describe, expect, it } from 'vitest';

import {
  MIN_TOKEN_LENGTH,
  SOURCE_SCAN_DEFAULTS,
  loadConfig,
  loadSourceScanConfig,
} from '../src/config.ts';

const TOKEN = 'a'.repeat(MIN_TOKEN_LENGTH);
const PREVIOUS_TOKEN = 'b'.repeat(MIN_TOKEN_LENGTH);

describe('loadConfig', () => {
  it('refuses to start without a token, so no request is ever served unauthenticated', () => {
    expect(() => loadConfig({})).toThrow(/UPLOAD_SCAN_WEBHOOK_TOKEN/);
    expect(() => loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: '   ' })).toThrow(
      /UPLOAD_SCAN_WEBHOOK_TOKEN/,
    );
  });

  it('refuses a token shorter than the minimum, including the one being rotated out', () => {
    expect(() => loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN.slice(1) })).toThrow();
    expect(() =>
      loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN, UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS: 'short' }),
    ).toThrow();
  });

  it('accepts the current token and the one being rotated out', () => {
    expect(
      loadConfig({
        UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN,
        UPLOAD_SCAN_WEBHOOK_TOKEN_PREVIOUS: PREVIOUS_TOKEN,
      }),
    ).toEqual({ tokens: [TOKEN, PREVIOUS_TOKEN], port: 8080 });
  });

  it('listens on PORT and refuses a value that is not a port', () => {
    expect(loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN, PORT: '9000' }).port).toBe(9000);
    expect(() => loadConfig({ UPLOAD_SCAN_WEBHOOK_TOKEN: TOKEN, PORT: 'http' })).toThrow(/PORT/);
  });
});

describe('loadSourceScanConfig', () => {
  const HOSTS = { UPLOAD_SCAN_SOURCE_HOSTS: 'abc123.r2.example.com' };

  it('offers no source scans while UPLOAD_SCAN_SOURCE_HOSTS is unset or blank', () => {
    expect(loadSourceScanConfig({})).toBeNull();
    expect(loadSourceScanConfig({ UPLOAD_SCAN_SOURCE_HOSTS: ' , ' })).toBeNull();
    expect(loadSourceScanConfig({ MAX_SOURCE_SCAN_BYTES: 'not read' })).toBeNull();
  });

  it('uses the built values when only the hosts are set', () => {
    expect(loadSourceScanConfig(HOSTS)).toEqual({
      hosts: ['abc123.r2.example.com'],
      maxBytes: 545_259_520,
      concurrency: 1,
      queueMax: 20,
      bytesPerHour: 2_147_483_648,
      baseMs: 30_000,
      minBytesPerSec: 5_242_880,
    });
    expect(SOURCE_SCAN_DEFAULTS.bytesPerHour).toBe(2_147_483_648);
  });

  it('reads every variable and normalises the host list', () => {
    expect(
      loadSourceScanConfig({
        UPLOAD_SCAN_SOURCE_HOSTS: ' Staging.Example.com , other.example.com,staging.example.com ',
        MAX_SOURCE_SCAN_BYTES: '524288000',
        SCAN_SOURCE_CONCURRENCY: '2',
        SCAN_QUEUE_MAX: '5',
        SCAN_SOURCE_BYTES_PER_HOUR: '524288000',
        SCAN_BASE_MS: '45000',
        SCAN_MIN_BYTES_PER_SEC: '1048576',
      }),
    ).toEqual({
      hosts: ['staging.example.com', 'other.example.com'],
      maxBytes: 524_288_000,
      concurrency: 2,
      queueMax: 5,
      bytesPerHour: 524_288_000,
      baseMs: 45_000,
      minBytesPerSec: 1_048_576,
    });
  });

  it.each([
    'https://storage.example.com',
    'storage.example.com:443',
    'storage.example.com/bucket',
    '10.0.0.1',
    '[::1]',
    'localhost',
    '-bad.example.com',
  ])('refuses the host entry %s', (entry) => {
    expect(() => loadSourceScanConfig({ UPLOAD_SCAN_SOURCE_HOSTS: entry })).toThrow(
      /UPLOAD_SCAN_SOURCE_HOSTS/,
    );
  });

  it.each([
    ['SCAN_SOURCE_CONCURRENCY', '0'],
    ['SCAN_QUEUE_MAX', '-1'],
    ['SCAN_SOURCE_BYTES_PER_HOUR', '2GiB'],
    ['SCAN_BASE_MS', '1.5'],
    ['SCAN_MIN_BYTES_PER_SEC', 'fast'],
    ['MAX_SOURCE_SCAN_BYTES', '1e9'],
  ])('refuses %s=%s instead of starting with a guess', (name, value) => {
    expect(() => loadSourceScanConfig({ ...HOSTS, [name]: value })).toThrow(name);
  });

  it("refuses a MAX_SOURCE_SCAN_BYTES clamd's stream limit would cut short", () => {
    expect(() =>
      loadSourceScanConfig({ ...HOSTS, MAX_SOURCE_SCAN_BYTES: String(545_259_521) }),
    ).toThrow(/StreamMaxLength/);
  });
});
