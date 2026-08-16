import { describe, expect, it } from 'vitest';
import {
  buildEffectiveCapabilityDocument,
  type CapabilityLayerGrant,
  type EffectiveCapabilityDocument,
  type PlatformCapability,
} from '@agiworkforce/types';
import {
  EffectiveCapabilityDocumentSchema,
  parseEffectiveCapabilityDocument,
  type EffectiveCapabilityDocumentWire,
} from '../capability-handshake';

const FIXTURE_MODEL_SOURCE = 'model:fixture-capability-model';

function grant(
  layer: CapabilityLayerGrant['layer'],
  sourceId: string,
  granted: readonly PlatformCapability[],
): CapabilityLayerGrant {
  return { layer, sourceId, granted: new Set(granted) };
}

function sampleDocument(): EffectiveCapabilityDocument {
  return buildEffectiveCapabilityDocument({
    sessionId: 'sess_wire_sync',
    version: 'v1',
    computedAt: '2026-07-15T00:00:00.000Z',
    layers: {
      model: grant('model', FIXTURE_MODEL_SOURCE, ['canUseWebSearch', 'canUseImages']),
      tier: grant('tier', 'tier:pro', ['canUseWebSearch', 'canUseImages']),
      surface: grant('surface', 'surface:desktop', ['canUseWebSearch']), // partial on purpose
      settings: grant('settings', 'settings:default', ['canUseWebSearch', 'canUseImages']),
    },
  });
}

describe('EffectiveCapabilityDocument (types) -> EffectiveCapabilityDocumentSchema (wire)', () => {
  it('parses a real EffectiveCapabilityDocument value without throwing or dropping fields', () => {
    const document = sampleDocument();
    const parsed = EffectiveCapabilityDocumentSchema.parse(document);
    expect(parsed).toEqual(document);
  });

  it('round-trips through parseEffectiveCapabilityDocument unchanged', () => {
    const document = sampleDocument();
    expect(parseEffectiveCapabilityDocument(document)).toEqual(document);
  });

  it('carries a partially-granted capability into deniedBy on the wire exactly as computed in-process', () => {
    const document = sampleDocument();
    expect(document.deniedBy).toEqual({ canUseImages: ['surface'] });
    const parsed = EffectiveCapabilityDocumentSchema.parse(document);
    expect(parsed.deniedBy).toEqual({ canUseImages: ['surface'] });
  });

  it('is structurally assignable one-way: every field of a strict TS document satisfies the wire shape (compile-time; see module doc)', () => {
    const document = sampleDocument();
    const asWire: EffectiveCapabilityDocumentWire = {
      ...document,
      granted: [...document.granted],
      deniedBy: Object.fromEntries(
        Object.entries(document.deniedBy).map(([capabilityId, layers]) => [
          capabilityId,
          [...(layers ?? [])],
        ]),
      ),
    };
    expect(asWire.sessionId).toBe(document.sessionId);
  });
});

describe('wire schema is deliberately wider than the TS union for capability ids', () => {
  it('accepts a capability id the current PlatformCapability union does not know about (forward-compat)', () => {
    const forwardCompatPayload = {
      sessionId: 'sess_forward',
      version: 'v2',
      computedAt: '2026-08-01T00:00:00.000Z',
      sources: {
        model: 'model:future',
        tier: 'tier:pro',
        surface: 'surface:web',
        settings: 'settings:v9',
      },
      granted: ['canUseWebSearch', 'canUseSomeFutureCapability'],
      deniedBy: {},
    };
    expect(() => EffectiveCapabilityDocumentSchema.parse(forwardCompatPayload)).not.toThrow();
  });

  it('still rejects a malformed layer name inside deniedBy (the layer enum stays closed)', () => {
    const malformed = {
      sessionId: 'sess_bad_layer',
      version: 'v1',
      computedAt: '2026-07-15T00:00:00.000Z',
      sources: { model: 'm', tier: 't', surface: 's', settings: 'se' },
      granted: [],
      deniedBy: { canUseWebSearch: ['not_a_real_layer'] },
    };
    expect(() => EffectiveCapabilityDocumentSchema.parse(malformed)).toThrow();
  });

  it('rejects a payload missing a required field', () => {
    const missingVersion = {
      sessionId: 'sess_missing',
      computedAt: '2026-07-15T00:00:00.000Z',
      sources: { model: 'm', tier: 't', surface: 's', settings: 'se' },
      granted: [],
      deniedBy: {},
    };
    expect(() => EffectiveCapabilityDocumentSchema.parse(missingVersion)).toThrow();
  });
});
