import { describe, expect, it } from 'vitest';

import { STATIC_ARTICLES, STATIC_FAQS } from '@/lib/support/static-data';
import {
  ALL_DOC_PLANS,
  ALL_DOC_PLATFORMS,
  DOC_AUDIENCES,
  DOC_MATURITIES,
  segmentsForPlans,
} from '@/lib/support/doc-metadata';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('static support data', () => {
  it('dates every FAQ and every article', () => {
    for (const faq of STATIC_FAQS) expect(faq.updated, faq.id).toMatch(ISO_DATE);
    for (const article of STATIC_ARTICLES) expect(article.updated, article.id).toMatch(ISO_DATE);
  });

  it('tags every entry with maturity, audience and applicability', () => {
    for (const entry of [...STATIC_FAQS, ...STATIC_ARTICLES]) {
      expect(DOC_MATURITIES, entry.id).toContain(entry.maturity);
      expect(DOC_AUDIENCES, entry.id).toContain(entry.audience);
      expect(entry.applicability.platforms.length, entry.id).toBeGreaterThan(0);
      expect(entry.applicability.plans.length, entry.id).toBeGreaterThan(0);
      for (const platform of entry.applicability.platforms) {
        expect(ALL_DOC_PLATFORMS, entry.id).toContain(platform);
      }
      for (const plan of entry.applicability.plans) {
        expect(ALL_DOC_PLANS, entry.id).toContain(plan);
      }
      expect(segmentsForPlans(entry.applicability.plans).length, entry.id).toBeGreaterThan(0);
    }
  });

  it('keeps FAQ ordering stable and unique', () => {
    const orders = STATIC_FAQS.map((faq) => faq.display_order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
