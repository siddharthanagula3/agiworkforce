import { describe, expect, it } from 'vitest';
import { buildAiActProvenanceClaim, type SyntheticContentKind } from '@agiworkforce/types';
import {
  ARTICLE_50_1_WEB_CARVE_OUT,
  ARTICLE_50_2_WEB_SCOPE,
  buildAiGeneratedProvenance,
} from '@/lib/compliance/ai-act';

const ALL_SYNTHETIC_KINDS: readonly SyntheticContentKind[] = ['text', 'audio', 'image', 'video'];

describe('EU AI Act Article 50, declared web scope', () => {
  it('classifies every synthetic kind the shared contract knows about', () => {
    for (const kind of ALL_SYNTHETIC_KINDS) {
      const entry = ARTICLE_50_2_WEB_SCOPE[kind];
      expect(entry, `kind '${kind}' is neither marked nor recorded as a gap`).toBeDefined();
      expect(entry.basis.length).toBeGreaterThan(0);
    }
    expect(Object.keys(ARTICLE_50_2_WEB_SCOPE).sort()).toEqual([...ALL_SYNTHETIC_KINDS].sort());
  });

  it('states a reason for every kind it leaves unmarked', () => {
    for (const kind of ALL_SYNTHETIC_KINDS) {
      const entry = ARTICLE_50_2_WEB_SCOPE[kind];
      if (entry.marked) continue;
      expect(entry.basis, `unmarked kind '${kind}' must say why`).toMatch(/OPEN GAP|scoped out/i);
    }
  });

  it('only claims a kind is marked when this module can actually build its claim', () => {
    for (const kind of ALL_SYNTHETIC_KINDS) {
      if (!ARTICLE_50_2_WEB_SCOPE[kind].marked) continue;
      const claim = buildAiGeneratedProvenance({
        kind: kind as 'image' | 'video',
        provider: 'fixture-provider',
        model: 'fixture-scope-model',
      });
      expect(claim.kind).toBe(kind);
      expect(claim.assertions.length).toBeGreaterThan(0);
      expect(claim).toEqual(
        buildAiActProvenanceClaim({
          kind,
          provider: 'fixture-provider',
          model: 'fixture-scope-model',
          generatedAt: claim.generated_at,
        }),
      );
    }
  });

  it('keeps the 50(1) carve-out recorded as an unreviewed legal position', () => {
    expect(ARTICLE_50_1_WEB_CARVE_OUT.reliedOn).toBe(true);
    expect(ARTICLE_50_1_WEB_CARVE_OUT.basis).toMatch(/Article 50\(1\)/);
    expect(
      ARTICLE_50_1_WEB_CARVE_OUT.counselReviewed,
      'flip this only when counsel has signed off; the sign-off is the gate, not this flag',
    ).toBe(false);
  });
});
