import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  ProductFrame,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  USE_CASE_CONTENT,
  USE_CASE_SLUGS,
} from '@/features/marketing/components/pages/business/use-cases-content';

interface Props {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return USE_CASE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = USE_CASE_CONTENT[slug];
  if (!entry) return {};
  return buildMetadata({
    title: entry.metaTitle,
    description: entry.metaDescription,
    path: `/use-cases/${entry.slug}`,
  });
}

export default async function UseCaseDetailPage({ params }: Props) {
  const { slug } = await params;
  const entry = USE_CASE_CONTENT[slug];
  if (!entry) notFound();

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-usecase-title"
          eyebrow={entry.eyebrow}
          title={entry.title}
          lede={entry.lede}
          ctas={entry.ctas}
          visual={
            entry.visual ? (
              <ProductFrame
                light={entry.visual.light}
                dark={entry.visual.dark}
                alt={entry.visual.alt}
                width={entry.visual.width}
                height={entry.visual.height}
                caption={entry.visual.caption}
                priority
              />
            ) : undefined
          }
        />

        <Section id="usecase-facts" labelledBy="agi-usecase-facts-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>{entry.factsEyebrow}</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-usecase-facts-title">
                {entry.factsTitle}
              </h2>
            </div>
            <FactGrid items={entry.facts} />
          </Stack>
        </Section>

        <Section id="usecase-ledger" labelledBy="agi-usecase-ledger-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>{entry.ledgerEyebrow}</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-usecase-ledger-title">
                {entry.ledgerTitle}
              </h2>
            </div>
            <Ledger caption={entry.ledgerTitle} rows={entry.ledgerRows} />
          </Stack>
        </Section>

        <Section id="usecase-close" labelledBy="agi-usecase-close-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Start now</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-usecase-close-title">
                {entry.closeTitle}
              </h2>
              <Prose>{entry.closeBody}</Prose>
            </div>
            <ButtonRow>
              {entry.closeCtas.map((cta) => (
                <Button href={cta.href} variant={cta.variant} key={cta.href}>
                  {cta.label}
                </Button>
              ))}
            </ButtonRow>
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
