import { describe, expect, it } from 'vitest';

import { ALL_PLATFORM_CAPABILITIES, type PlatformCapability } from '../capabilities';
import {
  CAPABILITY_DENIAL_REASONS,
  CAPABILITY_DENIAL_TAXONOMY,
  CAPABILITY_ENABLED,
  CAPABILITY_REMEDY_FIELDS,
  CAPABILITY_STATES,
  capabilityRemedyObligation,
  describeCapabilityState,
  isCapabilityState,
  missingCapabilityRemedy,
  type CapabilityDenialReason,
} from '../reason-codes';
import {
  SURFACE_CAPABILITY_MANIFEST_MIN_SCHEMA_VERSION,
  SURFACE_CAPABILITY_MANIFEST_SCHEMA_VERSION,
  combineSurfaceCapabilityManifests,
  presentCapability,
  readSurfaceCapabilityManifest,
  type CapabilityAvailability,
  type SurfaceCapabilityManifest,
} from '../surface-capability-manifest';

function manifest(
  origin: SurfaceCapabilityManifest['origin'],
  capabilities: Partial<Record<PlatformCapability, CapabilityAvailability>>,
  schemaVersion: number = SURFACE_CAPABILITY_MANIFEST_SCHEMA_VERSION,
): SurfaceCapabilityManifest {
  return {
    schemaVersion,
    origin,
    sourceId: `${origin}:test`,
    issuedAt: '2026-09-20T00:00:00.000Z',
    capabilities,
  };
}

const everything = (state = CAPABILITY_ENABLED) =>
  Object.fromEntries(
    ALL_PLATFORM_CAPABILITIES.map((capability) => [capability, { state }]),
  ) as Record<PlatformCapability, CapabilityAvailability>;

describe('the capability state vocabulary', () => {
  it('covers availability and every reason a capability can be withheld', () => {
    expect(CAPABILITY_STATES[0]).toBe(CAPABILITY_ENABLED);
    expect([...CAPABILITY_STATES].slice(1)).toEqual([...CAPABILITY_DENIAL_REASONS]);
    expect(new Set(CAPABILITY_STATES).size).toBe(CAPABILITY_STATES.length);
  });

  it('separates the layer that decided from the one that merely reports', () => {
    for (const pair of [
      ['unsupported_by_model', 'unsupported_by_provider'],
      ['disabled_by_organization', 'disabled_by_role'],
      ['requires_desktop_host', 'requires_browser_extension'],
      ['feature_deprecated', 'feature_removed'],
      ['provider_unavailable', 'temporarily_unavailable'],
    ] satisfies readonly (readonly [CapabilityDenialReason, CapabilityDenialReason])[]) {
      const [first, second] = pair;
      expect(CAPABILITY_DENIAL_TAXONOMY[first].errorCode).not.toBe(
        CAPABILITY_DENIAL_TAXONOMY[second].errorCode,
      );
      expect(CAPABILITY_DENIAL_TAXONOMY[first].message).not.toBe(
        CAPABILITY_DENIAL_TAXONOMY[second].message,
      );
    }
  });

  it('gives every unavailable state an explanation, a code and a remediation', () => {
    for (const reason of CAPABILITY_DENIAL_REASONS) {
      const explained = describeCapabilityState(reason);
      expect(explained.reason).toBe(reason);
      expect(explained.errorCode).toBe(CAPABILITY_DENIAL_TAXONOMY[reason].errorCode);
      expect(explained.decidedBy).toBe(CAPABILITY_DENIAL_TAXONOMY[reason].decidedBy);
      expect(explained.title.length).toBeGreaterThan(0);
      expect(explained.suggestion.length).toBeGreaterThan(0);
      expect(explained.message).not.toContain(reason);
    }
  });

  it('leaves an available capability with no reason and no remedy to chase', () => {
    const explained = describeCapabilityState(CAPABILITY_ENABLED);
    expect(explained.reason).toBeNull();
    expect(explained.errorCode).toBeNull();
    expect(explained.retryable).toBe(false);
  });

  it('names the one field each state cannot be honest without', () => {
    const obligations = CAPABILITY_DENIAL_REASONS.map(capabilityRemedyObligation).filter(
      (field): field is (typeof CAPABILITY_REMEDY_FIELDS)[number] => field !== null,
    );
    expect(new Set(obligations)).toEqual(new Set(CAPABILITY_REMEDY_FIELDS));

    expect(missingCapabilityRemedy('requires_upgrade', {})).toBe('requiredPlan');
    expect(missingCapabilityRemedy('requires_upgrade', { requiredPlan: 'max' })).toBeNull();
    expect(missingCapabilityRemedy('requires_permission', {})).toBe('requiredPermission');
    expect(missingCapabilityRemedy('requires_connected_account', {})).toBe('requiredConnector');
    expect(missingCapabilityRemedy('requires_browser_extension', {})).toBe('requiredDevice');
    expect(missingCapabilityRemedy('maintenance', {})).toBe('retryAfterSeconds');
    expect(missingCapabilityRemedy('feature_removed', {})).toBeNull();
  });

  it('marks exactly the states that are worth trying again as retryable', () => {
    expect(describeCapabilityState('provider_degraded').retryable).toBe(true);
    expect(describeCapabilityState('temporarily_unavailable').retryable).toBe(true);
    expect(describeCapabilityState('feature_removed').retryable).toBe(false);
    expect(describeCapabilityState('unsupported_by_operating_system').retryable).toBe(false);
  });

  it('recognises its own states and nothing else', () => {
    expect(isCapabilityState('unsupported_by_region')).toBe(true);
    expect(isCapabilityState('greyed_out')).toBe(false);
  });
});

describe('the surface capability manifest', () => {
  it('carries a schema version both halves can be read against', () => {
    expect(SURFACE_CAPABILITY_MANIFEST_SCHEMA_VERSION).toBeGreaterThanOrEqual(
      SURFACE_CAPABILITY_MANIFEST_MIN_SCHEMA_VERSION,
    );
    const read = readSurfaceCapabilityManifest(manifest('server', everything()));
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.manifest.schemaVersion).toBe(SURFACE_CAPABILITY_MANIFEST_SCHEMA_VERSION);
  });

  it('reads a manifest an older build wrote and refuses one older than the floor', () => {
    const older = readSurfaceCapabilityManifest(
      manifest('server', { canChat: { state: CAPABILITY_ENABLED } }, 1),
    );
    expect(older.ok).toBe(true);
    if (older.ok) expect(older.manifest.capabilities.canChat?.state).toBe(CAPABILITY_ENABLED);

    const ancient = readSurfaceCapabilityManifest(manifest('server', {}, 0));
    expect(ancient).toMatchObject({ ok: false, reason: 'schema_too_old' });
  });

  it('drops a capability a newer build invented instead of reading it as a grant', () => {
    const read = readSurfaceCapabilityManifest({
      ...manifest('server', {}),
      capabilities: { canChat: { state: CAPABILITY_ENABLED }, canReadMinds: { state: 'enabled' } },
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.unknownCapabilities).toEqual(['canReadMinds']);
    expect(Object.keys(read.manifest.capabilities)).toEqual(['canChat']);
  });

  it('refuses a manifest whose state word it does not know', () => {
    const read = readSurfaceCapabilityManifest({
      ...manifest('server', {}),
      capabilities: { canChat: { state: 'probably' } },
    });
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.unknownCapabilities).toEqual(['canChat']);
  });

  it('combines the server and the local host rather than trusting either alone', () => {
    const combined = combineSurfaceCapabilityManifests(
      manifest('server', everything()),
      manifest('host', everything()),
    );
    expect(Object.keys(combined.capabilities).sort()).toEqual(
      [...ALL_PLATFORM_CAPABILITIES].sort(),
    );
    expect(combined.sources).toEqual({ server: 'server:test', host: 'host:test' });
    expect(presentCapability(combined, 'canChat').available).toBe(true);
  });

  it('keeps a capability the server allows and the host cannot run unavailable', () => {
    const combined = combineSurfaceCapabilityManifests(
      manifest('server', everything()),
      manifest('host', {
        ...everything(),
        canUseTerminal: { state: 'unsupported_by_operating_system' },
      }),
    );
    const presented = presentCapability(combined, 'canUseTerminal');
    expect(presented.available).toBe(false);
    expect(presented.origin).toBe('host');
    expect(presented.reason).toBe('unsupported_by_operating_system');
  });

  it('lets policy withhold a capability the surface fully supports', () => {
    const combined = combineSurfaceCapabilityManifests(
      manifest('server', {
        ...everything(),
        canUseConnectors: {
          state: 'disabled_by_organization',
          remedy: { requiredPermission: 'admin.policy.manage' },
        },
      }),
      manifest('host', everything()),
    );
    const presented = presentCapability(combined, 'canUseConnectors');
    expect(presented.origin).toBe('server');
    expect(presented.reason).toBe('disabled_by_organization');
    expect(presented.available).toBe(false);
  });

  it('separates plan, region and seat from one another in the combined answer', () => {
    const combined = combineSurfaceCapabilityManifests(
      manifest('server', {
        ...everything(),
        canUseDeepResearch: { state: 'requires_upgrade', remedy: { requiredPlan: 'max' } },
        canUseVoice: { state: 'unsupported_by_region' },
        canUseCloudExecution: { state: 'requires_seat', remedy: { requiredPlan: 'max' } },
      }),
      manifest('host', everything()),
    );
    expect(presentCapability(combined, 'canUseDeepResearch').remedy.requiredPlan).toBe('max');
    expect(presentCapability(combined, 'canUseVoice').reason).toBe('unsupported_by_region');
    expect(presentCapability(combined, 'canUseCloudExecution').reason).toBe('requires_seat');
  });

  it('carries a degraded capability through as working but not at full strength', () => {
    const combined = combineSurfaceCapabilityManifests(
      manifest('server', {
        ...everything(),
        canUseWebSearch: { state: CAPABILITY_ENABLED, degraded: true },
      }),
      manifest('host', everything()),
    );
    const presented = presentCapability(combined, 'canUseWebSearch');
    expect(presented.available).toBe(true);
    expect(presented.degraded).toBe(true);
  });

  it('treats a capability neither half mentions as unavailable, not as allowed', () => {
    const combined = combineSurfaceCapabilityManifests(
      manifest('server', {}),
      manifest('host', {}),
    );
    const presented = presentCapability(combined, 'canRunLocalCode');
    expect(presented.available).toBe(false);
    expect(presented.reason).toBe('unsupported_by_route');
  });

  it('reports a state that promises a remedy and does not carry one', () => {
    const combined = combineSurfaceCapabilityManifests(
      manifest('server', { ...everything(), canUseBilling: { state: 'requires_upgrade' } }),
      manifest('host', everything()),
    );
    expect(presentCapability(combined, 'canUseBilling').missingRemedy).toBe('requiredPlan');
  });

  it('carries a documentation link through to the surface when one is worth showing', () => {
    const combined = combineSurfaceCapabilityManifests(
      manifest('server', {
        ...everything(),
        canUseLocalMcp: {
          state: 'requires_desktop_host',
          remedy: { requiredDevice: 'desktop', documentationUrl: 'https://example.invalid/host' },
        },
      }),
      manifest('host', everything()),
    );
    const presented = presentCapability(combined, 'canUseLocalMcp');
    expect(presented.remedy.documentationUrl).toBe('https://example.invalid/host');
    expect(presented.missingRemedy).toBeNull();
  });

  it('gives a surface something to say instead of a control that is merely dead', () => {
    const combined = combineSurfaceCapabilityManifests(
      manifest('server', everything('feature_deprecated')),
      manifest('host', everything()),
    );
    for (const capabilityId of ALL_PLATFORM_CAPABILITIES) {
      const presented = presentCapability(combined, capabilityId);
      expect(presented.available).toBe(false);
      expect(presented.reason).not.toBeNull();
      expect(presented.title.length).toBeGreaterThan(0);
      expect(presented.message.length).toBeGreaterThan(0);
      expect(presented.suggestion.length).toBeGreaterThan(0);
    }
  });

  it('recomputes from a later manifest without the client restarting', () => {
    const host = manifest('host', everything());
    const before = combineSurfaceCapabilityManifests(manifest('server', everything()), host);
    const after = combineSurfaceCapabilityManifests(
      {
        ...manifest('server', {
          ...everything(),
          canUsePlugins: { state: 'disabled_by_organization' },
        }),
        issuedAt: '2026-09-20T01:00:00.000Z',
      },
      host,
    );
    expect(presentCapability(before, 'canUsePlugins').available).toBe(true);
    expect(presentCapability(after, 'canUsePlugins').available).toBe(false);
  });
});
