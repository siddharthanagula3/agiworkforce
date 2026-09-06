import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { ResearchWindow } from '@/features/marketing/components/FeatureScenes';
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

const RESEARCH_MAX_TURNS = 6;
const RESEARCH_MAX_SEARCHES = 12;
const RESEARCH_GATHER_BUDGET_MINUTES = 4;

export const metadata = buildMetadata({
  title: 'Deep research: cited answers across web, files, and tools',
  description:
    'Research in AGI is designed around citations: a plan you approve before it searches, a bounded gathering phase, and a report with a bracketed number behind every factual claim.',
  path: '/features/deep-research',
});

const IDS = {
  hero: 'agi-features-research-title',
  plan: 'agi-features-research-plan-title',
  run: 'agi-features-research-run-title',
  bounds: 'agi-features-research-bounds-title',
  close: 'agi-features-research-close-title',
} as const;

const RUN_BOUNDS = [
  `${RESEARCH_MAX_TURNS} model turns in the run`,
  `${RESEARCH_MAX_SEARCHES} web searches, then gathering stops`,
  `${RESEARCH_GATHER_BUDGET_MINUTES} minutes of gathering budget`,
  'eight pages opened and read in full, three per round',
] as const;

export default function DeepResearchPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Deep research</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">Every claim names</span>
                <em className="agi-lp-accent">the source it came from.</em>
              </h1>
              <p className="agi-lp-lede">
                Deep Research writes out the searches it intends to make, then stops and waits for
                you to approve them. What comes back is a report with a bracketed number behind
                every factual claim, the matching sources listed beside it, and a stored copy you
                can reopen long after the chat has scrolled away.
              </p>
              <ButtonRow>
                <Button href="/login?redirectTo=%2Fchat">Start a research run</Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <ResearchWindow />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby={IDS.plan}>
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <p className="agi-lp-eyebrow">Before it searches</p>
              <h2 className="agi-lp-h2" id={IDS.plan}>
                The run shows its plan <em className="agi-lp-accent">first.</em>
              </h2>
            </div>
            <div className="agi-lp-moments">
              <article className="agi-lp-moment">
                <div className="agi-lp-moment-copy">
                  <h3 className="agi-lp-moment-title">Nothing searches until you say go</h3>
                  <p className="agi-lp-moment-body">
                    Search-capable models reach the live web on their own, and the composer states
                    whether search is on for the model you picked. Deep Research goes further: the
                    opening turn lists three to six searches it intends to run, and runs none of
                    them until you accept the plan.
                  </p>
                </div>
                <ProductFrame
                  src="/product/deep-research-composer-dark.png"
                  srcLight="/product/deep-research-composer-light.png"
                  alt="The AGI composer with deep research mode selected before a run starts"
                  width={1472}
                  height={254}
                  caption={['Composer', 'Deep research']}
                />
              </article>
            </div>
          </div>
        </section>

        <Section id="inside-a-run" labelledBy={IDS.run} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Inside a run</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.run}>
                A bounded loop that runs on the server.
              </h2>
              <Prose>
                It plans, waits, gathers, writes, and stores what it wrote. Each stage names itself
                in the chat while it is happening.
              </Prose>
            </div>
            <Ledger
              caption="Stages of a deep research run"
              rows={[
                {
                  label: 'Plan',
                  value: 'Lists the searches it intends to run, and runs none of them yet.',
                },
                {
                  label: 'Approve',
                  value:
                    'The run pauses. Searching spends your budget, so nothing runs until you accept the plan.',
                },
                {
                  label: 'Gather',
                  value:
                    'Each round runs those searches and can open up to three pages to read them in full.',
                },
                {
                  label: 'Cite',
                  value:
                    'The last turn writes the report against a numbered source list, a bracketed number behind every factual claim.',
                },
                {
                  label: 'Keep',
                  value:
                    'Stored against your account, listed newest first. Export as Markdown, PDF, or Word, or hand it to the artifacts panel.',
                },
              ]}
            />
          </Stack>
        </Section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <p className="agi-lp-eyebrow" style={{ marginBottom: '0.75rem' }}>
              What a run may spend
            </p>
            <h2 className="agi-ds-h3" style={{ marginBottom: '1rem' }}>
              Every run is capped before it starts.
            </h2>
            <ul className="agi-lp-factline-list">
              {RUN_BOUNDS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Deep Research is <em className="agi-lp-accent">a paid feature.</em>
              </h2>
              <p className="agi-lp-lede">
                The toggle stays off on the website free trial, and it needs a model that supports
                research or the Auto router. The plan page lists what each tier includes.
              </p>
              <ButtonRow>
                <Button href="/pricing">See which plans include it</Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
