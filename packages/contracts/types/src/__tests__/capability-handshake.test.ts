/**
 * Capability-handshake contract tests (`../capability-handshake`).
 *
 * The load-bearing test in this file is "partial-grant denial" — a
 * capability granted by SOME but not ALL four layers must be denied, with
 * `deniedBy`/`deniedByLayers` naming exactly the layers that withheld it.
 * A registry that only ever exercised all-four-agree or zero-layers cases
 * would pass even if the intersection logic were wrong (e.g. summing instead
 * of intersecting) — see `./registry.ts` module doc "single-vocabulary
 * decision" for why cross-layer omission must mean deny, not "no opinion."
 */
import { describe, expect, it } from 'vitest';
import {
  buildEffectiveCapabilityDocument,
  evaluateCapabilityAdmission,
  type CapabilityLayerGrant,
  type EffectiveCapabilityDocument,
  type PlatformCapability,
} from '../capability-handshake';

const COMPUTED_AT = '2026-07-15T00:00:00.000Z';

function grant(
  layer: CapabilityLayerGrant['layer'],
  sourceId: string,
  granted: readonly PlatformCapability[],
): CapabilityLayerGrant {
  return { layer, sourceId, granted: new Set(granted) };
}

describe('buildEffectiveCapabilityDocument', () => {
  it('grants a capability only when all four layers agree', () => {
    const document = buildEffectiveCapabilityDocument({
      sessionId: 'sess_1',
      version: 'v1',
      computedAt: COMPUTED_AT,
      layers: {
        model: grant('model', 'model:sonnet-5', ['canUseWebSearch', 'canRunLocalCode']),
        tier: grant('tier', 'tier:pro', ['canUseWebSearch', 'canRunLocalCode']),
        surface: grant('surface', 'surface:desktop', ['canUseWebSearch', 'canRunLocalCode']),
        settings: grant('settings', 'settings:v3', ['canUseWebSearch', 'canRunLocalCode']),
      },
    });

    expect([...document.granted].sort()).toEqual(['canRunLocalCode', 'canUseWebSearch']);
    expect(document.deniedBy).toEqual({});
    expect(document.sessionId).toBe('sess_1');
    expect(document.version).toBe('v1');
    expect(document.computedAt).toBe(COMPUTED_AT);
    expect(document.sources).toEqual({
      model: 'model:sonnet-5',
      tier: 'tier:pro',
      surface: 'surface:desktop',
      settings: 'settings:v3',
    });
  });

  it('denies a capability granted by three of four layers, and names exactly the missing layer (the pinning test)', () => {
    const document = buildEffectiveCapabilityDocument({
      sessionId: 'sess_2',
      version: 'v1',
      layers: {
        model: grant('model', 'model:haiku-4-5', ['canUseWebSearch']),
        tier: grant('tier', 'tier:free', []), // free tier withholds it
        surface: grant('surface', 'surface:web', ['canUseWebSearch']),
        settings: grant('settings', 'settings:default', ['canUseWebSearch']),
      },
    });

    expect(document.granted).toEqual([]);
    expect(document.deniedBy).toEqual({ canUseWebSearch: ['tier'] });
  });

  it('denies a capability granted by only one layer, naming all three missing layers', () => {
    const document = buildEffectiveCapabilityDocument({
      sessionId: 'sess_3',
      version: 'v1',
      layers: {
        model: grant('model', 'model:sonnet-5', ['canRunLocalCode']),
        tier: grant('tier', 'tier:free', []),
        surface: grant('surface', 'surface:web', []), // web never exposes local-code execution
        settings: grant('settings', 'settings:default', []),
      },
    });

    expect(document.granted).toEqual([]);
    expect(document.deniedBy.canRunLocalCode?.slice().sort()).toEqual(
      ['settings', 'surface', 'tier'].sort(),
    );
  });

  it('never mentions a capability that no layer granted (nothing to audit, not a denial)', () => {
    const document = buildEffectiveCapabilityDocument({
      sessionId: 'sess_4',
      version: 'v1',
      layers: {
        model: grant('model', 'model:sonnet-5', ['canUseWebSearch']),
        tier: grant('tier', 'tier:pro', ['canUseWebSearch']),
        surface: grant('surface', 'surface:desktop', ['canUseWebSearch']),
        settings: grant('settings', 'settings:default', ['canUseWebSearch']),
      },
    });

    expect(document.granted).not.toContain('canUseCamera');
    expect(document.deniedBy).not.toHaveProperty('canUseCamera');
  });

  it('defaults computedAt to the current time when omitted', () => {
    const before = Date.now();
    const document = buildEffectiveCapabilityDocument({
      sessionId: 'sess_5',
      version: 'v1',
      layers: {
        model: grant('model', 'm', []),
        tier: grant('tier', 't', []),
        surface: grant('surface', 's', []),
        settings: grant('settings', 'se', []),
      },
    });
    const after = Date.now();
    const computedAtMs = new Date(document.computedAt).getTime();
    expect(computedAtMs).toBeGreaterThanOrEqual(before);
    expect(computedAtMs).toBeLessThanOrEqual(after);
  });
});

describe('evaluateCapabilityAdmission', () => {
  function documentGranting(...ids: PlatformCapability[]): EffectiveCapabilityDocument {
    return buildEffectiveCapabilityDocument({
      sessionId: 'sess_eval',
      version: 'v1',
      computedAt: COMPUTED_AT,
      layers: {
        model: grant('model', 'model:sonnet-5', ids),
        tier: grant('tier', 'tier:pro', ids),
        surface: grant('surface', 'surface:desktop', ids),
        settings: grant('settings', 'settings:default', ids),
      },
    });
  }

  it('admits when every mandatory requirement is granted', () => {
    const document = documentGranting('canUseWebSearch', 'canUseImages');
    const result = evaluateCapabilityAdmission(document, [
      { capabilityId: 'canUseWebSearch', strength: 'mandatory' },
      { capabilityId: 'canUseImages', strength: 'mandatory' },
    ]);
    expect(result.admitted).toBe(true);
    if (!result.admitted) throw new Error('expected admission');
    expect([...result.grantedRequirementIds].sort()).toEqual(['canUseImages', 'canUseWebSearch']);
  });

  it('rejects with a typed result when a mandatory requirement is missing — never silently proceeds', () => {
    const document = documentGranting('canUseImages'); // canUseWebSearch NOT granted
    const result = evaluateCapabilityAdmission(document, [
      { capabilityId: 'canUseImages', strength: 'mandatory' },
      {
        capabilityId: 'canUseWebSearch',
        strength: 'mandatory',
        reason: 'task requires live search',
      },
    ]);
    expect(result.admitted).toBe(false);
    if (result.admitted) throw new Error('expected rejection');
    expect(result.code).toBe('mandatory_capability_unavailable');
    expect(result.rejected).toEqual([
      {
        capabilityId: 'canUseWebSearch',
        reason: 'task requires live search',
        deniedByLayers: ['model', 'tier', 'surface', 'settings'],
      },
    ]);
  });

  it('names only the specific layers that withheld a partially-granted mandatory requirement', () => {
    const document = buildEffectiveCapabilityDocument({
      sessionId: 'sess_partial',
      version: 'v1',
      computedAt: COMPUTED_AT,
      layers: {
        model: grant('model', 'model:sonnet-5', ['canUseWebSearch']),
        tier: grant('tier', 'tier:free', []), // withholds
        surface: grant('surface', 'surface:web', ['canUseWebSearch']),
        settings: grant('settings', 'settings:default', ['canUseWebSearch']),
      },
    });
    const result = evaluateCapabilityAdmission(document, [
      { capabilityId: 'canUseWebSearch', strength: 'mandatory' },
    ]);
    expect(result.admitted).toBe(false);
    if (result.admitted) throw new Error('expected rejection');
    expect(result.rejected).toEqual([
      { capabilityId: 'canUseWebSearch', reason: undefined, deniedByLayers: ['tier'] },
    ]);
  });

  it('never lets an unmet OPTIONAL requirement block admission, and excludes it from grantedRequirementIds', () => {
    const document = documentGranting('canUseImages'); // canUseDeepResearch NOT granted
    const result = evaluateCapabilityAdmission(document, [
      { capabilityId: 'canUseImages', strength: 'mandatory' },
      { capabilityId: 'canUseDeepResearch', strength: 'optional' },
    ]);
    expect(result.admitted).toBe(true);
    if (!result.admitted) throw new Error('expected admission');
    expect(result.grantedRequirementIds).toEqual(['canUseImages']);
    expect(result.grantedRequirementIds).not.toContain('canUseDeepResearch');
  });

  it('a single missing mandatory requirement rejects the whole admission even when every other requirement is satisfied', () => {
    const document = documentGranting('canUseImages', 'canUseVoice', 'canUseMarketplace');
    const result = evaluateCapabilityAdmission(document, [
      { capabilityId: 'canUseImages', strength: 'mandatory' },
      { capabilityId: 'canUseVoice', strength: 'mandatory' },
      { capabilityId: 'canUseMarketplace', strength: 'mandatory' },
      { capabilityId: 'canRunLocalCode', strength: 'mandatory' }, // missing
    ]);
    expect(result.admitted).toBe(false);
    if (result.admitted) throw new Error('expected rejection');
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.capabilityId).toBe('canRunLocalCode');
  });

  it('admits with an empty requirement list', () => {
    const document = documentGranting();
    const result = evaluateCapabilityAdmission(document, []);
    expect(result.admitted).toBe(true);
    if (!result.admitted) throw new Error('expected admission');
    expect(result.grantedRequirementIds).toEqual([]);
  });
});
