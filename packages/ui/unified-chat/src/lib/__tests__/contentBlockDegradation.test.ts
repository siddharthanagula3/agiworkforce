import { describe, expect, it } from 'vitest';
import {
  CLIENT_CAPABILITY_MANIFEST_SCHEMA_VERSION,
  MESSAGE_KINDS,
  degradeUnsupported,
  readClientCapabilityManifest,
  type ClientCapabilityManifest,
} from '@agiworkforce/types';

const UNKNOWN_KIND = 'hologram';

function manifestWire(renderableBlocks: readonly string[]): Record<string, unknown> {
  return {
    schemaVersion: CLIENT_CAPABILITY_MANIFEST_SCHEMA_VERSION,
    surface: 'web',
    clientVersion: '2026.02.01',
    apiContractVersion: '2026-02-01',
    capabilities: [],
    renderableBlocks,
  };
}

function readOrThrow(renderableBlocks: readonly string[]) {
  const read = readClientCapabilityManifest(manifestWire(renderableBlocks));
  if (!read.ok) throw new Error(`manifest refused: ${read.detail}`);
  return read;
}

describe('every declared block kind survives the client compatibility boundary', () => {
  it('declares a vocabulary of stable, unique, lowercase kinds', () => {
    expect(MESSAGE_KINDS.length).toBeGreaterThan(0);
    expect(new Set(MESSAGE_KINDS).size).toBe(MESSAGE_KINDS.length);
    for (const kind of MESSAGE_KINDS) expect(kind).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it('keeps every kind a client claims and loses none of them on the way through', () => {
    const read = readOrThrow(MESSAGE_KINDS);
    expect(read.manifest.renderableBlocks).toEqual([...MESSAGE_KINDS]);
    expect(read.unknownBlocks).toEqual([]);
    expect(read.unknownFields).toEqual([]);
  });

  it('degrades each kind an older client cannot render to a server-rendered fallback', () => {
    for (const kind of MESSAGE_KINDS) {
      const withoutIt = MESSAGE_KINDS.filter((candidate) => candidate !== kind);
      const read = readOrThrow(withoutIt);
      const degraded = degradeUnsupported([...MESSAGE_KINDS], read.manifest);

      expect(degraded.map((entry) => entry.name)).toEqual([kind]);
      expect(degraded[0]?.fallback).toBe('server_rendered');
    }
  });

  it('reports a kind from a newer server instead of dropping it or crashing', () => {
    const read = readOrThrow([...MESSAGE_KINDS, UNKNOWN_KIND]);

    expect(read.unknownBlocks).toEqual([UNKNOWN_KIND]);
    expect(read.manifest.renderableBlocks).toEqual([...MESSAGE_KINDS]);

    const degraded = degradeUnsupported([...MESSAGE_KINDS, UNKNOWN_KIND], read.manifest);
    expect(degraded).toEqual([{ name: UNKNOWN_KIND, fallback: 'hidden' }]);
  });

  it('offers nothing at all to a client that renders every kind', () => {
    const manifest: ClientCapabilityManifest = readOrThrow(MESSAGE_KINDS).manifest;
    expect(degradeUnsupported([...MESSAGE_KINDS], manifest)).toEqual([]);
  });

  it('refuses a manifest from a build newer than this reader rather than half reading it', () => {
    const read = readClientCapabilityManifest({
      ...manifestWire(MESSAGE_KINDS),
      schemaVersion: CLIENT_CAPABILITY_MANIFEST_SCHEMA_VERSION + 1,
    });

    expect(read.ok).toBe(false);
    expect(read.ok ? null : read.reason).toBe('schema_too_new');
  });
});
