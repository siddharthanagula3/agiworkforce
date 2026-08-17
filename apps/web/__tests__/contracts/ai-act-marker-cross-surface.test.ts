import { describe, expect, it } from 'vitest';
import {
  buildProvenanceClaim,
  serialiseClaim,
  wrapTextExportWithMarker,
} from '../../../../packages/contracts/compliance/src/article50-marker';
import {
  buildAiGeneratedProvenance,
  hasAiGeneratedProvenance,
  serialiseProvenance,
} from '@/lib/compliance/ai-act';

const FIXTURE_MODEL_ID = 'fixture-cross-surface-model';
const GENERATED_AT = '2026-05-17T00:00:00.000Z';

function claimFromSidecar(payload: string): unknown {
  const sidecar = payload.match(/<!-- agi:ai-generated:c2pa-claim (.*?) -->/)?.[1];
  if (!sidecar) throw new Error('no c2pa sidecar in payload');
  return JSON.parse(sidecar);
}

describe('EU AI Act Article 50 marker — cross-surface contract', () => {
  it('accepts the sidecar a mobile transcript export actually emits', () => {
    const exported = wrapTextExportWithMarker({
      text: '[2026-05-17 00:00] AGI: hello',
      provider: 'anthropic',
      model: FIXTURE_MODEL_ID,
      generatedAt: GENERATED_AT,
    });

    expect(hasAiGeneratedProvenance(claimFromSidecar(exported))).toBe(true);
  });

  it('accepts a shared-package claim routed through the web provenance header', () => {
    const claim = buildProvenanceClaim({
      kind: 'image',
      provider: 'google',
      model: FIXTURE_MODEL_ID,
      generatedAt: GENERATED_AT,
      contentHashSha256: 'a'.repeat(64),
    });

    expect(hasAiGeneratedProvenance(JSON.parse(serialiseClaim(claim)))).toBe(true);
  });

  it('serialises byte-identically on both surfaces for the same claim', () => {
    const shared = buildProvenanceClaim({
      kind: 'image',
      provider: 'google',
      model: FIXTURE_MODEL_ID,
      generatedAt: GENERATED_AT,
      contentHashSha256: 'b'.repeat(64),
    });
    const web = buildAiGeneratedProvenance({
      kind: 'image',
      provider: 'google',
      model: FIXTURE_MODEL_ID,
      generatedAt: GENERATED_AT,
      contentHashSha256: 'b'.repeat(64),
    });

    expect(serialiseClaim(shared)).toBe(serialiseProvenance(web));
  });

  it('rejects a claim whose assertions lost their nested keys', () => {
    const stripped = {
      ...buildProvenanceClaim({
        kind: 'image',
        provider: 'google',
        model: FIXTURE_MODEL_ID,
        generatedAt: GENERATED_AT,
      }),
      assertions: [{}],
    };

    expect(hasAiGeneratedProvenance(stripped)).toBe(false);
  });
});
