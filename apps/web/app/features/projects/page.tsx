import { buildMetadata } from '@/lib/seo/metadata';
import { PROJECT_TEMPLATES } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { ProjectWindow } from '@/features/marketing/components/FeatureScenes';
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

export const metadata = buildMetadata({
  title: 'Projects: a home for recurring work',
  description:
    'AGI Projects group chats, knowledge files and standing instructions. Project chats can use selected references within access and context limits.',
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
    body: 'Save standing instructions in Project settings for chats in the project.',
  },
  {
    meta: 'Files',
    title: 'Added as the work needs them',
    body: 'Keep reference files with the project. Selected readable passages can provide context for a question.',
  },
  {
    meta: 'Threads',
    title: 'Accumulate on their own',
    body: 'Earlier project chats can supply selected, bounded excerpts for a later question.',
  },
] as const;

const BUDGET_FACTS = [
  'Files and chats ranked against the question.',
  'Selected readable passages within the context limit.',
  'Bounded excerpts from earlier project chats.',
  'File content may be partial or omitted.',
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
              <h1 className="sr-only" id={IDS.hero}>
                Project instructions, with selected reference material.
              </h1>
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
                Start blank or choose a preset.
              </h2>
            </div>
            <div className="agi-lp-moments">
              <article className="agi-lp-moment">
                <div className="agi-lp-moment-copy">
                  <h3 className="agi-lp-moment-title">An authored settings draft</h3>
                  <p className="agi-lp-moment-body">
                    The project dialog offers{' '}
                    {PROJECT_TEMPLATES.map((template) => template.label).join(', ')}. Presets
                    provide starting instructions; the settings below show an authored draft.
                  </p>
                </div>
                <ProjectWindow />
              </article>
            </div>
          </div>
        </section>

        <Section id="accumulate" labelledBy={IDS.accumulate} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>What builds up</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.accumulate}>
                Instructions, files and chats in one project.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {ACCUMULATES.map((item) => (
                <div key={item.meta} className="agi-ds-card">
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
                How project context is assembled.
              </h2>
              <Prose>
                Project chats can use saved instructions and selected passages from files and
                earlier chats, within access and context limits. Files and past chats enter as
                reference data.
              </Prose>
            </div>
            <Ledger
              caption="Project context assembly"
              rows={[
                {
                  label: 'Header',
                  value: 'The project name and available description.',
                },
                {
                  label: 'Instructions',
                  value: 'Saved project instructions within the context limit.',
                },
                {
                  label: 'Files',
                  value:
                    'File names and available summaries, with selected readable passages when they fit.',
                },
                {
                  label: 'Threads',
                  value: 'The most relevant earlier chats, title plus a bounded recent excerpt.',
                },
                {
                  label: 'Boundary',
                  value: 'Files and past chats are passed as untrusted reference material.',
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
                Manage a project as the work changes.
              </h2>
            </div>
            <Ledger
              caption="Project lifecycle"
              rows={[
                {
                  label: 'Star',
                  value:
                    'Star a project beside its name. Sort the gallery by starred first, last update, creation date, or name.',
                },
                {
                  label: 'Copy',
                  value:
                    'Duplicate creates another project with its description and instructions. Export downloads project settings and available file information as JSON.',
                },
                {
                  label: 'Delete',
                  value:
                    'Delete permanently removes the project and its knowledge files, including the uploaded file contents, and cannot be undone. Its conversations move to All Chats.',
                },
              ]}
            />
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Choose which memories a project can use.
              </h2>
              <p className="agi-lp-lede">
                In Project settings, turn off &ldquo;Use memories from outside this project&rdquo;
                to limit remembered facts and past-chat search to this project when those features
                are enabled.
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
