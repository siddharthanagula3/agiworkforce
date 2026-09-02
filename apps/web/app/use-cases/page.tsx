import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { USE_CASE_CONTENT } from '@/features/marketing/components/pages/business/use-cases-content';

export const metadata = buildMetadata({
  title: 'Use cases: startups, consultants, sales, and IT providers',
  description:
    'Use AGI across startup building, consulting, IT service delivery, sales teams, research, coding, and business automation.',
  path: '/use-cases',
});

const INDEX_ORDER = ['startups', 'consulting', 'it-providers', 'sales-teams'] as const;

export default function UseCasesPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-usecases-title"
          eyebrow="Use cases"
          title="We wrote one page per job, and each one shows that job running."
          lede="A founder automating CI, a partner drafting a deliverable, an engineer running a client runbook and a rep prepping a deal each reach for a different surface first. The four pages below take one of those apiece."
          ctas={[
            { href: '/download', label: "See what's live" },
            { href: '/solutions', label: 'See the solutions map', variant: 'secondary' },
          ]}
        />

        <Section id="usecases-index" labelledBy="agi-usecases-index-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>The pages</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-usecases-index-title">
                Each page below opens on the surface its team actually works in.
              </h2>
              <Prose>
                Underneath they are the same product, with the same projects, connectors and
                routing, so what changes between them is where the work starts and how much of it a
                script is supposed to do.
              </Prose>
            </div>
            <FactGrid
              items={INDEX_ORDER.map((slug) => {
                const entry = USE_CASE_CONTENT[slug];
                if (!entry) throw new Error(`missing use case content for slug: ${slug}`);
                return {
                  meta: entry.eyebrow.replace('Use case · ', ''),
                  title: entry.title,
                  body: (
                    <>
                      {entry.lede}{' '}
                      <a href={`/use-cases/${entry.slug}`} className="agi-ds-link">
                        Read the {entry.eyebrow.replace('Use case · ', '')} page
                      </a>
                    </>
                  ),
                };
              })}
            />
          </Stack>
        </Section>

        <Section id="usecases-close" labelledBy="agi-usecases-close-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>What it costs</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-usecases-close-title">
                Every one of these teams can start without paying us.
              </h2>
              <Prose>
                Local runs on hardware you already own and BYOK bills you at your provider&rsquo;s
                published rates, and both stay free on our side for as long as you use them.
                Managed-cloud capacity is the part that carries a price, and the pricing page is
                where those plans are written down.
              </Prose>
            </div>
            <ButtonRow>
              <Button href="/pricing">See plans</Button>
            </ButtonRow>
          </Stack>
        </Section>

        <MarketingFooter />
      </main>
    </div>
  );
}
