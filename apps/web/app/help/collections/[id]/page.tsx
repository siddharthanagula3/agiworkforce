import { PageLink } from '@shared/components/layout/EmbeddedPage';
import { notFound } from 'next/navigation';

import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Breadcrumb,
  Container,
  Ledger,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/Shared';
import { supportCollectionIndex } from '../../collections';
import {
  HELP_UNAVAILABLE_ON_PHONE_BODY,
  HELP_UNAVAILABLE_ON_PHONE_LINK,
  HELP_UNAVAILABLE_ON_PHONE_TITLE,
} from '../../HelpUnavailableOnPhone';
import { openedFromPhone, type HelpSearchParams } from '../../phone-request';

type CollectionProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<HelpSearchParams>;
};

function findCollection(id: string, fromPhone: boolean) {
  const find = (view: 'web' | 'phone') =>
    supportCollectionIndex(view).collections.find((entry) => entry.id === id);
  const collection = find(fromPhone ? 'phone' : 'web');
  if (collection) return { collection, unavailableOnPhone: false };
  return { collection: null, unavailableOnPhone: fromPhone && find('web') !== undefined };
}

export const dynamicParams = false;

export function generateStaticParams() {
  return supportCollectionIndex().collections.map((collection) => ({ id: collection.id }));
}

export async function generateMetadata({ params, searchParams }: CollectionProps) {
  const { id } = await params;
  const { collection, unavailableOnPhone } = findCollection(
    id,
    await openedFromPhone(searchParams),
  );
  if (unavailableOnPhone) {
    return buildMetadata({
      title: `${HELP_UNAVAILABLE_ON_PHONE_TITLE} | Help`,
      description: HELP_UNAVAILABLE_ON_PHONE_BODY,
      path: `/help/collections/${id}`,
      robots: { index: false },
    });
  }
  if (!collection) notFound();
  return buildMetadata({
    title: `${collection.label} | Help`,
    description: `Every help article in the ${collection.label} collection.`,
    path: `/help/collections/${collection.id}`,
  });
}

export default async function HelpCollectionPage({ params, searchParams }: CollectionProps) {
  const { id } = await params;
  const { collection, unavailableOnPhone } = findCollection(
    id,
    await openedFromPhone(searchParams),
  );
  if (unavailableOnPhone) {
    return (
      <div data-design="agi" className="agi-ds-page">
        <Header />
        <main id="main-content">
          <PageHero
            id="agi-help-collection-title"
            eyebrow="Help"
            title={HELP_UNAVAILABLE_ON_PHONE_TITLE}
            lede={HELP_UNAVAILABLE_ON_PHONE_BODY}
            ctas={[]}
          />
          <Section id="articles" labelledBy="agi-help-collection-title" rule>
            <PageLink href="/help" className="agi-ds-link">
              {HELP_UNAVAILABLE_ON_PHONE_LINK}
            </PageLink>
          </Section>
        </main>
        <MarketingFooter />
      </div>
    );
  }
  if (!collection) notFound();
  const count = collection.articles.length;

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <Container>
          <Breadcrumb
            items={[
              { label: 'Help', href: '/help' },
              { label: 'All collections', href: '/help#collections' },
              { label: collection.label },
            ]}
          />
        </Container>
        <PageHero
          id="agi-help-collection-title"
          eyebrow="Help"
          title={collection.label}
          lede={`${count} ${count === 1 ? 'article' : 'articles'}`}
          ctas={[]}
        />
        <Section id="articles" labelledBy="agi-help-collection-title" rule>
          <Stack gap="loose">
            <Ledger
              caption={`${collection.label} articles`}
              rows={collection.articles.map((article) => ({
                label: (
                  <PageLink href={article.href} className="agi-ds-link">
                    {article.title}
                  </PageLink>
                ),
                value: null,
              }))}
            />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
