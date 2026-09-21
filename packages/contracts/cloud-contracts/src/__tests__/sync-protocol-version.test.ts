import { describe, expect, it } from 'vitest';

import {
  SYNC_PROTOCOL_MIN_VERSION,
  SYNC_PROTOCOL_VERSION,
  SyncProtocolVersionSchema,
  syncProtocolCompatibility,
} from '../sync';

/**
 * The floor is the whole point of carrying a version: a peer below it is told
 * it is out of date instead of meeting a parse failure it cannot explain. These
 * pin the answers every surface was built against, so raising the floor is a
 * deliberate edit here rather than a silent change of meaning on six clients.
 */
describe('sync protocol version', () => {
  it('never advertises a floor above what this build speaks', () => {
    expect(SYNC_PROTOCOL_MIN_VERSION).toBeLessThanOrEqual(SYNC_PROTOCOL_VERSION);
  });

  it('reads a peer at the current version', () => {
    expect(syncProtocolCompatibility(SYNC_PROTOCOL_VERSION)).toBe('readable');
  });

  it('calls a peer below the floor too old rather than trying to parse it', () => {
    expect(syncProtocolCompatibility(SYNC_PROTOCOL_MIN_VERSION - 1)).toBe('too_old');
  });

  it('calls a peer above this build too new, which is a different remedy', () => {
    expect(syncProtocolCompatibility(SYNC_PROTOCOL_VERSION + 1)).toBe('too_new');
  });

  it('fails closed on a version that is not a whole number', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1]) {
      expect(syncProtocolCompatibility(value)).toBe('too_old');
    }
  });

  it('accepts only the exact version on the wire, so a peer cannot claim a range', () => {
    expect(SyncProtocolVersionSchema.safeParse(SYNC_PROTOCOL_VERSION).success).toBe(true);
    expect(SyncProtocolVersionSchema.safeParse(SYNC_PROTOCOL_VERSION + 1).success).toBe(false);
    expect(SyncProtocolVersionSchema.safeParse(String(SYNC_PROTOCOL_VERSION)).success).toBe(false);
  });
});
