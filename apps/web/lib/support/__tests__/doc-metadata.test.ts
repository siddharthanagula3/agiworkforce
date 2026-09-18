import { describe, expect, it } from 'vitest';

import { getSupportCorpus } from '@/lib/support/agent/corpus';
import {
  ALL_DOC_PLANS,
  ALL_DOC_PLATFORMS,
  DOC_AUDIENCES,
  DOC_MATURITIES,
  RELEASED_DOC_PLATFORMS,
  SUPPORT_DOC_METADATA,
  describePlans,
  describePlatforms,
  describeSegments,
  docMetadataFor,
  segmentsForPlans,
} from '@/lib/support/doc-metadata';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function markdownDocIds(): string[] {
  const corpus = getSupportCorpus();
  if (!corpus.available) throw new Error('corpus unavailable');
  const ids = new Set<string>();
  for (const chunk of corpus.chunks) {
    if (chunk.origin === 'markdown') ids.add(chunk.docId);
  }
  return [...ids].sort();
}

describe('support doc metadata', () => {
  it('records applicability for every help-centre document', () => {
    for (const docId of markdownDocIds()) {
      expect(docMetadataFor(docId), `no metadata for ${docId}`).not.toBeNull();
    }
  });

  it('records no applicability for a document that does not exist', () => {
    const ids = new Set(markdownDocIds());
    for (const docId of Object.keys(SUPPORT_DOC_METADATA)) {
      expect(ids.has(docId), `${docId} is not a corpus document`).toBe(true);
    }
  });

  it('keeps every declared value inside the taxonomy', () => {
    for (const [docId, metadata] of Object.entries(SUPPORT_DOC_METADATA)) {
      expect(DOC_MATURITIES, docId).toContain(metadata.maturity);
      expect(DOC_AUDIENCES, docId).toContain(metadata.audience);
      expect(metadata.applicability.platforms.length, docId).toBeGreaterThan(0);
      expect(metadata.applicability.plans.length, docId).toBeGreaterThan(0);
      for (const platform of metadata.applicability.platforms) {
        expect(ALL_DOC_PLATFORMS, docId).toContain(platform);
      }
      for (const plan of metadata.applicability.plans) {
        expect(ALL_DOC_PLANS, docId).toContain(plan);
      }
    }
  });

  it('never calls a document GA when every surface it covers is unreleased', () => {
    for (const [docId, metadata] of Object.entries(SUPPORT_DOC_METADATA)) {
      const released = metadata.applicability.platforms.some((platform) =>
        RELEASED_DOC_PLATFORMS.includes(platform),
      );
      if (!released) expect(metadata.maturity, docId).not.toBe('ga');
    }
  });

  it('carries an update date on every document', () => {
    const corpus = getSupportCorpus();
    if (!corpus.available) throw new Error('corpus unavailable');
    for (const chunk of corpus.chunks) {
      expect(chunk.updated, chunk.docId).toMatch(ISO_DATE);
    }
  });

  it('derives the commercial segment from the plans a document applies to', () => {
    expect(segmentsForPlans(ALL_DOC_PLANS)).toEqual(['consumer', 'business', 'enterprise']);
    expect(segmentsForPlans(['enterprise'])).toEqual(['enterprise']);
    expect(segmentsForPlans(['team'])).toEqual(['business']);
    expect(segmentsForPlans(['pro'])).toEqual(['consumer']);
  });

  it('describes applicability in words a reader can act on', () => {
    expect(describePlatforms(ALL_DOC_PLATFORMS)).toBe('Every surface');
    expect(describePlatforms(['web', 'cli'])).toBe('Web, CLI');
    expect(describePlans(ALL_DOC_PLANS)).toBe('Every plan');
    expect(describePlans(['enterprise'])).toBe('Enterprise');
    expect(describeSegments(['team', 'enterprise'])).toBe('Business, Enterprise');
  });
});
