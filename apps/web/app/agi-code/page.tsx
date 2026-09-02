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
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { SURFACE_STATUS } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Code: the CLI and VS Code developer stack',
  description:
    'AGI Code spans the agi CLI and the VS Code extension: resumable sessions, code review, sandboxed execution, hooks, skills, MCP, and privacy modes. Local models, BYOK, or AGI managed cloud.',
  path: '/agi-code',
});

export default function AgiCodePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-code-hero-title"
          eyebrow="AGI Code"
          title="VS Code starts the same binary as your terminal."
          lede="AGI Code is the agi binary plus the VS Code extension that drives it. The extension spawns agi app-server over stdio, so both windows read the same sessions, resolve the same model catalog, and answer the same approval requests. If the runtime reports a different model or provider than the editor asked for, the turn is refused."
          ctas={[
            { href: '/cli', label: 'See the CLI' },
            { href: '/vscode-extension', label: 'See AGI in VS Code', variant: 'secondary' },
          ]}
        />

        <Section id="agi-code-status" labelledBy="agi-code-status-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-code-status-title">
              Two surfaces, two different states.
            </h2>
            <SurfaceStatus
              state="live"
              name="AGI CLI"
              detail={`${SURFACE_STATUS.cli}. Signed archives for macOS, Linux, and Windows.`}
              action={{ label: 'Get the CLI', href: '/download#cli-downloads' }}
            />
            <SurfaceStatus
              state="absent"
              name="AGI in VS Code"
              detail="Distributed as an unpublished VSIX to preview users. Nothing installs from the Marketplace yet."
            />
          </Stack>
        </Section>

        <Section id="agi-code-stack" labelledBy="agi-code-stack-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>The stack</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-code-stack-title">
                Each surface is a window onto the same running agent.
              </h2>
              <Prose>
                Work executes in the terminal: review a diff, apply a patch, run a command under the
                OS sandbox. The editor is where you ask about code that is already open, with the
                file and selection you are looking at attached to the question.
              </Prose>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'AGI CLI · the Rust runtime both surfaces talk to',
                  title: 'What the terminal does',
                  body: 'agi review reads your working diff, or main...HEAD with --base, and returns findings ranked clean, minor, major, or critical with file and line. agi apply lands a session diff as a git patch. agi sandbox runs a command under the OS sandbox. agi app-server exposes the whole thing to an editor over stdio.',
                },
                {
                  meta: 'AGI in VS Code · a chat participant wired to that runtime',
                  title: 'What the editor does',
                  body: 'Mention @agi in the chat panel and the extension attaches your active file, the text you selected, its language, and the lines around it. By default nothing reaches disk until you pick apply inline; the alternative opens the answer in a tab beside your code.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="agi-code-handoff" labelledBy="agi-code-handoff-title" rule>
          <Stack>
            <div>
              <Eyebrow>Handoff</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-code-handoff-title">
                A session you started in the terminal is already waiting in the editor.
              </h2>
            </div>
            <Prose>
              Sessions are files under ~/.agiworkforce/managed_sessions. agi session fork splits one
              at any turn into a new named session, and agi --resume picks it back up. The extension
              reads that same directory through agi app-server, lists only the threads belonging to
              the workspace you have open, and hands the runtime&rsquo;s approval requests to you
              inside the editor.
            </Prose>
          </Stack>
        </Section>

        <Section
          id="agi-code-capabilities"
          labelledBy="agi-code-capabilities-title"
          rule
          ground="2"
        >
          <Stack gap="loose">
            <div>
              <Eyebrow>Capabilities</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-code-capabilities-title">
                Everything below is already in the source.
              </h2>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Review',
                  title: 'agi review',
                  body: 'Reads the staged and unstaged diff, or a branch range with --base, and prints an overall severity plus one line per finding with the file and line number attached.',
                },
                {
                  meta: 'Sessions',
                  title: 'Fork at a turn',
                  body: 'agi session fork takes --at-turn to cut a session at a specific user turn and --as to name the copy. The original is untouched, and both stay listable.',
                },
                {
                  meta: 'Sandbox',
                  title: 'Seatbelt and bubblewrap',
                  body: 'agi sandbox runs a command under macOS Seatbelt or Linux bubblewrap. If that binary is missing from PATH, sandboxed exec stops and tells you how to install it.',
                },
                {
                  meta: 'Editor context',
                  title: 'What @agi can see',
                  body: 'Your active file, the text you selected, its language, and 50 lines on either side of the selection. The agiWorkforce.contextLines setting changes that number.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="agi-code-close" labelledBy="agi-code-close-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-code-close-title">
              Watch the download page for both surfaces.
            </h2>
            <Prose>
              The agi binary is signed and downloadable today. AGI in VS Code is distributed as a
              VSIX to preview users; the download page tracks both, and it is where that changes
              first.
            </Prose>
            <ButtonRow>
              <Button href="/download" variant="secondary">
                Check availability
              </Button>
              <Button href="/local" variant="secondary">
                See what runs offline
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
