import { describe, expect, it } from 'vitest';

import {
  SYNC_PROTOCOL_MIN_VERSION,
  SYNC_PROTOCOL_VERSION,
  UNVERSIONED_SYNC_PROTOCOL_VERSION,
  resolveSyncProtocolVersion,
  syncProtocolRefusalMessage,
} from '../sync';

/**
 * The floor only exists if something reads it. These pin what a route gets back
 * for each kind of caller, including the one that names no version at all.
 */
describe('resolving a caller sync protocol version', () => {
  it('reads a caller at this build as readable and records what it declared', () => {
    expect(resolveSyncProtocolVersion(SYNC_PROTOCOL_VERSION)).toEqual({
      compatibility: 'readable',
      version: SYNC_PROTOCOL_VERSION,
      declared: true,
    });
  });

  it('places a caller that names no version one step under the floor', () => {
    expect(UNVERSIONED_SYNC_PROTOCOL_VERSION).toBe(SYNC_PROTOCOL_MIN_VERSION - 1);
    for (const value of [undefined, null]) {
      const decision = resolveSyncProtocolVersion(value);
      expect(decision.declared).toBe(false);
      expect(decision.compatibility).toBe('too_old');
    }
  });

  it('reads a version sent as a header string, because a header is never a number', () => {
    const decision = resolveSyncProtocolVersion(String(SYNC_PROTOCOL_VERSION));
    expect(decision).toEqual({
      compatibility: 'readable',
      version: SYNC_PROTOCOL_VERSION,
      declared: true,
    });
  });

  it('calls anything that is not a version too old rather than guessing at it', () => {
    for (const value of ['', 'two', {}, [], true, Number.NaN, 1.5]) {
      expect(resolveSyncProtocolVersion(value).compatibility).toBe('too_old');
    }
  });

  it('keeps too_new a separate answer, because the remedy is the other way round', () => {
    const decision = resolveSyncProtocolVersion(SYNC_PROTOCOL_VERSION + 1);
    expect(decision.compatibility).toBe('too_new');
    expect(syncProtocolRefusalMessage(decision, 'chat sync')).toContain('Retry once');
  });
});

describe('the sentence a refused caller is given', () => {
  it('names the version it sent and the one this deployment needs', () => {
    const message = syncProtocolRefusalMessage(resolveSyncProtocolVersion(1), 'chat sync');
    expect(message).toContain('sync protocol 1');
    expect(message).toContain(String(SYNC_PROTOCOL_MIN_VERSION));
    expect(message).toContain('chat sync');
  });

  it('says so plainly when the caller named nothing, rather than inventing a number', () => {
    const message = syncProtocolRefusalMessage(
      resolveSyncProtocolVersion(undefined),
      'memory sync',
    );
    expect(message).toContain('no sync protocol');
    expect(message).not.toContain(String(UNVERSIONED_SYNC_PROTOCOL_VERSION));
  });
});
