import Link from 'next/link';
import { redirect } from 'next/navigation';

import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { HelpSearch } from '@/features/support/components/HelpSearch';
import { CONTACT_EMAIL, contactMailto } from '@/lib/legal-constants';
import { BYOK_SURFACES } from '@/lib/marketing-constants';
import { readTopicParam, resolveDocTopic } from '@/lib/support/doc-topics';
import { supportCollectionIndex } from './collections';

export const metadata = buildMetadata({
  title: 'Help: every collection in the help centre',
  description: 'Search the help centre, or browse every collection we have written.',
  path: '/help',
});

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; topic?: string | string[] }>;
}) {
  const { q, topic: topicParam } = await searchParams;
  const topic = readTopicParam(topicParam);
  const topicPath = topic ? resolveDocTopic(topic) : null;
  if (topicPath) redirect(topicPath);
  const initialQuery =
    (Array.isArray(q) ? q[0] : q)?.slice(0, 200) ?? topic?.replace(/-/g, ' ') ?? '';
  const { collections, articleCount } = supportCollectionIndex();

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-help-title"
          eyebrow="Help"
          title="Get unstuck, fast."
          em="fast."
          lede={`Search every help article, or browse the help centre by collection. For anything else, email ${CONTACT_EMAIL}; no response time is promised unless your plan says otherwise.`}
          ctas={[]}
        >
          <HelpSearch initialQuery={initialQuery} />
        </PageHero>

        <Section id="collections" labelledBy="agi-help-collections-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-help-collections-title">
              Browse every collection.
            </h2>
            <Prose>
              {`${articleCount} articles across ${collections.length} collections, grouped the way the product is. Where a surface differs, the collection says so: bring your own provider keys on ${BYOK_SURFACES.label}. ${BYOK_SURFACES.availability} ${BYOK_SURFACES.exclusion}`}
            </Prose>
            {collections.length > 0 ? (
              <Ledger
                caption="Help collections"
                rows={collections.map((collection) => ({
                  label: (
                    <Link href={`/help/collections/${collection.id}`} className="agi-ds-link">
                      {collection.label}
                    </Link>
                  ),
                  value: (
                    <ul className="agi-ds-linkgrid">
                      {collection.articles.map((article) => (
                        <li key={article.docId}>
                          <Link href={article.href} className="agi-ds-link">
                            {article.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ),
                }))}
              />
            ) : (
              <Prose>
                The collection index is not loading right now. Email {CONTACT_EMAIL} for support.
              </Prose>
            )}
          </Stack>
        </Section>

        <Section id="more" labelledBy="agi-help-more-title" rule ground="2">
          <Stack>
            <h2 className="agi-ds-h2" id="agi-help-more-title">
              Still stuck? Contact support.
            </h2>
            <Prose>
              The FAQ covers the questions that come up most, and support explains what each tier
              can expect. Email lands in the same inbox either way.
            </Prose>
            <ButtonRow>
              <Button href="/faq">Read the FAQ</Button>
              <Button href="/support" variant="secondary">
                Get support
              </Button>
              <Button href={contactMailto()} variant="secondary">
                Email us
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
