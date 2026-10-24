import Link from 'next/link';
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

type CollectionProps = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return supportCollectionIndex().collections.map((collection) => ({ id: collection.id }));
}

export async function generateMetadata({ params }: CollectionProps) {
  const { id } = await params;
  const collection = supportCollectionIndex().collections.find((entry) => entry.id === id);
  if (!collection) notFound();
  return buildMetadata({
    title: `${collection.label} | Help`,
    description: `Every help article in the ${collection.label} collection.`,
    path: `/help/collections/${collection.id}`,
  });
}

export default async function HelpCollectionPage({ params }: CollectionProps) {
  const { id } = await params;
  const collection = supportCollectionIndex().collections.find((entry) => entry.id === id);
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
                  <Link href={article.href} className="agi-ds-link">
                    {article.title}
                  </Link>
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
