import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { ProjectWindow } from '@/features/marketing/components/FeatureScenes';
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

export const metadata = buildMetadata({
  title: 'Projects: a home for recurring work',
  description:
    'AGI Projects group chats, knowledge files, and standing instructions under one objective. Recurring work opens with its context already in place.',
  path: '/features/projects',
});

const PROJECTS_ENTRY_HREF = '/login?redirectTo=%2Fchat%2Fprojects';

const IDS = {
  hero: 'agi-features-projects-title',
  templates: 'agi-features-projects-templates-title',
  accumulate: 'agi-features-projects-accumulate-title',
  assembly: 'agi-features-projects-assembly-title',
  budget: 'agi-features-projects-budget-title',
  lifecycle: 'agi-features-projects-lifecycle-title',
  close: 'agi-features-projects-close-title',
} as const;

const ACCUMULATES = [
  {
    meta: 'Instructions',
    title: 'Written once',
    body: 'Project settings holds a single instructions field. Up to 8,000 characters of it ride into the system message of every chat in the project.',
  },
  {
    meta: 'Files',
    title: 'Added as the work needs them',
    body: 'The Sources tab takes images, PDFs, text, JSON and XML, dropped in or picked. A project holds up to 20 files, tracked against that cap.',
  },
  {
    meta: 'Threads',
    title: 'Accumulate on their own',
    body: 'Every chat started from the project belongs to it, listed by date, and the ones you already ran become ranked context for the next question.',
  },
] as const;

const BUDGET_FACTS = [
  'filename match scores 6, summary match 3',
  '40 recent chats ranked, 15 survive',
  '16,000 characters per file, 48,000 across all',
  '1,600 characters per chat excerpt',
] as const;

export default function ProjectsFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">Features &middot; Projects</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">A project rebuilds</span>
                <span className="agi-lp-line">its own context</span>
                <em className="agi-lp-accent">into every prompt.</em>
              </h1>
              <p className="agi-lp-lede">
                Open a chat inside a project and AGI reassembles what it holds, your standing
                instructions, your files, and the threads you already ran, into the system message
                for that one turn. Built fresh each time, ranked against the question you asked.
              </p>
              <ButtonRow>
                <Button href={PROJECTS_ENTRY_HREF}>Open Projects in AGI Web</Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <ProjectWindow />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby={IDS.templates}>
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <p className="agi-lp-eyebrow">Starting</p>
              <h2 className="agi-lp-h2" id={IDS.templates}>
                Every template arrives <em className="agi-lp-accent">already written.</em>
              </h2>
            </div>
            <div className="agi-lp-moments">
              <article className="agi-lp-moment">
                <div className="agi-lp-moment-copy">
                  <h3 className="agi-lp-moment-title">Four starting points</h3>
                  <p className="agi-lp-moment-body">
                    Blank leaves everything empty. Research ships with &ldquo;Cite a source for
                    every factual claim, and link it.&rdquo; Writing ships with &ldquo;Match the
                    voice of the samples in this project.&rdquo; Engineering ships with &ldquo;Show
                    the smallest change that solves the problem.&rdquo; Meeting notes ships with
                    &ldquo;Separate decisions from discussion, and name the owner of each
                    action.&rdquo;
                  </p>
                </div>
                <ProductFrame
                  src="/product/projects-dark-landing.png"
                  srcLight="/product/projects-light-landing.png"
                  alt="Creating a new AGI project from a template"
                  width={2880}
                  height={1800}
                  caption={['Projects', 'New project']}
                />
              </article>
            </div>
          </div>
        </section>

        <Section id="accumulate" labelledBy={IDS.accumulate} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>What builds up</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.accumulate}>
                Everything you add stays where the work is.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {ACCUMULATES.map((item) => (
                <div
                  key={item.meta}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--agi-rule)] bg-[var(--agi-ground)] p-6"
                >
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </Stack>
        </Section>

        <Section id="assembly" labelledBy={IDS.assembly} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>What gets sent</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.assembly}>
                The project block sits at the top of the system message.
              </h2>
              <Prose>
                Rebuilt on every request inside a project, and skipped when the project holds
                nothing yet. Your files and earlier threads go in as reference data, and the model
                is told never to follow instructions found inside them.
              </Prose>
            </div>
            <Ledger
              caption="Project context assembly"
              rows={[
                {
                  label: 'Header',
                  value: 'Names the project and carries its description.',
                },
                {
                  label: 'Instructions',
                  value: 'Your standing instructions, included verbatim.',
                },
                {
                  label: 'Files',
                  value: 'Each file listed by name with a summary, then its extracted content.',
                },
                {
                  label: 'Threads',
                  value: 'The most relevant earlier chats, title plus a bounded recent excerpt.',
                },
                {
                  label: 'Boundary',
                  value:
                    'A standing instruction that the model must never follow directives found inside project files or past chats.',
                },
              ]}
            />
          </Stack>
        </Section>

        <div className="agi-lp-factline">
          <div className="agi-ds-container">
            <p className="agi-lp-eyebrow" style={{ marginBottom: '0.75rem' }}>
              Ranking and budget
            </p>
            <h2 className="agi-ds-h3" style={{ marginBottom: '1rem' }}>
              Scored against your question, then trimmed to fit.
            </h2>
            <ul className="agi-lp-factline-list">
              {BUDGET_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>
        </div>

        <Section id="lifecycle" labelledBy={IDS.lifecycle} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Over time</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.lifecycle}>
                A project is something you can move, copy, or close out.
              </h2>
            </div>
            <Ledger
              caption="Project lifecycle"
              rows={[
                {
                  label: 'Pin',
                  value:
                    'Pin a project from its menu. The gallery sorts by pinned first, or by last update, creation date, or name.',
                },
                {
                  label: 'Copy',
                  value:
                    'Duplicate builds a second project carrying the same instructions, description, and knowledge files. Export streams it out as a JSON download.',
                },
                {
                  label: 'Delete',
                  value:
                    'Deleting removes the project and permanently destroys the uploaded file contents. The chats that ran inside it move to All Chats.',
                },
              ]}
            />
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Memory is the other thing <em className="agi-lp-accent">a project scopes.</em>
              </h2>
              <p className="agi-lp-lede">
                A project can be told to ignore everything remembered outside it, so chats there
                draw only on the project&rsquo;s own memories.
              </p>
              <ButtonRow>
                <Button href="/features/memory">See how memory works</Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
