import { buildMetadata } from '@/lib/seo/metadata';
import { billingPlanCapabilityPlanLabels } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { WebWindow } from '@/features/marketing/components/DeviceMockups';
import { ResearchWindow } from '@/features/marketing/components/FeatureScenes';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';

const RESEARCH_PLANS = billingPlanCapabilityPlanLabels('deep_research');

export const metadata = buildMetadata({
  title: 'Deep research: plans, sources, and reports',
  description:
    'Review and edit a research plan, choose sources and report options, then follow gathering and report-writing progress in chat.',
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
  'Gathering rounds and searches have configured limits.',
  'A gathering time budget limits further searching.',
  'Page reads have limits on count and extracted text.',
  'Reports can be incomplete when gathering ends early.',
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
              <h1 className="sr-only" id={IDS.hero}>
                Deep research
              </h1>
              <ButtonRow>
                <Button href="/login?redirectTo=%2Fchat">Open chat</Button>
                <Button href="/pricing#pricing-compare-title" variant="secondary">
                  See plans
                </Button>
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
              <p className="agi-lp-eyebrow">Review the plan</p>
              <h2 className="agi-lp-h2" id={IDS.plan}>
                Review the plan <em className="agi-lp-accent">before web gathering.</em>
              </h2>
            </div>
            <div className="agi-lp-moments">
              <article className="agi-lp-moment">
                <div className="agi-lp-moment-copy">
                  <h3 className="agi-lp-moment-title">Review and edit before you start</h3>
                  <p className="agi-lp-moment-body">
                    Web search depends on the selected model, a supported search route and account
                    access. Web Deep Research presents an editable plan and waits for you to choose
                    Start research before gathering from the web. You can also choose sources and
                    report options.
                  </p>
                </div>
                <WebWindow />
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
                Follow planning, approval, searching and report-writing progress in chat.
              </Prose>
            </div>
            <Ledger
              caption="Stages of a deep research run"
              rows={[
                {
                  label: 'Plan',
                  value:
                    'Creates an editable plan. Planning may use a model call; selected file sources may be looked up first.',
                },
                {
                  label: 'Approve',
                  value:
                    'Choose Start research to begin web gathering, or cancel. You can change the steps, sources and report options.',
                },
                {
                  label: 'Gather',
                  value:
                    'Searches allowed sources and can fetch page text within the run’s limits.',
                },
                {
                  label: 'Cite',
                  value:
                    'The model is asked to cite factual claims with numbered sources; citations help you check the report.',
                },
                {
                  label: 'Keep',
                  value:
                    'Saved reports are listed newest first. Export as Markdown, PDF or Word. In the chat report panel, turn a saved report into an artifact.',
                },
              ]}
            />
          </Stack>
        </Section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <p className="agi-lp-eyebrow" style={{ marginBottom: '0.75rem' }}>
              Gathering limits
            </p>
            <h2 className="agi-ds-h3" style={{ marginBottom: '1rem' }}>
              Configured limits bound the gathering phase.
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
                Choose a plan <em className="agi-lp-accent">with Deep Research.</em>
              </h2>
              <p className="agi-lp-lede">
                Deep Research is included on {RESEARCH_PLANS} plans. Choose Auto or a model with
                research support. Availability also depends on account and workspace access.
              </p>
              <ButtonRow>
                <Button href="/pricing#pricing-compare-title">See which plans include it</Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
