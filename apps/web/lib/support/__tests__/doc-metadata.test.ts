import {
  canUseBillingPlanCapability,
  connectorsReleased,
  getTierPolicy,
} from '@agiworkforce/types';
import { describe, expect, it } from 'vitest';

import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import { getSupportCorpus } from '@/lib/support/agent/corpus';
import {
  ALL_DOC_PLANS,
  ALL_DOC_PLATFORMS,
  CLOUD_DOC_PLANS,
  DOC_AUDIENCES,
  DOC_MATURITIES,
  DOC_MATURITY_LABELS,
  MANAGED_CLOUD_MATURITY,
  MANAGED_CLOUD_ONLY_PLATFORMS,
  RELEASED_DOC_PLATFORMS,
  SUPPORT_DOC_METADATA,
  describePlans,
  describePlatforms,
  describeReleaseState,
  describeSegments,
  docMetadataFor,
  hasReleasedPlatform,
  publishedMaturity,
  segmentsForPlans,
} from '@/lib/support/doc-metadata';
import { COMING_SOON_LABEL } from '@/lib/surface-status';

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

  it('labels a document with the registry status when no surface it covers is released', () => {
    let unreleasedOnly = 0;
    for (const [docId, metadata] of Object.entries(SUPPORT_DOC_METADATA)) {
      if (metadata.featureReleased === false) {
        expect(describeReleaseState(metadata), docId).toBe(COMING_SOON_LABEL);
      } else if (hasReleasedPlatform(metadata.applicability.platforms)) {
        expect(describeReleaseState(metadata), docId).toBe(
          DOC_MATURITY_LABELS[
            publishedMaturity(metadata.maturity, metadata.applicability.platforms)
          ],
        );
      } else {
        unreleasedOnly += 1;
        expect(describeReleaseState(metadata), docId).toBe(COMING_SOON_LABEL);
      }
    }
    expect(unreleasedOnly).toBe(
      Object.values(SUPPORT_DOC_METADATA).filter((metadata) =>
        metadata.applicability.platforms.every(
          (platform) => !RELEASED_DOC_PLATFORMS.includes(platform),
        ),
      ).length,
    );
  });

  it('never labels a managed cloud document as more mature than managed cloud itself', () => {
    expect(MANAGED_CLOUD_STATUS).toBe(`public ${MANAGED_CLOUD_MATURITY}`);
    expect(
      RELEASED_DOC_PLATFORMS.every((platform) => MANAGED_CLOUD_ONLY_PLATFORMS.includes(platform)),
    ).toBe(true);

    const ceiling = DOC_MATURITIES.indexOf(MANAGED_CLOUD_MATURITY);
    let checked = 0;
    for (const [docId, metadata] of Object.entries(SUPPORT_DOC_METADATA)) {
      const { platforms } = metadata.applicability;
      if (!hasReleasedPlatform(platforms)) continue;
      checked += 1;
      expect(
        DOC_MATURITIES.indexOf(publishedMaturity(metadata.maturity, platforms)),
        docId,
      ).toBeGreaterThanOrEqual(ceiling);
      if (MANAGED_CLOUD_MATURITY !== 'ga') {
        expect(describeReleaseState(metadata), docId).not.toBe(DOC_MATURITY_LABELS.ga);
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(publishedMaturity('ga', ['cli'])).toBe('ga');
    expect(publishedMaturity('alpha', ['web'])).toBe('alpha');
  });

  it('labels the connector articles with the connector release state', () => {
    for (const docId of ['connectors-and-mcp', 'mcp-connections']) {
      const metadata = docMetadataFor(docId);
      expect(metadata?.featureReleased, docId).toBe(connectorsReleased());
      if (!metadata) continue;
      expect(describeReleaseState(metadata) === COMING_SOON_LABEL, docId).toBe(
        !connectorsReleased(),
      );
    }
  });

  it('lists AGI Work on exactly the plans the catalogue gives it', () => {
    const plans = docMetadataFor('agi-work')?.applicability.plans ?? [];
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of ALL_DOC_PLANS) {
      expect(plans.includes(plan), plan).toBe(canUseBillingPlanCapability(plan, 'agi_work'));
    }
    expect(describePlans(plans)).not.toBe('Every paid plan');
  });

  it('lists voice on every managed cloud plan whose policy allows it', () => {
    const plans = docMetadataFor('voice')?.applicability.plans ?? [];
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of CLOUD_DOC_PLANS) {
      expect(plans.includes(plan), plan).toBe(getTierPolicy(plan).allowVoice === true);
    }
    expect(getTierPolicy('free').allowVoice).toBe(true);
    expect(plans).toContain('free');
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
