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
  CAPABILITY_DOCUMENT_VERSION_UNRESOLVED,
  computeCapabilityDocumentVersion,
  evaluateCapabilityAdmission,
  isCapabilityDocumentStale,
  type CapabilityLayerGrant,
  type EffectiveCapabilityDocument,
  type PlatformCapability,
} from '../capability-handshake';

const COMPUTED_AT = '2026-07-15T00:00:00.000Z';
const FIXTURE_MODEL_SOURCE = 'model:fixture-capability-model';
const FIXTURE_ALTERNATE_MODEL_SOURCE = 'model:fixture-alternate-model';

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
        model: grant('model', FIXTURE_MODEL_SOURCE, ['canUseWebSearch', 'canRunLocalCode']),
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
      model: FIXTURE_MODEL_SOURCE,
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
        model: grant('model', FIXTURE_ALTERNATE_MODEL_SOURCE, ['canUseWebSearch']),
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
        model: grant('model', FIXTURE_MODEL_SOURCE, ['canRunLocalCode']),
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
        model: grant('model', FIXTURE_MODEL_SOURCE, ['canUseWebSearch']),
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
        model: grant('model', FIXTURE_MODEL_SOURCE, ids),
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
        model: grant('model', FIXTURE_MODEL_SOURCE, ['canUseWebSearch']),
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

describe('capability-document versioning (W5 tail — real versions, not placeholders)', () => {
  const baseLayers = () => ({
    model: grant('model', 'models.json@9.1.0', ['canUseWebSearch', 'canUseVoice']),
    tier: grant('tier', 'tier:pro', ['canUseWebSearch', 'canUseVoice']),
    surface: grant('surface', 'surface:web', ['canUseWebSearch', 'canUseVoice']),
    settings: grant('settings', 'settings:none-configured', ['canUseWebSearch', 'canUseVoice']),
  });

  it('is deterministic: identical inputs produce the identical version', () => {
    const a = computeCapabilityDocumentVersion({ schemaVersion: 'v1', layers: baseLayers() });
    const b = computeCapabilityDocumentVersion({ schemaVersion: 'v1', layers: baseLayers() });
    expect(a).toBe(b);
  });

  it('is grant-order independent (a Set built in a different order hashes the same)', () => {
    const reordered = {
      ...baseLayers(),
      tier: grant('tier', 'tier:pro', ['canUseVoice', 'canUseWebSearch']),
    };
    expect(computeCapabilityDocumentVersion({ schemaVersion: 'v1', layers: reordered })).toBe(
      computeCapabilityDocumentVersion({ schemaVersion: 'v1', layers: baseLayers() }),
    );
  });

  it('carries the schema tag as a readable prefix', () => {
    const version = computeCapabilityDocumentVersion({
      schemaVersion: 'me-handshake-v1',
      layers: baseLayers(),
    });
    expect(version.startsWith('me-handshake-v1#')).toBe(true);
  });

  it('bumps on ANY input-layer change: a grant-set change, a sourceId change, or a schema change', () => {
    const base = computeCapabilityDocumentVersion({ schemaVersion: 'v1', layers: baseLayers() });

    const grantChanged = {
      ...baseLayers(),
      tier: grant('tier', 'tier:pro', ['canUseWebSearch']), // voice revoked
    };
    expect(
      computeCapabilityDocumentVersion({ schemaVersion: 'v1', layers: grantChanged }),
    ).not.toBe(base);

    const sourceChanged = {
      ...baseLayers(),
      model: grant('model', 'models.json@9.2.0', ['canUseWebSearch', 'canUseVoice']),
    };
    expect(
      computeCapabilityDocumentVersion({ schemaVersion: 'v1', layers: sourceChanged }),
    ).not.toBe(base);

    expect(
      computeCapabilityDocumentVersion({ schemaVersion: 'v2', layers: baseLayers() }),
    ).not.toBe(base);
  });

  it('detects staleness: same version fresh, different version stale', () => {
    const current = computeCapabilityDocumentVersion({ schemaVersion: 'v1', layers: baseLayers() });
    const next = computeCapabilityDocumentVersion({
      schemaVersion: 'v1',
      layers: { ...baseLayers(), tier: grant('tier', 'tier:max', ['canUseWebSearch']) },
    });

    expect(isCapabilityDocumentStale({ version: current }, current)).toBe(false);
    expect(isCapabilityDocumentStale({ version: current }, next)).toBe(true);
  });

  it('treats the unresolved placeholder as ALWAYS stale (never silently reused)', () => {
    expect(
      isCapabilityDocumentStale(
        { version: CAPABILITY_DOCUMENT_VERSION_UNRESOLVED },
        CAPABILITY_DOCUMENT_VERSION_UNRESOLVED,
      ),
    ).toBe(true);
    expect(
      isCapabilityDocumentStale({ version: CAPABILITY_DOCUMENT_VERSION_UNRESOLVED }, 'v1#0'),
    ).toBe(true);
  });
});
