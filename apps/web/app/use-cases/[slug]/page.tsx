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
import {
  USE_CASE_CONTENT,
  USE_CASE_SLUGS,
} from '@/features/marketing/components/pages/business/use-cases-content';

interface Props {
  params: Promise<{ slug: string }>;
}

const HEADLINE_SPLIT_RE = /[.,]\s/;

function splitHeadline(title: string): { lead: string; accent: string } {
  const match = HEADLINE_SPLIT_RE.exec(title);
  if (!match) return { lead: '', accent: title };
  const splitAt = match.index + match[0].length;
  return { lead: title.slice(0, splitAt).trim(), accent: title.slice(splitAt).trim() };
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

  const IDS = {
    hero: 'agi-usecase-title',
    facts: 'agi-usecase-facts-title',
    ledger: 'agi-usecase-ledger-title',
    close: 'agi-usecase-close-title',
  } as const;

  const headline = splitHeadline(entry.title);

  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">{entry.eyebrow}</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                {headline.lead ? <span className="agi-lp-line">{headline.lead}</span> : null}
                <em className="agi-lp-accent">{headline.accent}</em>
              </h1>
              <p className="agi-lp-lede">{entry.lede}</p>
              <ButtonRow>
                {entry.ctas.map((cta) => (
                  <Button href={cta.href} variant={cta.variant} key={cta.href}>
                    {cta.label}
                  </Button>
                ))}
              </ButtonRow>
            </div>
            {entry.visual ? (
              <div className="agi-lp-hero-stage">
                <ProductFrame
                  src={entry.visual.dark}
                  srcLight={entry.visual.light}
                  alt={entry.visual.alt}
                  width={entry.visual.width}
                  height={entry.visual.height}
                  caption={entry.visual.caption}
                  priority
                />
              </div>
            ) : null}
          </div>
        </section>

        <Section id="usecase-facts" labelledBy={IDS.facts} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>{entry.factsEyebrow}</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.facts}>
                {entry.factsTitle}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {entry.facts.map((fact) => (
                <div
                  key={fact.title}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--agi-rule)] bg-[var(--agi-ground-2)] p-6"
                >
                  <Eyebrow>{fact.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{fact.title}</h3>
                  <Prose size="sm">{fact.body}</Prose>
                </div>
              ))}
            </div>
          </Stack>
        </Section>

        <Section id="usecase-ledger" labelledBy={IDS.ledger} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>{entry.ledgerEyebrow}</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.ledger}>
                {entry.ledgerTitle}
              </h2>
            </div>
            <Ledger caption={entry.ledgerTitle} rows={entry.ledgerRows} />
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                {entry.closeTitle}
              </h2>
              <p className="agi-lp-lede">{entry.closeBody}</p>
              <ButtonRow>
                {entry.closeCtas.map((cta) => (
                  <Button href={cta.href} variant={cta.variant} key={cta.href}>
                    {cta.label}
                  </Button>
                ))}
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
