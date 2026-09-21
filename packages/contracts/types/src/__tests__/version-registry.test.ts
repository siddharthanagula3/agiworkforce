import { describe, expect, it } from 'vitest';

import {
  MINIMUM_SUPPORTED_RUNTIME_VERSION,
  PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
} from '../developer-session-versioning';
import {
  SURFACE_CAPABILITY_MANIFEST_MIN_SCHEMA_VERSION,
  SURFACE_CAPABILITY_MANIFEST_SCHEMA_VERSION,
  readSurfaceCapabilityManifest,
} from '../surface-capability-manifest';
import {
  VERSIONED_ARTIFACTS,
  VERSION_COMPATIBILITY,
  compareVersion,
  isReadableVersion,
  isVersionedArtifact,
  partitionKnownFields,
} from '../version-registry';

const range = { current: 3, minReadable: 2 };

describe('independent versions', () => {
  it('names every artifact once', () => {
    expect(new Set(VERSIONED_ARTIFACTS).size).toBe(VERSIONED_ARTIFACTS.length);
    for (const artifact of VERSIONED_ARTIFACTS) {
      expect(isVersionedArtifact(artifact)).toBe(true);
    }
    expect(isVersionedArtifact('app')).toBe(false);
  });

  it('tells a reader which side of the range a payload fell on', () => {
    expect(compareVersion(range, 1)).toBe('too_old');
    expect(compareVersion(range, 2)).toBe('readable');
    expect(compareVersion(range, 3)).toBe('readable');
    expect(compareVersion(range, 4)).toBe('too_new');
    expect(VERSION_COMPATIBILITY).toContain(compareVersion(range, 4));
  });

  it('refuses a shape rather than guessing at it', () => {
    expect(isReadableVersion(range, 4)).toBe(false);
    expect(isReadableVersion(range, 1)).toBe(false);
    expect(isReadableVersion(range, 2.5)).toBe(false);
  });

  it('keeps an unknown field out of the known set and reports it', () => {
    const report = partitionKnownFields({ a: 1, b: 2, c: 3 }, ['a', 'b'] as const);
    expect(report.known).toEqual({ a: 1, b: 2 });
    expect(report.unknown).toEqual(['c']);
  });
});

describe('a build meeting another build', () => {
  it('lets an older reader see that the server is ahead of it', () => {
    expect(SURFACE_CAPABILITY_MANIFEST_MIN_SCHEMA_VERSION).toBeLessThanOrEqual(
      SURFACE_CAPABILITY_MANIFEST_SCHEMA_VERSION,
    );
    const rejected = readSurfaceCapabilityManifest({
      schemaVersion: SURFACE_CAPABILITY_MANIFEST_MIN_SCHEMA_VERSION - 1,
      origin: 'server',
      sourceId: 'server-1',
      issuedAt: new Date().toISOString(),
      capabilities: {},
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe('schema_too_old');
  });

  it('tolerates a capability it has never heard of without granting it', () => {
    const read = readSurfaceCapabilityManifest({
      schemaVersion: SURFACE_CAPABILITY_MANIFEST_SCHEMA_VERSION,
      origin: 'server',
      sourceId: 'server-1',
      issuedAt: new Date().toISOString(),
      capabilities: { invented_capability: { state: 'enabled' } },
    });
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.unknownCapabilities).toEqual(['invented_capability']);
      expect(Object.keys(read.manifest.capabilities)).toEqual([]);
    }
  });

  it('gives the server a floor to refuse a dangerously old client against', () => {
    expect(MINIMUM_SUPPORTED_RUNTIME_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE).toBeTypeOf('number');
  });
});
