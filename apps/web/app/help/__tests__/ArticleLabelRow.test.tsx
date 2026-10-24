import { render } from '@testing-library/react';
import {
  CONNECTORS_COMING_SOON_MESSAGE,
  billingPlanCapabilityPlanLabels,
  canUseBillingPlanCapability,
  connectorsReleased,
} from '@agiworkforce/types';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/docs/components/DocsShell', () => ({
  DocsShell: ({ children }: { children: ReactNode }) => children,
}));

import { MANAGED_CLOUD_STATUS } from '@/lib/legal-constants';
import {
  ALL_DOC_PLANS,
  DOC_MATURITY_LABELS,
  MANAGED_CLOUD_MATURITY,
  planLabel,
} from '@/lib/support/doc-metadata';
import { COMING_SOON_LABEL } from '@/lib/surface-status';

import HelpArticlePage from '../[slug]/page';

const PLAN_SEPARATOR = ', ';

async function renderArticle(slug: string) {
  const { container, unmount } = render(
    await HelpArticlePage({ params: Promise.resolve({ slug }) }),
  );
  const labels = Array.from(container.querySelectorAll('.dx-meta li')).map(
    (item) => item.textContent ?? '',
  );
  const body = container.querySelector('.dx-prose')?.textContent ?? '';
  unmount();
  return { labels, body };
}

describe('help article label row', () => {
  it.each(['connectors-and-mcp', 'mcp-connections'])(
    'labels %s with the connector release state its body states',
    async (slug) => {
      const { labels, body } = await renderArticle(slug);
      const comingSoon = !connectorsReleased();

      expect(labels.length).toBeGreaterThan(0);
      expect(labels.includes(COMING_SOON_LABEL)).toBe(comingSoon);
      expect(body.includes(CONNECTORS_COMING_SOON_MESSAGE)).toBe(comingSoon);
      if (comingSoon) expect(labels).not.toContain(DOC_MATURITY_LABELS.ga);
    },
  );

  it('labels managed cloud no more mature than the status its terms give it', async () => {
    const { labels } = await renderArticle('managed-cloud');

    expect(MANAGED_CLOUD_STATUS).toBe(`public ${MANAGED_CLOUD_MATURITY}`);
    expect(labels).toContain(DOC_MATURITY_LABELS[MANAGED_CLOUD_MATURITY]);
    if (MANAGED_CLOUD_MATURITY !== 'ga') expect(labels).not.toContain(DOC_MATURITY_LABELS.ga);
  });

  it('names for AGI Work exactly the plans the catalogue and the article body give it', async () => {
    const { labels, body } = await renderArticle('agi-work');
    const eligible = ALL_DOC_PLANS.filter((plan) => canUseBillingPlanCapability(plan, 'agi_work'));
    const named = (labels.at(-1) ?? '').split(PLAN_SEPARATOR);

    expect(eligible.length).toBeGreaterThan(0);
    expect(eligible.length).toBeLessThan(ALL_DOC_PLANS.length);
    expect([...named].sort()).toEqual(eligible.map(planLabel).sort());
    expect(body).toContain(billingPlanCapabilityPlanLabels('agi_work'));
  });
});
