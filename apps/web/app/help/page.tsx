import Link from 'next/link';

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
import { FactLine, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { HelpSearch } from '@/features/support/components/HelpSearch';
import { BYOK_SURFACES, MARKETING, SURFACE_STATUS } from '@/lib/marketing-constants';
import { supportCollectionIndex } from './collections';

const HERO_FACTS = [
  `Catalog: ${MARKETING.models.display} models, ${MARKETING.providers.display} providers`,
  `BYOK: ${BYOK_SURFACES.label}`,
  `VS Code: ${SURFACE_STATUS.vscode.toLowerCase()}`,
];

export const metadata = buildMetadata({
  title: 'Help: every collection in the help centre',
  description: 'Search the help centre, or browse every collection we have written.',
  path: '/help',
});

export default function HelpPage() {
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
          lede="Search everything we have written, or browse it by collection. For anything else, email contact@agiworkforce.com. A real human reads it."
          ctas={[]}
        />

        <FactLine facts={HERO_FACTS} />

        <Section id="search" labelledBy="agi-help-search-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-help-search-title">
              Search everything we have written.
            </h2>
            <HelpSearch />
          </Stack>
        </Section>

        <Section id="collections" labelledBy="agi-help-collections-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-help-collections-title">
              Browse every collection.
            </h2>
            <Prose>
              {`${articleCount} collections, grouped the way the product is. Where a surface differs, the collection says so: bring your own provider keys on ${BYOK_SURFACES.label}. The CLI has a published release; the VS Code extension is ${SURFACE_STATUS.vscode.toLowerCase()}. ${BYOK_SURFACES.exclusion}`}
            </Prose>
            {collections.length > 0 ? (
              <Ledger
                caption="Help collections"
                rows={collections.map((collection) => ({
                  label: collection.label,
                  value: collection.articles.map((article, index) => (
                    <span key={article.docId}>
                      {index > 0 ? ' · ' : null}
                      <Link href={article.href} className="agi-ds-link">
                        {article.title}
                      </Link>
                    </span>
                  )),
                }))}
              />
            ) : (
              <Prose>
                The collection index is not loading right now. Email contact@agiworkforce.com and a
                human will answer.
              </Prose>
            )}
          </Stack>
        </Section>

        <Section id="more" labelledBy="agi-help-more-title" rule ground="2">
          <Stack>
            <h2 className="agi-ds-h2" id="agi-help-more-title">
              Still stuck? Ask a human.
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
              <Button href="mailto:contact@agiworkforce.com" variant="secondary">
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
