import { describe, expect, it } from 'vitest';

import {
  CLIENT_CAPABILITIES_REQUEST_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  MAX_REQUEST_ID_LENGTH,
  REQUEST_ID_HEADER,
  SYNC_PROTOCOL_VERSION_HEADER,
  isWellFormedRequestId,
  newRequestId,
} from '../header-names';

/**
 * These names are compared byte for byte by a client and a route that never
 * meet, so the values are pinned here: renaming one is a deliberate edit that
 * breaks this test rather than a header that silently stops being read.
 */
describe('request header names', () => {
  it('names each header once, in lower case, as a header is sent', () => {
    expect(REQUEST_ID_HEADER).toBe('x-request-id');
    expect(IDEMPOTENCY_KEY_HEADER).toBe('idempotency-key');
    expect(SYNC_PROTOCOL_VERSION_HEADER).toBe('x-agi-sync-protocol');
    for (const name of [REQUEST_ID_HEADER, IDEMPOTENCY_KEY_HEADER, SYNC_PROTOCOL_VERSION_HEADER]) {
      expect(name).toBe(name.toLowerCase());
    }
  });

  it('names the header a client lists its optional capabilities in', () => {
    expect(CLIENT_CAPABILITIES_REQUEST_HEADER).toBe('x-agi-client-capabilities');
    expect(CLIENT_CAPABILITIES_REQUEST_HEADER).toBe(
      CLIENT_CAPABILITIES_REQUEST_HEADER.toLowerCase(),
    );
  });
});

describe('request id shape', () => {
  it('accepts what a client mints', () => {
    expect(isWellFormedRequestId(newRequestId())).toBe(true);
    expect(newRequestId()).not.toBe(newRequestId());
  });

  it('refuses anything that would reach a log line as something other than an id', () => {
    for (const value of [
      '',
      null,
      undefined,
      'a b',
      'a\nb',
      'a\rb',
      'drop\u0000',
      '<script>',
      '"quoted"',
      'x'.repeat(MAX_REQUEST_ID_LENGTH + 1),
    ]) {
      expect(isWellFormedRequestId(value), `${String(value)} was accepted`).toBe(false);
    }
  });

  it('accepts an id at the ceiling and the punctuation trace ids use', () => {
    expect(isWellFormedRequestId('x'.repeat(MAX_REQUEST_ID_LENGTH))).toBe(true);
    expect(isWellFormedRequestId('req_1.2-3~4')).toBe(true);
  });
});
