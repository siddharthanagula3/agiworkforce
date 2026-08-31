import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { DevBand, FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { ApprovalWindow } from '@/features/marketing/components/ShowcaseScenes';
import type { TerminalLine } from '@/features/marketing/components/DeviceMockups';

export const metadata = buildMetadata({
  title: 'AGI Tools & Connectors | MCP Servers, OAuth Apps & Tool Permissions',
  description:
    'How a tool call is gated inside AGI: the mode check, the per-tool default, the approval prompt that opens on No, the 120-second timeout that cancels rather than approves, and the tools no standing grant can answer for.',
  path: '/features/tools',
});

const GAP = '\u00a0\u00a0';

const APPROVAL_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'clear the stale build cache, then rerun the suite' },
  { kind: 'dim', text: `✔${GAP}▤ read_file${GAP}package.json` },
  { kind: 'out', text: `•${GAP}$ run_command${GAP}$ rm -rf node_modules/.cache` },
  { kind: 'ok', text: 'Tool Approval' },
  { kind: 'out', text: 'This command could be destructive. Allow it?' },
  { kind: 'dim', text: `${GAP}${GAP}Force-delete node_modules/.cache recursively` },
  { kind: 'out', text: `Yes${GAP}[No]${GAP}Allow Session${GAP}Always Allow${GAP}Deny All` },
  { kind: 'dim', text: `←/→ move${GAP}Enter confirm${GAP}Esc = No` },
];

const NEVER_REMEMBERABLE = [
  'set_auto_approve_all',
  'set_agent_mode:autopilot',
  'set_tool_approval_policy',
  'execute_code',
  'code_execute',
  'file_write',
  'file_write_text',
  'file_write_binary',
  'file_open_with_default_app',
  'terminal_execute',
  'folder_access',
  'playwright_evaluate',
  'email_send',
  'git_push',
  'cloud_upload',
  'db_execute',
  'browser_execute_async_js',
  'browser_evaluate',
  'browser_execute_in_frame',
];

export default function FeaturesToolsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow="Features · Tool permissions"
          titleLines={[
            'The agent asks you before it acts,',
            'and for nineteen tools it asks every time.',
          ]}
          em="asks you before it acts"
          lede="MCP servers, OAuth connectors and shell commands all arrive at the same gate. A tool call is a request, and a permission you never granted is not one the runtime can assume. Below is the order that gate actually runs in, and the tools it refuses to stop asking about."
          modeRibbon={[]}
          ctas={[
            { href: '/agent-permissions', label: 'Read the permission reference' },
            { href: '/connectors', label: 'See what connects' },
          ]}
          visual={
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="approval pending"
              routeMode="local"
              session={APPROVAL_SESSION}
              hud={{ tokensIn: 4180, tokensOut: 312, cost: '$0.0000', ctx: '11%' }}
            />
          }
        />

        <LedgerSection
          eyebrow="The gate order"
          title="A tool call gets past all of this before it runs."
          rows={[
            {
              k: 'Mode',
              v: 'AGI Desktop carries an agent mode. In Safe and Plan the agent may call only read-only tools, so a write is refused before a prompt is even offered. The mode is stored, not held in memory, so a restriction you set survives the next launch.',
            },
            {
              k: 'Default',
              v: 'A connector tool you have never ruled on is Needs approval. If its name reads as a write (create, update, delete, remove — the default is Blocked instead. Nothing becomes allowed by omission.',
            },
            {
              k: 'The ask',
              v: 'The request carries the tool name, the arguments the model actually wrote, and a risk level. In the CLI overlay the cursor starts on No, so pressing Enter on a prompt you did not read cannot grant it.',
            },
            {
              k: 'Silence',
              v: 'The desktop dialog holds the call open for 120 seconds and then cancels it. An unanswered prompt returns an error to the caller; it is never counted as a yes.',
            },
            {
              k: 'Reach',
              v: 'Inside Local mode the CLI will only open a stdio MCP server. SSE and Streamable HTTP are network egress even when their tool schemas look read-only, so neither is offered there.',
            },
          ]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-tools-standing-title">
          <p className="agi-fl-eyebrow">Standing grants</p>
          <h2 id="agi-tools-standing-title" className="agi-fl-h2">
            Some tools refuse to remember your answer.
          </h2>
          <p className="agi-fl-section-lede">
            Always allow, an approval scoped to the session, and Autopilot are one grant at three
            lengths, so AGI Desktop governs them with one list. Nineteen tools are excluded from all
            three and prompt again on every call: the ones that rewrite the permission model itself,
            the ones that run code or write to your disk, and the ones that publish or destroy data
            outside the app. Every MCP tool is excluded as well, because what a tool does is decided
            by a third-party server and a remembered answer would follow the name after the server
            redefines it.
          </p>
          <ul className="agi-fl-surface-caps">
            {NEVER_REMEMBERABLE.map((tool) => (
              <li key={tool}>{tool}</li>
            ))}
          </ul>
          <p className="agi-fl-section-lede">
            That list is a constant in the desktop source with a test pinning it entry for entry, so
            it cannot quietly get shorter. What the agent may do <em>without</em> asking on each
            surface is written out at{' '}
            <Link href="/agent-permissions">the permission reference</Link>.
          </p>
        </section>

        <DevBand
          eyebrow="Saved rules"
          title="Your saved answers live in a file you can open."
          body="The rules sit in permissions.toml under ~/.agiworkforce, written with owner-only file permissions on macOS and Linux. agi approvals list prints its Allow, Ask, Deny and Workspace tabs; allow, deny, session and remove edit them; export and import carry them to another machine; reset clears them. Matching is by whole token and deny is checked before allow, and a command containing a newline matches no stored rule at all — so an allow for git status cannot be ridden by a second line."
          ctas={[{ href: '/cli', label: 'See the agi CLI' }]}
          visual={<ApprovalWindow />}
        />

        <FinalCta
          eyebrow="Before you trust it"
          title="The gaps are written down too."
          body="The security page sets out where data lives per trust boundary, what is encrypted, what is logged, and which protections stop short — with the gaps named rather than smoothed over. The download page says which installers are verified today."
          ctas={[
            { href: '/security', label: 'Read the security model' },
            { href: '/download', label: 'Check availability' },
          ]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
