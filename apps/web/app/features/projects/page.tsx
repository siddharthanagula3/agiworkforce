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

export const metadata = buildMetadata({
  title: 'Projects: a home for recurring work',
  description:
    'AGI Projects group chats, knowledge files, and standing instructions under one objective. Recurring work opens with its context already in place.',
  path: '/features/projects',
});

const PROJECTS_ENTRY_HREF = '/login?redirectTo=%2Fchat%2Fprojects';

export default function ProjectsFeaturePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-features-projects-title"
          eyebrow="Features · Projects"
          title="A project rebuilds its own context into every prompt you send."
          lede="Open a chat inside a project and AGI reassembles what that project holds, the standing instructions you wrote, the files you uploaded, and the threads you already ran there, into the system message for that one turn. It is built fresh each time and ranked against the question you just typed."
          ctas={[{ href: PROJECTS_ENTRY_HREF, label: 'Open Projects in AGI Web' }]}
          visual={
            <ProductFrame
              src="/product/projects-dark.png"
              alt="The AGI projects view listing standing instructions, files, and threads"
              width={2880}
              height={1800}
              caption={['Projects', 'Workspace']}
              priority
            />
          }
        />

        <Section id="starting" labelledBy="agi-features-projects-start-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Starting</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-projects-start-title">
                Every template arrives with its instructions already written.
              </h2>
              <Prose>
                Creating a project asks for a name and a starting point. Blank leaves everything
                empty. The rest ship with a description and a set of standing instructions filled
                in, so the first chat in the project already behaves the way that kind of work needs
                it to.
              </Prose>
            </div>
            <Ledger
              caption="Project templates"
              rows={[
                {
                  label: 'Research',
                  value:
                    'Gather sources and build up findings on a topic. Ships with: "Cite a source for every factual claim, and link it."',
                },
                {
                  label: 'Writing',
                  value:
                    'Drafting and editing with a consistent voice. Ships with: "Match the voice of the samples in this project rather than a generic house style."',
                },
                {
                  label: 'Engineering',
                  value:
                    'Work on a codebase with its conventions in context. Ships with: "Show the smallest change that solves the problem."',
                },
                {
                  label: 'Meeting notes',
                  value:
                    'Summarise discussions and track what was decided. Ships with: "Separate decisions from discussion, and name the owner of each action."',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section
          id="accumulate"
          labelledBy="agi-features-projects-accumulate-title"
          rule
          ground="2"
        >
          <Stack gap="loose">
            <div>
              <Eyebrow>What builds up</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-projects-accumulate-title">
                Everything you add stays where the work is.
              </h2>
              <Prose>
                A project collects three kinds of thing, and each arrives at a different moment.
                Instructions get written once. Files show up as the work needs them. Threads
                accumulate on their own.
              </Prose>
            </div>
            <Ledger
              caption="What a project accumulates"
              rows={[
                {
                  label: 'Instructions',
                  value:
                    'You write the standing instructions once. Project settings holds a single instructions field. Up to 8,000 characters of it ride into the system message of every chat in the project, labelled as instructions the model is to follow for every reply here.',
                },
                {
                  label: 'Files',
                  value:
                    'You add the files the work leans on. The Sources tab takes images, PDFs, text, JSON and XML, dropped in or picked, and text you paste is saved as a source of its own. A project holds up to 20 files, and the file list in project settings shows the running count against that cap instead of waiting for an upload to be refused.',
                },
                {
                  label: 'Threads',
                  value:
                    'The threads pile up without you filing them. Every chat started from the project belongs to it. The project view lists them by date, and the ones you already ran become ranked context for the next question you ask.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="assembly" labelledBy="agi-features-projects-assembly-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>What gets sent</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-projects-assembly-title">
                The project block sits at the top of the system message.
              </h2>
              <Prose>
                It is rebuilt on every request inside a project, and skipped when the project holds
                nothing yet. Read the boundary line below carefully: your files and your earlier
                threads go in as reference data, and the model is told never to follow instructions
                found inside them.
              </Prose>
            </div>
            <Ledger
              caption="Project context assembly"
              rows={[
                {
                  label: 'Header',
                  value:
                    'Names the project and carries its description, so the model knows which project it is working inside.',
                },
                {
                  label: 'Instructions',
                  value:
                    'Your standing instructions, included verbatim, labelled as rules to follow for every reply here.',
                },
                {
                  label: 'Files',
                  value:
                    'Each knowledge file is listed by name with a short summary, then its extracted content follows as untrusted reference data.',
                },
                {
                  label: 'Threads',
                  value:
                    'The most relevant earlier chats in the project, each contributing its title and a bounded recent excerpt, also marked untrusted reference data.',
                },
                {
                  label: 'Boundary',
                  value:
                    'A standing instruction that the model must never follow directives found inside project files or past chats, only use them as evidence for the current request.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="budget" labelledBy="agi-features-projects-budget-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Ranking and budget</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-projects-budget-title">
                The context is scored against your question, then trimmed to fit.
              </h2>
              <Prose>
                Everything a project holds cannot go into every turn. AGI scores each file and each
                earlier thread against the words in your current message, takes the highest scorers
                first, and stops at a fixed character budget. Whatever gets left out is named in the
                prompt, so the model tells you about the gap.
              </Prose>
            </div>
            <Ledger
              caption="Context ranking and budget"
              rows={[
                {
                  label: 'File ranking',
                  value:
                    'A filename match scores 6, a summary match 3, a hit in the body 1. Ties fall back to the order the files were added.',
                },
                {
                  label: 'Thread ranking',
                  value:
                    'The 40 most recently updated chats in the project are the candidates. A title match scores 6, an excerpt match 2, and at most 15 chats survive into the prompt.',
                },
                {
                  label: 'Thread excerpts',
                  value:
                    'Each surviving chat contributes its last six messages, each clipped to 800 characters, capped at 1,600 characters per chat and 16,000 across all of them.',
                },
                {
                  label: 'File budget',
                  value:
                    'A file that gets cut short is marked as an excerpt, so the model says it was truncated: 16,000 characters from any single file and 48,000 across all files in one turn.',
                },
                {
                  label: 'Overflow',
                  value:
                    'Files that did not fit, and files whose text could not be extracted, are listed by name with an instruction to tell you rather than answer as though they were empty.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="lifecycle" labelledBy="agi-features-projects-lifecycle-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Over time</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-features-projects-lifecycle-title">
                A project is something you can move, copy, or close out.
              </h2>
              <Prose>
                Projects outlast the work that started them, so the operations that move or destroy
                one are explicit about what they take with them.
              </Prose>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Pin',
                  title: 'The projects you keep returning to sort to the top.',
                  body: 'Pin a project from its menu. The gallery sorts by pinned first, or by last update, creation date, or name.',
                },
                {
                  meta: 'Copy',
                  title: 'A project can leave as a file.',
                  body: 'Duplicate builds a second project carrying the same instructions, description, and knowledge files. Export streams the project and its files out as a JSON download.',
                },
                {
                  meta: 'Delete',
                  title: 'Deleting a project does not delete its conversations.',
                  body: 'Deleting removes the project and permanently destroys the uploaded file contents. The chats that ran inside it move to All Chats.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="projects-close" labelledBy="agi-features-projects-close-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-features-projects-close-title">
              Memory is the other thing a project can scope.
            </h2>
            <Prose>
              A project can be told to ignore everything remembered outside it, so chats there draw
              only on the project&rsquo;s own memories. What memory stores, how it reads, and how to
              clear it is documented on its own page.
            </Prose>
            <ButtonRow>
              <Button href="/features/memory">See how memory works</Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
