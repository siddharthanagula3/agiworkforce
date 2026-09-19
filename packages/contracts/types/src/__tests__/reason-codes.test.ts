import { describe, expect, it } from 'vitest';

import {
  buildEffectiveCapabilityDocument,
  evaluateCapabilityAdmission,
  resolveCapabilityDecision,
  type CapabilityLayerGrant,
} from '../capability-handshake';
import { CAPABILITY_LAYER_DENIAL_REASONS } from '../capability-handshake/types';
import {
  CAPABILITY_DENIAL_REASONS,
  CAPABILITY_DENIAL_TAXONOMY,
  DENIAL_DECIDERS,
  capabilityDenialErrorCode,
  capabilityDenialHttpStatus,
  describeCapabilityDenial,
  isCapabilityDenialReason,
} from '../reason-codes';
import { DENIAL_ERROR_CODE_TO_HTTP_STATUS, ErrorCode, errorCodeHttpStatus } from '../errors';

const layer = (
  name: CapabilityLayerGrant['layer'],
  granted: CapabilityLayerGrant['granted'],
  extra: Partial<CapabilityLayerGrant> = {},
): CapabilityLayerGrant => ({ layer: name, sourceId: `${name}:test`, granted, ...extra });

const ALL = new Set(['canUseWebSearch', 'canUseDeepResearch'] as const);

function document(overrides: Partial<Record<CapabilityLayerGrant['layer'], CapabilityLayerGrant>>) {
  return buildEffectiveCapabilityDocument({
    sessionId: 'session',
    version: 'v1',
    computedAt: '2026-09-18T00:00:00.000Z',
    layers: {
      model: overrides.model ?? layer('model', ALL),
      tier: overrides.tier ?? layer('tier', ALL),
      surface: overrides.surface ?? layer('surface', ALL),
      settings: overrides.settings ?? layer('settings', ALL),
    },
  });
}

describe('capability denial taxonomy', () => {
  it('gives every reason a distinct error code', () => {
    const codes = CAPABILITY_DENIAL_REASONS.map(capabilityDenialErrorCode);
    expect(new Set(codes).size).toBe(CAPABILITY_DENIAL_REASONS.length);
  });

  it('gives every reason distinct user-facing copy and a resolvable http status', () => {
    const messages = new Set<string>();
    for (const reason of CAPABILITY_DENIAL_REASONS) {
      const copy = describeCapabilityDenial(reason);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.suggestion.length).toBeGreaterThan(0);
      expect(copy.message).not.toContain(reason);
      messages.add(copy.message);
      expect(capabilityDenialHttpStatus(reason)).toBeGreaterThanOrEqual(400);
    }
    expect(messages.size).toBe(CAPABILITY_DENIAL_REASONS.length);
  });

  it('keeps the four concepts on separate codes', () => {
    const byDecider = new Map<string, string>();
    for (const reason of ['requires_upgrade', 'policy_blocked', 'requires_permission'] as const) {
      const entry = CAPABILITY_DENIAL_TAXONOMY[reason];
      expect(entry.errorCode).not.toBe(ErrorCode.FORBIDDEN);
      expect(entry.errorCode).not.toBe(ErrorCode.CAPABILITY_UNAVAILABLE);
      byDecider.set(entry.decidedBy, entry.errorCode);
    }
    expect(byDecider.size).toBe(3);
    expect(new Set(byDecider.values()).size).toBe(3);
  });

  it('declares every decider it uses, and uses every decider it declares', () => {
    const used = new Set(
      CAPABILITY_DENIAL_REASONS.map((reason) => CAPABILITY_DENIAL_TAXONOMY[reason].decidedBy),
    );
    expect([...used].sort()).toEqual([...DENIAL_DECIDERS].sort());
  });

  it('maps each denial error code to an http status through one accessor', () => {
    for (const [code, status] of Object.entries(DENIAL_ERROR_CODE_TO_HTTP_STATUS)) {
      expect(errorCodeHttpStatus(code as never)).toBe(status);
    }
    expect(errorCodeHttpStatus(ErrorCode.NOT_FOUND)).toBe(404);
  });

  it('falls back to English when a locale bundle has no entry', () => {
    const translated = describeCapabilityDenial('requires_seat', (key) =>
      key.endsWith('.title') ? 'Il te faut un siege' : undefined,
    );
    expect(translated.title).toBe('Il te faut un siege');
    expect(translated.message).toBe(CAPABILITY_DENIAL_TAXONOMY.requires_seat.message);
  });

  it('recognises its own reasons and nothing else', () => {
    expect(isCapabilityDenialReason('policy_blocked')).toBe(true);
    expect(isCapabilityDenialReason('forbidden')).toBe(false);
  });
});

describe('the handshake decides with these reasons', () => {
  it('names the layer that denied through its reason, not a generic refusal', () => {
    const tierDenied = document({ tier: layer('tier', new Set(['canUseWebSearch'])) });
    const decision = resolveCapabilityDecision(tierDenied, 'canUseDeepResearch');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe(CAPABILITY_LAYER_DENIAL_REASONS.tier);
    expect(decision.decidedBy).toBe('entitlement');
    expect(decision.policySource).toBe('tier:test');
  });

  it('lets a layer override the reason its position implies', () => {
    const seatDenied = document({
      tier: layer('tier', new Set(['canUseWebSearch']), { denialReason: 'requires_seat' }),
    });
    expect(resolveCapabilityDecision(seatDenied, 'canUseDeepResearch').reason).toBe(
      'requires_seat',
    );
  });

  it('carries the reason and the remedy into the admission rejection', () => {
    const settingsDenied = document({
      settings: layer('settings', new Set(['canUseWebSearch'])),
    });
    const result = evaluateCapabilityAdmission(settingsDenied, [
      {
        capabilityId: 'canUseDeepResearch',
        strength: 'mandatory',
        remedy: { requiredPlan: 'max', requiredPermission: 'admin.policy.manage' },
      },
    ]);

    expect(result.admitted).toBe(false);
    if (result.admitted) return;
    expect(result.rejected[0]).toMatchObject({
      capabilityId: 'canUseDeepResearch',
      reasonCode: 'disabled_by_user',
      decidedBy: 'capability',
      requiredPlan: 'max',
      requiredPermission: 'admin.policy.manage',
    });
  });

  it('leaves a granted capability with no reason at all', () => {
    const decision = resolveCapabilityDecision(document({}), 'canUseWebSearch');
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBeNull();
    expect(decision.decidedBy).toBeNull();
  });
});
