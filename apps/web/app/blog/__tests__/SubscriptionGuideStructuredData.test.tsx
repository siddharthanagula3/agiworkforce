import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@shared/components/seo/JsonLd', () => ({
  JsonLd: ({ data }: { data: Record<string, unknown>[] }) =>
    data.map((block, index) => (
      <script key={index} type="application/ld+json">
        {JSON.stringify(block)}
      </script>
    )),
}));

import { SUBSCRIPTION_GUIDE } from '@/lib/blog-posts';

import SubscriptionGuideLayout from '../multi-model-ai-vs-separate-subscriptions/layout';

describe('subscription guide structured data', () => {
  it('emits one Article and one BreadcrumbList ending at the guide, around the page', () => {
    const { container } = render(
      <SubscriptionGuideLayout>
        <h1>{SUBSCRIPTION_GUIDE.title}</h1>
      </SubscriptionGuideLayout>,
    );
    const blocks = Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(
      (script) => JSON.parse(script.textContent ?? '{}') as Record<string, unknown>,
    );

    expect(blocks.map((block) => block['@type'])).toEqual(['Article', 'BreadcrumbList']);
    expect(blocks[0]).toMatchObject({ headline: SUBSCRIPTION_GUIDE.title });
    const items = blocks[1]?.['itemListElement'] as { item: string; name: string }[];
    expect(items.at(-1)?.name).toBe(SUBSCRIPTION_GUIDE.title);
    expect(items.at(-1)?.item).toMatch(new RegExp(`${SUBSCRIPTION_GUIDE.path}$`));
    expect(container.querySelector('h1')?.textContent).toBe(SUBSCRIPTION_GUIDE.title);
  });
});
