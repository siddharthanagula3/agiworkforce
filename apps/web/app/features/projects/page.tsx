import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { CapabilityGrid, FinalCta } from '@/features/marketing/components/FlagshipSections';
import { Reveal } from '@/features/marketing/components/Reveal';

export const metadata = buildMetadata({
  title: 'AGI Projects | A Home for Recurring Work',
  description:
    'AGI Projects group chats, knowledge files, and standing instructions under one objective. Recurring work opens with its context already in place.',
  path: '/features/projects',
});

const ANATOMY = [
  {
    meta: 'Chats',
    title: 'Threads that share one objective.',
    body: 'Group related conversations under a single project instead of scattering them across history.',
    points: [
      'Every chat in a project sits under the same name, icon, and accent',
      'Star the projects you keep coming back to',
      'Switch the active project and its context follows you into the chat',
    ],
  },
  {
    meta: 'Instructions',
    title: 'Standing context, written once.',
    body: 'Project instructions describe how work in this project should run. Set once in project settings, carried into every chat.',
    points: [
      'Tone, format, constraints, and goals ride along automatically',
      'Edit instructions any time from project settings',
      'Designed so each project can carry its own defaults for how chats run',
    ],
  },
  {
    meta: 'Files',
    title: 'Reference material, kept close.',
    body: 'Attach the documents a project leans on and keep them visible from the project view.',
    points: [
      'Add knowledge files and preview them in place',
      'Remove a file the moment it no longer belongs',
      'Hosted project files are part of AGI managed cloud (public alpha)',
    ],
  },
];

const LOOP = [
  {
    step: '01',
    meta: 'Create',
    title: 'Name the objective.',
    body: 'Create a project with a name, a description, and an icon and accent. Starter instructions are optional.',
  },
  {
    step: '02',
    meta: 'Gather',
    title: 'Load the context.',
    body: 'Attach the files the work leans on and write the standing instructions every chat in the project should follow.',
  },
  {
    step: '03',
    meta: 'Return',
    title: 'Pick up where you left off.',
    body: 'Open the project and the grouped threads are waiting. The brief is already written. The references are already there.',
  },
];

export default function ProjectsFeaturePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Features · Projects</p>
          <h1 className="agi-page-h1">Give recurring work a home.</h1>
          <p className="agi-page-lede">
            A project gathers the chats, files, and instructions that belong to one objective. The
            workspace opens with its context already in place instead of starting every conversation
            from zero.
          </p>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-projects-anatomy">
          <p className="agi-fl-eyebrow">Anatomy</p>
          <h2 id="agi-projects-anatomy" className="agi-fl-h2">
            What a project holds.
          </h2>
          <p className="agi-fl-section-lede">
            Chats, standing instructions, and reference files live together, so context stops being
            something you re-explain.
          </p>
          <div className="agi-fl-trust-grid">
            {ANATOMY.map((card, i) => (
              <Reveal key={card.meta} delay={i * 80} className="agi-fl-trust-card">
                <p className="agi-fl-trust-mode">{card.meta}</p>
                <h3 className="agi-fl-trust-title">{card.title}</h3>
                <p className="agi-fl-trust-body">{card.body}</p>
                <ul className="agi-fl-trust-points">
                  {card.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-projects-loop">
          <p className="agi-fl-eyebrow">The loop</p>
          <h2 id="agi-projects-loop" className="agi-fl-h2">
            Start once. Return often.
          </h2>
          <p className="agi-fl-section-lede">
            Projects are built for the work that comes back every week. The rhythm is create,
            gather, return.
          </p>
          <div className="agi-fl-trust-grid">
            {LOOP.map((card, i) => (
              <Reveal key={card.step} delay={i * 80} className="agi-fl-trust-card">
                <p className="agi-fl-trust-mode">
                  <span aria-hidden="true">{card.step}</span> {card.meta}
                </p>
                <h3 className="agi-fl-trust-title">{card.title}</h3>
                <p className="agi-fl-trust-body">{card.body}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Keep exploring"
          title="Projects connect the rest of the workspace."
          items={[
            {
              meta: 'Artifacts',
              title: 'Artifacts',
              body: 'Documents, code, and visual outputs with previews, versions, and sharing.',
              href: '/features/artifacts',
            },
            {
              meta: 'Memory',
              title: 'Memory',
              body: 'Preferences and remembered facts you can see, edit, and control.',
              href: '/features/memory',
            },
            {
              meta: 'Research',
              title: 'Deep Research',
              body: 'Cited reports across the web, your files, and connected tools.',
              href: '/features/deep-research',
            },
          ]}
        />

        <FinalCta
          eyebrow="Start now"
          title="Start your first project."
          body="Try AGI Web in the browser. Get notified when the apps open for Local and BYOK work. Give the work you repeat a place to live."
          ctas={[
            { href: '/login?redirectTo=%2F', label: 'Try AGI Web' },
            { href: '/download', label: 'Get notified' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
