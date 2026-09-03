import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { SURFACE_STATUS } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Code: the CLI and VS Code developer stack',
  description:
    'AGI Code spans the agi CLI and the VS Code extension: resumable sessions, code review, sandboxed execution, hooks, skills, MCP, and privacy modes. Local models, BYOK, or AGI managed cloud.',
  path: '/agi-code',
});

const IDS = {
  hero: 'agi-code-hero-title',
  status: 'agi-code-status-title',
  stack: 'agi-code-stack-title',
  handoff: 'agi-code-handoff-title',
  capabilities: 'agi-code-capabilities-title',
  close: 'agi-code-close-title',
} as const;

const REVIEW_TRANSCRIPT = [
  { kind: 'cmd', text: 'agi review' },
  { kind: 'out', text: 'Reading working diff...' },
  {
    kind: 'out',
    text: 'auth/session.rs:142  major  token refresh races the request that triggered it',
  },
  { kind: 'out', text: 'overall: major' },
  { kind: 'cmd', text: 'agi apply' },
  { kind: 'out', text: 'Wrote patch from session to git apply' },
  { kind: 'cmd', text: 'agi sandbox -- pnpm test auth/session' },
  { kind: 'dim', text: 'running under Seatbelt, no outbound network' },
] as const;

const STACK_LAYERS = [
  {
    meta: 'AGI CLI · the Rust runtime both surfaces talk to',
    title: 'What the terminal does',
    body: 'agi review reads your working diff, or main...HEAD with --base, and returns findings ranked clean, minor, major, or critical with file and line. agi apply lands a session diff as a git patch. agi sandbox runs a command under the OS sandbox. agi app-server exposes the whole thing to an editor over stdio.',
  },
  {
    meta: 'AGI in VS Code · a chat participant wired to that runtime',
    title: 'What the editor does',
    body: 'Mention @agi in the chat panel and the extension attaches your active file, the text you selected, its language, and the lines around it. By default nothing reaches disk until you pick apply inline.',
  },
] as const;

export default function AgiCodePage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby={IDS.hero}>
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <p className="agi-lp-eyebrow">AGI Code</p>
              <h1 className="agi-lp-h1" id={IDS.hero}>
                <span className="agi-lp-line">VS Code starts</span>
                <em className="agi-lp-accent">the same binary as your terminal.</em>
              </h1>
              <p className="agi-lp-lede">
                AGI Code is the agi binary plus the VS Code extension that drives it. The extension
                spawns agi app-server over stdio, so both windows read the same sessions and answer
                the same approval requests. A mismatched model or provider gets the turn refused.
              </p>
              <ButtonRow>
                <Button href="/cli">See the CLI</Button>
                <Button href="/vscode-extension" variant="secondary">
                  See AGI in VS Code
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <pre className="agi-lp-terminal" aria-label="A code review session in the AGI CLI">
                {REVIEW_TRANSCRIPT.map((line) => (
                  <span className="agi-lp-terminal-line" data-kind={line.kind} key={line.text}>
                    {line.text}
                  </span>
                ))}
              </pre>
            </div>
          </div>
        </section>

        <Section id="agi-code-status" labelledBy={IDS.status} rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id={IDS.status}>
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

        <Section id="agi-code-stack" labelledBy={IDS.stack} rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>The stack</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.stack}>
                Each surface is a window onto the same running agent.
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {STACK_LAYERS.map((item) => (
                <div
                  key={item.title}
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

        <Section id="agi-code-capabilities" labelledBy={IDS.capabilities} rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Capabilities</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.capabilities}>
                Everything below is already in the source.
              </h2>
            </div>
            <Ledger
              caption="AGI Code capabilities"
              rows={[
                {
                  label: 'Review',
                  value:
                    'Reads the staged and unstaged diff, or a branch range with --base, and prints an overall severity plus one line per finding.',
                },
                {
                  label: 'Sessions',
                  value:
                    'agi session fork takes --at-turn to cut a session at a specific user turn and --as to name the copy. The original is untouched.',
                },
                {
                  label: 'Sandbox',
                  value:
                    'agi sandbox runs a command under macOS Seatbelt or Linux bubblewrap. If missing from PATH, sandboxed exec stops and says how to install it.',
                },
                {
                  label: 'Editor context',
                  value:
                    'Your active file, the text you selected, its language, and 50 lines either side. The agiWorkforce.contextLines setting changes that number.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="agi-code-handoff" labelledBy={IDS.handoff} rule ground="2">
          <Stack>
            <div>
              <Eyebrow>Handoff</Eyebrow>
              <h2 className="agi-ds-h2" id={IDS.handoff}>
                A session started in the terminal is already waiting in the editor.
              </h2>
            </div>
            <Prose>
              Sessions are files under ~/.agiworkforce/managed_sessions. agi --resume picks one back
              up, and the extension reads that same directory through agi app-server, listing only
              the threads belonging to the workspace you have open.
            </Prose>
          </Stack>
        </Section>

        <section className="agi-lp-close" aria-labelledby={IDS.close}>
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-lp-h2" id={IDS.close}>
                Watch the download page <em className="agi-lp-accent">for both surfaces.</em>
              </h2>
              <p className="agi-lp-lede">
                The agi binary is signed and downloadable today. AGI in VS Code is distributed as a
                VSIX to preview users, and the download page tracks both.
              </p>
              <ButtonRow>
                <Button href="/download" variant="secondary">
                  Check availability
                </Button>
                <Button href="/local" variant="secondary">
                  See what runs offline
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
