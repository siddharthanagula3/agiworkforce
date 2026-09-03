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
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';

const RESEARCH_MAX_TURNS = 6;
const RESEARCH_MAX_SEARCHES = 12;
const RESEARCH_GATHER_BUDGET_MINUTES = 4;

export const metadata = buildMetadata({
  title: 'Deep research: cited answers across web, files, and tools',
  description:
    'Research in AGI is designed around citations: a plan you approve before it searches, a bounded gathering phase, and a report with a bracketed number behind every factual claim.',
  path: '/features/deep-research',
});

export default function DeepResearchPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-features-research-title"
          eyebrow="Features · Deep research"
          title="Every claim names the source it came from."
          lede="Search-capable models reach the live web on their own, and the composer states whether search is on for the model you picked. Deep Research goes further: the run writes out the searches it intends to make, then stops and waits for you to approve them. What comes back is a report with a bracketed number behind every factual claim, the matching sources listed beside it, and a stored copy you can reopen long after the chat has scrolled away."
          ctas={[{ href: '/login?redirectTo=%2Fchat', label: 'Start a research run' }]}
          visual={
            <ProductFrame
              light="/product/deep-research-report-light.png"
              dark="/product/deep-research-report-dark.png"
              alt="A finished AGI deep research report with numbered inline citations and a sources list"
              width={2392}
              height={1402}
              caption={['Deep research', 'Report']}
              priority
            />
          }
        />

        <Section id="inside-a-run" labelledBy="agi-features-research-run-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside a run</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-research-run-title">
                A run shows its plan first.
              </h2>
              <Prose>
                Deep Research is a bounded loop that runs on the server: it plans, waits, gathers,
                writes, and stores what it wrote. Each stage names itself in the chat while it is
                happening.
              </Prose>
            </div>
            <Ledger
              caption="Stages of a deep research run"
              rows={[
                {
                  label: 'Plan',
                  value:
                    'The opening turn lists the searches it intends to run, three to six of them, and runs none of them yet.',
                },
                {
                  label: 'Approve',
                  value:
                    'The run pauses there. Searching spends your budget, so nothing is searched until you accept the plan, and the queries you accepted are the ones the next turn runs.',
                },
                {
                  label: 'Gather',
                  value:
                    'Each round runs those searches and can open up to three of the pages it finds to read them in full. The source list is built from what the searches actually returned.',
                },
                {
                  label: 'Cite',
                  value:
                    'The last turn writes the report against a numbered list of everything gathered, under instruction to put a bracketed number behind every factual claim and to keep raw URLs out of the prose.',
                },
                {
                  label: 'Keep',
                  value:
                    'The finished report is stored against your account and listed newest first. Export it as Markdown, PDF, or Word, ask a follow-up that is grounded in it, or hand it to the artifacts panel as an editable document.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="run-bounds" labelledBy="agi-features-research-bounds-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>What a run may spend</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-research-bounds-title">
                Every run is capped before it starts.
              </h2>
              <Prose>
                These are the defaults a single run is held to. Across the whole run at most eight
                pages are opened and read in full, three of them in any one round. A run reaches the
                live web, so it is never an on-device thread; the privacy page sets out where each
                route sends your data.
              </Prose>
            </div>
            <Ledger
              caption="Run budget"
              rows={[
                {
                  label: `${RESEARCH_MAX_TURNS} turns`,
                  value:
                    'Model turns in a run. The planning turn, the gathering rounds, and the turn that writes the report all come out of the same allowance.',
                },
                {
                  label: `${RESEARCH_MAX_SEARCHES} searches`,
                  value:
                    'Web searches in a run. Gathering stops at the cap. The report is then written from whatever the run had already collected.',
                },
                {
                  label: `${RESEARCH_GATHER_BUDGET_MINUTES} minutes`,
                  value:
                    'Gathering budget. Whatever ends the gathering phase, the report still gets written, and it has to say so when coverage came up short.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="research-close" labelledBy="agi-features-research-close-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-features-research-close-title">
              Deep Research is a paid feature.
            </h2>
            <Prose>
              The toggle stays off on the website free trial, and it needs a model that supports
              research or the Auto router. The plan page lists what each tier includes.
            </Prose>
            <ButtonRow>
              <Button href="/pricing">See which plans include it</Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
