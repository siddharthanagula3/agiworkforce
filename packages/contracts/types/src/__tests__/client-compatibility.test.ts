import { describe, expect, it } from 'vitest';

import { ALL_PLATFORM_CAPABILITIES } from '../capabilities';
import {
  CLIENT_CAPABILITY_MANIFEST_SCHEMA_VERSION,
  degradeUnsupported,
  readClientCapabilityManifest,
  resolveClientUpgrade,
  type ClientCapabilityManifest,
  type ServerVersionAdvertisement,
} from '../client-capability-manifest';
import { MESSAGE_KINDS } from '../conversation';
import { resolveFeatureRelease } from '../feature-release';
import { channelCarriesMaturity, modelStatusMaturity } from '../model-catalog';
import { partitionKnownFields } from '../version-registry';

const ADVERTISEMENT: ServerVersionAdvertisement = {
  latest: '2026-09-17',
  minimumSupported: '2026-05-01',
  unsupportedBelow: '2026-01-01',
};

function wire(overrides: Record<string, unknown> = {}): unknown {
  return JSON.parse(
    JSON.stringify({
      schemaVersion: CLIENT_CAPABILITY_MANIFEST_SCHEMA_VERSION,
      surface: 'mobile',
      clientVersion: '3.2.1',
      apiContractVersion: ADVERTISEMENT.latest,
      capabilities: [ALL_PLATFORM_CAPABILITIES[0]],
      renderableBlocks: ['text', 'image'],
      ...overrides,
    }),
  );
}

function manifest(overrides: Partial<ClientCapabilityManifest> = {}): ClientCapabilityManifest {
  const read = readClientCapabilityManifest(wire());
  if (!read.ok) throw new Error(read.detail);
  return { ...read.manifest, ...overrides };
}

describe('a manifest crossing the wire', () => {
  it('survives the round trip every surface sends it through', () => {
    for (const surface of ['web', 'desktop', 'mobile', 'cli', 'vscode', 'chrome']) {
      const read = readClientCapabilityManifest(wire({ surface }));
      expect(read.ok, surface).toBe(true);
      if (!read.ok) continue;
      expect(read.manifest.surface).toBe(surface);
      expect(JSON.parse(JSON.stringify(read.manifest))).toEqual(read.manifest);
    }
  });

  it('refuses a payload that names no surface rather than guessing one', () => {
    const read = readClientCapabilityManifest(wire({ surface: 'toaster' }));
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.reason).toBe('unreadable');
  });

  it('refuses a schema newer than this reader instead of half reading it', () => {
    const read = readClientCapabilityManifest(
      wire({ schemaVersion: CLIENT_CAPABILITY_MANIFEST_SCHEMA_VERSION + 1 }),
    );
    expect(read.ok).toBe(false);
    if (read.ok) return;
    expect(read.reason).toBe('schema_too_new');
  });
});

describe('a client meeting a server it was not built against', () => {
  it('keeps working and is told there is something newer', () => {
    const decision = resolveClientUpgrade(ADVERTISEMENT, '2026-07-01');
    expect(decision.state).toBe('upgrade_optional');
    expect(decision.usable).toBe(true);
    expect(decision.target).toBe(ADVERTISEMENT.latest);
  });

  it('is stopped with somewhere to go when it falls under the supported floor', () => {
    const decision = resolveClientUpgrade(ADVERTISEMENT, '2026-03-01');
    expect(decision.state).toBe('upgrade_required');
    expect(decision.usable).toBe(false);
    expect(decision.target).toBe(ADVERTISEMENT.minimumSupported);
  });

  it('is refused outright below the dangerous floor rather than half served', () => {
    const decision = resolveClientUpgrade(ADVERTISEMENT, '2025-11-30');
    expect(decision.state).toBe('unsupported');
    expect(decision.usable).toBe(false);
  });

  it('is left alone when it is newer than the deployment it reached', () => {
    const decision = resolveClientUpgrade(ADVERTISEMENT, '2027-01-01');
    expect(decision.state).toBe('current');
    expect(decision.usable).toBe(true);
    expect(decision.target).toBeUndefined();
  });
});

describe('what a reader does with something it has never seen', () => {
  it('reports a capability it does not know instead of granting or dropping it', () => {
    const read = readClientCapabilityManifest(
      wire({ capabilities: [ALL_PLATFORM_CAPABILITIES[0], 'telepathy'] }),
    );
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.unknownCapabilities).toEqual(['telepathy']);
    expect(read.manifest.capabilities).not.toContain('telepathy');
  });

  it('reports a block kind it cannot render instead of showing an empty bubble', () => {
    const read = readClientCapabilityManifest(wire({ renderableBlocks: ['text', 'hologram'] }));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.unknownBlocks).toEqual(['hologram']);
    expect(read.manifest.renderableBlocks).toEqual(['text']);
  });

  it('keeps a field a newer client added rather than failing on it', () => {
    const read = readClientCapabilityManifest(wire({ batteryLevel: 0.4 }));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.unknownFields).toEqual(['batteryLevel']);
  });

  it('keeps an unknown field on an event the same way', () => {
    const { known, unknown } = partitionKnownFields(
      { eventId: 'evt_1', occurredAt: '2026-09-17T00:00:00Z', region: 'eu' },
      ['eventId', 'occurredAt'],
    );
    expect(unknown).toEqual(['region']);
    expect(known).toEqual({ eventId: 'evt_1', occurredAt: '2026-09-17T00:00:00Z' });
  });

  it('hides a feature the client cannot do and renders a block it cannot draw on the server', () => {
    const degraded = degradeUnsupported(
      ['telepathy', 'artifact'],
      manifest({ renderableBlocks: ['text'] }),
    );
    expect(degraded).toEqual([
      { name: 'telepathy', fallback: 'hidden' },
      { name: 'artifact', fallback: 'server_rendered' },
    ]);
    expect(MESSAGE_KINDS).toContain('artifact');
  });

  it('degrades nothing the client already does', () => {
    expect(degradeUnsupported(['text'], manifest())).toEqual([]);
  });
});

describe('something the product has moved on from', () => {
  it('keeps serving a deprecated feature to the build that still asks for it', () => {
    const release = resolveFeatureRelease({
      feature: 'work',
      channel: 'stable',
      availability: 'general',
    });
    expect(release.released).toBe(true);
    expect(release.blockers).toEqual([]);
  });

  it('keeps an unfinished feature off a build that was handed to everyone', () => {
    const release = resolveFeatureRelease({
      feature: 'computer_use',
      channel: 'stable',
      availability: 'general',
    });
    expect(release.released).toBe(false);
    expect(release.blockers).toContain('channel_too_wide');
  });

  it('refuses a feature the calling build is too old for and names the floor', () => {
    const release = resolveFeatureRelease({
      feature: 'code',
      channel: 'stable',
      availability: 'general',
      clientVersion: '0.0.1',
      backendVersion: '99.0.0',
      floors: { MINIMUM_SUPPORTED_RUNTIME_VERSION: '2.0.0', API_CONTRACT_VERSION: '1.0.0' },
    });
    expect(release.blockers).toContain('client_too_old');
    expect(release.minClientVersion).not.toBeNull();
  });

  it('refuses rather than compares a name to a number when a floor resolves to nothing', () => {
    const release = resolveFeatureRelease({
      feature: 'code',
      channel: 'stable',
      availability: 'general',
      clientVersion: '99.0.0',
      backendVersion: '99.0.0',
    });
    expect(release.released).toBe(false);
    expect(release.blockers).toContain('floor_unresolved');
  });

  it('stops honouring an override the day it expires', () => {
    const release = resolveFeatureRelease({
      feature: 'work',
      channel: 'stable',
      availability: 'general',
      override: { enabled: true, variant: 'b', expiresAt: '2026-01-01T00:00:00Z' },
      now: new Date('2026-09-17T00:00:00Z'),
    });
    expect(release.blockers).toContain('override_expired');
  });

  it('keeps a deprecated model on the channel an existing build already reads', () => {
    expect(channelCarriesMaturity('stable', modelStatusMaturity('deprecated'))).toBe(true);
    expect(channelCarriesMaturity('stable', modelStatusMaturity('experimental'))).toBe(false);
  });
});
