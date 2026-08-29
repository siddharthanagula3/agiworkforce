import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { DiffWindow } from '@/features/marketing/components/ShowcaseScenes';
import type { TerminalLine } from '@/features/marketing/components/DeviceMockups';
import {
  CapabilityGrid,
  DevBand,
  FinalCta,
  FlagshipHero,
  SurfaceIndex,
} from '@/features/marketing/components/FlagshipSections';
import { LAUNCH, SURFACE_STATUS } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Code | CLI + VS Code developer stack',
  description:
    'AGI Code spans the agi CLI and the VS Code extension: resumable sessions, code review, sandboxed execution, hooks, skills, MCP, and privacy modes. Local models, BYOK, or AGI managed cloud (public alpha).',
  path: '/agi-code',
});

const REVIEW_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi review --base main' },
  { kind: 'out', text: 'Code Review Results' },
  { kind: 'out', text: 'Severity: MAJOR' },
  { kind: 'out', text: 'send() awaits the whole response before it renders anything.' },
  { kind: 'out', text: '  1. [MAJOR] src/chat/send.ts:7: fetchAll() blocks the first token' },
  { kind: 'out', text: '  2. [MINOR] src/chat/send.ts:9: res.status is returned unchecked' },
];

const REVIEW_HUD = { tokensIn: 9412, tokensOut: 386, cost: '$0.0000', ctx: '11%' };

const HANDOFF_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi session fork qa-triage --at-turn 3 --as stream-first' },
  { kind: 'ok', text: "fork: Forked 'qa-triage' → 'stream-first' (8 messages, at turn 3)." },
  { kind: 'dim', text: '  Resume with: agi --resume stream-first' },
  { kind: 'cmd', text: 'agi session show stream-first' },
  { kind: 'out', text: 'stream-first: 8 messages' },
  { kind: 'dim', text: '  [  0] user        stream the first token, do not await fetchAll' },
  { kind: 'dim', text: '  [  1] assistant   Reading src/chat/send.ts and src/chat/render.ts' },
];

const HANDOFF_HUD = { tokensIn: 18240, tokensOut: 2106, cost: '$0.0000', ctx: '19%' };

export default function AgiCodePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="AGI Code · for developers"
          titleLines={['VS Code starts', 'the same binary', 'as your terminal.']}
          em="same binary"
          lede="AGI Code is the agi binary plus the VS Code extension that drives it. The extension spawns agi app-server over stdio, so both windows read the same sessions, resolve the same model catalog, and answer the same approval requests. If the runtime reports a different model or provider than the editor asked for, the turn is refused."
          ctas={[
            { href: '/cli', label: 'See the CLI' },
            { href: '/vscode-extension', label: 'See AGI in VS Code' },
          ]}
          modeRibbon={[]}
          visual={
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="review"
              routeMode="local"
              session={REVIEW_SESSION}
              hud={REVIEW_HUD}
            />
          }
        />

        <SurfaceIndex
          eyebrow="The stack"
          title="Each surface is a window onto the same running agent."
          lede="Work executes in the terminal: review a diff, apply a patch, run a command under the OS sandbox. The editor is where you ask about code that is already open, with the file and selection you are looking at attached to the question."
          items={[
            {
              index: '01',
              name: 'AGI CLI',
              tagline: 'The Rust runtime both surfaces talk to.',
              body: 'agi review reads your working diff, or main...HEAD with --base, and returns findings ranked clean, minor, major, or critical with file and line. agi apply lands a session diff as a git patch. agi sandbox runs a command under the OS sandbox. agi app-server exposes the whole thing to an editor over stdio.',
              capabilities: [
                'agi review · ranked findings',
                'agi apply · diff as a git patch',
                'agi session fork --at-turn',
                'agi sandbox · Seatbelt or bubblewrap',
                'Offline against a local model',
              ],
              platforms: 'macOS · Linux · Windows',
              status: SURFACE_STATUS.cli,
              href: '/cli',
              visual: <DiffWindow />,
            },
            {
              index: '02',
              name: 'AGI in VS Code',
              tagline: 'A chat participant wired to that runtime.',
              body: 'Mention @agi in the chat panel and the extension attaches your active file, the text you selected, its language, and the lines around it. The slash commands act on that selection, except /model, which switches the provider behind it. By default nothing reaches disk until you pick Apply Inline; the alternative opens the answer in a tab beside your code.',
              capabilities: [
                '@agi · chat participant',
                '/explain /fix /refactor /tests /docs /model',
                'Spawns agi app-server over stdio',
                'Apply Inline, or open in a new tab',
                'Threads scoped to the open workspace',
              ],
              platforms: 'VS Code',
              status: SURFACE_STATUS.vscode,
              href: '/vscode-extension',
              visual: <ProductFrame variant="editor" title="AGI · VS Code" badge="@agi" />,
            },
          ]}
        />

        <DevBand
          eyebrow="Handoff"
          title="A session you started in the terminal is already waiting in the editor."
          body="Sessions are files under ~/.agiworkforce/managed_sessions. agi session fork splits one at any turn into a new named session, and agi --resume picks it back up. The extension reads that same directory through agi app-server, lists only the threads belonging to the workspace you have open, and hands the runtime's approval requests to you inside the editor."
          ctas={[{ href: '/agent-permissions', label: 'See how approvals work' }]}
          visual={
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="sessions"
              routeMode="local"
              session={HANDOFF_SESSION}
              hud={HANDOFF_HUD}
            />
          }
        />

        <CapabilityGrid
          eyebrow="Capabilities"
          title="Everything below is already in the source."
          items={[
            {
              meta: 'Review',
              title: 'agi review',
              body: 'Reads the staged and unstaged diff, or a branch range with --base, and prints an overall severity plus one line per finding with the file and line number attached.',
              href: '/cli',
            },
            {
              meta: 'Sessions',
              title: 'Fork at a turn',
              body: 'agi session fork takes --at-turn to cut a session at a specific user turn and --as to name the copy. The original is untouched, and both stay listable.',
              href: '/cli',
            },
            {
              meta: 'Sandbox',
              title: 'Seatbelt and bubblewrap',
              body: 'agi sandbox runs a command under macOS Seatbelt or Linux bubblewrap. If that binary is missing from PATH, sandboxed exec stops and tells you how to install it.',
              href: '/cli',
            },
            {
              meta: 'Editor context',
              title: 'What @agi can see',
              body: 'Your active file, the text you selected, its language, and 50 lines on either side of the selection. The agiWorkforce.contextLines setting changes that number.',
              href: '/vscode-extension',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Watch the download page for both surfaces."
          body="Neither developer surface is installable yet. The agi binary is not published to a package registry, and AGI in VS Code is distributed as a VSIX to preview users. The download page tracks both, and it is where that changes first."
          ctas={[
            { href: '/download', label: 'Check availability' },
            { href: '/local', label: 'See what runs offline' },
          ]}
          stamp={`AGI CLI · ${SURFACE_STATUS.cli} · AGI in VS Code · ${SURFACE_STATUS.vscode}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
