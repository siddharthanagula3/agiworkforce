import { describe, expect, it } from 'vitest';
import type { PlatformCapability } from '../capabilities';
import {
  CAPABILITY_DENIAL_ATTRIBUTE,
  CAPABILITY_DENIAL_REASONS,
  CAPABILITY_DENIAL_TAXONOMY,
  capabilityDenialAttributes,
  capabilityDenialErrorCode,
  capabilityDenialHttpStatus,
  capabilityDenialTelemetry,
  describeCapabilityDenial,
  type CapabilityDenialReason,
} from '../reason-codes';
import {
  evaluateCapabilityAdmission,
  resolveCapabilityDecision,
} from '../capability-handshake/evaluator';
import { buildEffectiveCapabilityDocument } from '../capability-handshake/registry';
import {
  CAPABILITY_LAYERS,
  type CapabilityLayer,
  type CapabilityLayerGrant,
} from '../capability-handshake/types';

const CAPABILITY: PlatformCapability = 'canUseWebSearch';
const OTHER: PlatformCapability = 'canUseDeepResearch';

function grant(
  layer: CapabilityLayer,
  granted: PlatformCapability[],
  overrides: Partial<CapabilityLayerGrant> = {},
): CapabilityLayerGrant {
  return { layer, sourceId: `${layer}:fixture`, granted: new Set(granted), ...overrides };
}

function documentWhere(denying: CapabilityLayer, overrides: Partial<CapabilityLayerGrant> = {}) {
  const layers = Object.fromEntries(
    CAPABILITY_LAYERS.map((layer) => [
      layer,
      layer === denying ? grant(layer, [OTHER], overrides) : grant(layer, [CAPABILITY, OTHER]),
    ]),
  ) as Record<CapabilityLayer, CapabilityLayerGrant>;
  return buildEffectiveCapabilityDocument({
    sessionId: 'session-1',
    version: '1',
    computedAt: '2026-09-18T00:00:00.000Z',
    layers,
  });
}

describe('every denial reason is separable', () => {
  it('maps each reason to a distinct error code', () => {
    const codes = CAPABILITY_DENIAL_REASONS.map(capabilityDenialErrorCode);
    expect(new Set(codes).size).toBe(CAPABILITY_DENIAL_REASONS.length);
  });

  it('gives each reason distinct UI copy, never a bare code', () => {
    const titles = new Set<string>();
    const messages = new Set<string>();
    for (const reason of CAPABILITY_DENIAL_REASONS) {
      const copy = describeCapabilityDenial(reason);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.suggestion.length).toBeGreaterThan(0);
      expect(copy.message).not.toContain(reason);
      titles.add(copy.title);
      messages.add(copy.message);
    }
    expect(titles.size).toBe(CAPABILITY_DENIAL_REASONS.length);
    expect(messages.size).toBe(CAPABILITY_DENIAL_REASONS.length);
  });

  it('resolves an http status for every reason without a generic fallback', () => {
    for (const reason of CAPABILITY_DENIAL_REASONS) {
      const status = capabilityDenialHttpStatus(reason);
      expect(status).toBeGreaterThanOrEqual(402);
      expect(status).toBeLessThan(511);
      expect(status).not.toBe(500);
    }
  });
});

describe('the deciding layer reaches the reader', () => {
  it.each([
    ['model', 'unsupported_by_provider'],
    ['tier', 'requires_upgrade'],
    ['surface', 'unsupported_by_surface'],
    ['settings', 'disabled_by_user'],
  ] as const)('a %s denial reads as %s', (layer, expected) => {
    const document = documentWhere(layer);
    const decision = resolveCapabilityDecision(document, CAPABILITY);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(expected);
    expect(decision.deniedByLayers).toEqual([layer]);
    expect(decision.policySource).toBe(`${layer}:fixture`);
    expect(decision.decidedBy).toBe(CAPABILITY_DENIAL_TAXONOMY[expected].decidedBy);
  });

  it('separates an organization denial from a workspace one on the same layer', () => {
    const byOrg = documentWhere('tier', { denialReason: 'disabled_by_organization' });
    const byWorkspace = documentWhere('tier', { denialReason: 'disabled_by_workspace' });

    expect(resolveCapabilityDecision(byOrg, CAPABILITY).reason).toBe('disabled_by_organization');
    expect(resolveCapabilityDecision(byWorkspace, CAPABILITY).reason).toBe('disabled_by_workspace');
    expect(capabilityDenialErrorCode('disabled_by_organization')).not.toBe(
      capabilityDenialErrorCode('disabled_by_workspace'),
    );
  });

  it('lets one layer deny two capabilities for two reasons', () => {
    const document = buildEffectiveCapabilityDocument({
      sessionId: 'session-1',
      version: '1',
      layers: Object.fromEntries(
        CAPABILITY_LAYERS.map((layer) => [
          layer,
          layer === 'tier'
            ? grant(layer, [], {
                denialReasons: { [CAPABILITY]: 'requires_seat', [OTHER]: 'requires_upgrade' },
              })
            : grant(layer, [CAPABILITY, OTHER]),
        ]),
      ) as Record<CapabilityLayer, CapabilityLayerGrant>,
    });

    expect(resolveCapabilityDecision(document, CAPABILITY).reason).toBe('requires_seat');
    expect(resolveCapabilityDecision(document, OTHER).reason).toBe('requires_upgrade');
  });

  it('leaves a granted capability with no reason and no decider', () => {
    const decision = resolveCapabilityDecision(documentWhere('tier'), OTHER);
    expect(decision).toMatchObject({ allowed: true, reason: null, decidedBy: null });
  });
});

describe('admission carries what would lift the denial', () => {
  it('names the plan and the permission the caller needs', () => {
    const result = evaluateCapabilityAdmission(documentWhere('tier'), [
      {
        capabilityId: CAPABILITY,
        strength: 'mandatory',
        remedy: { requiredPlan: 'max', requiredPermission: 'billing.read' },
      },
    ]);

    expect(result.admitted).toBe(false);
    if (result.admitted) return;
    expect(result.rejected[0]).toMatchObject({
      capabilityId: CAPABILITY,
      reasonCode: 'requires_upgrade',
      decidedBy: 'entitlement',
      requiredPlan: 'max',
      requiredPermission: 'billing.read',
    });
  });

  it('an optional requirement never rejects', () => {
    const result = evaluateCapabilityAdmission(documentWhere('tier'), [
      { capabilityId: CAPABILITY, strength: 'optional' },
    ]);
    expect(result.admitted).toBe(true);
  });

  it('a requirement the document never heard of fails closed with a named reason', () => {
    const result = evaluateCapabilityAdmission(documentWhere('tier'), [
      { capabilityId: 'canUseTerminal', strength: 'mandatory' },
    ]);

    expect(result.admitted).toBe(false);
    if (result.admitted) return;
    const rejection = result.rejected[0]!;
    expect(rejection.deniedByLayers).toEqual([...CAPABILITY_LAYERS]);
    expect(CAPABILITY_DENIAL_REASONS).toContain(rejection.reasonCode);
  });
});

describe('the copy is a lookup, not a literal', () => {
  it('prefers the locale bundle and falls back to English per field', () => {
    const bundle: Record<string, string> = {
      'capability.denial.requires_upgrade.title': 'Plan erforderlich',
    };
    const copy = describeCapabilityDenial('requires_upgrade', (key) => bundle[key]);

    expect(copy.title).toBe('Plan erforderlich');
    expect(copy.message).toBe(CAPABILITY_DENIAL_TAXONOMY.requires_upgrade.message);
  });

  it('gives every reason a message key under one namespace', () => {
    for (const reason of CAPABILITY_DENIAL_REASONS as readonly CapabilityDenialReason[]) {
      expect(CAPABILITY_DENIAL_TAXONOMY[reason].messageKey).toBe(`capability.denial.${reason}`);
    }
  });
});

describe('the denial reaches telemetry as dimensions', () => {
  it('records the cause and the remedy under stable attribute names', () => {
    const attributes = capabilityDenialAttributes(
      capabilityDenialTelemetry('requires_seat', {
        capabilityId: CAPABILITY,
        policySource: 'tier:team',
        requiredPlan: 'team',
        requiredPermission: 'billing.read',
      }),
    );

    expect(attributes).toEqual({
      'agi.denial.reason': 'requires_seat',
      'agi.denial.decided_by': 'entitlement',
      'agi.denial.error_code': 'SEAT_REQUIRED',
      'agi.denial.capability_id': CAPABILITY,
      'agi.denial.policy_source': 'tier:team',
      'agi.denial.required_plan': 'team',
      'agi.denial.required_permission': 'billing.read',
    });
  });

  it('omits an absent dimension rather than emitting an empty one', () => {
    const attributes = capabilityDenialAttributes(capabilityDenialTelemetry('offline'));

    expect(Object.keys(attributes).sort()).toEqual([
      'agi.denial.decided_by',
      'agi.denial.error_code',
      'agi.denial.reason',
    ]);
  });

  it('never carries the sentence a reader sees', () => {
    for (const reason of CAPABILITY_DENIAL_REASONS) {
      const values = Object.values(capabilityDenialAttributes(capabilityDenialTelemetry(reason)));
      expect(values).not.toContain(CAPABILITY_DENIAL_TAXONOMY[reason].message);
    }
  });

  it('gives every attribute name one distinct key', () => {
    const names = Object.values(CAPABILITY_DENIAL_ATTRIBUTE);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.startsWith('agi.denial.')).toBe(true);
  });
});
