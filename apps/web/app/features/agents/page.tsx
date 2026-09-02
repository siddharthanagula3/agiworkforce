import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import type { TerminalLine } from '@/features/marketing/components/DeviceMockups';
import { FeatureGrid } from '@/features/marketing/components/LandingSections';
import { DevBand, FinalCta } from '@/features/marketing/components/FlagshipSections';
import { NOTIFY_CTA } from '../../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI Agents: delegated work that stops to ask',
  description:
    'An AGI agent is a tool-using session you hand work to: agent definition files, parallel subagents, and lifecycle hooks in the agi CLI. Risky steps open an approval whose cursor starts on No, and commands run inside an OS sandbox.',
  path: '/features/agents',
});

const APPROVAL_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi --agent migrations "drop the orphaned scratch tables"' },
  { kind: 'dim', text: '  [task] Spawning subagent subagent_1 — inventory scratch tables' },
  { kind: 'out', text: 'run_command  rm -rf tmp/scratch-2026-08' },
  { kind: 'dim', text: '┌─ Tool Approval ───────────────────────────────────────────┐' },
  { kind: 'out', text: '  This command could be destructive. Allow it?' },
  { kind: 'dim', text: '    Force-delete tmp/scratch-2026-08 recursively' },
  { kind: 'ok', text: '   Yes    [No]    Allow Session    Always Allow    Deny All' },
  { kind: 'dim', text: '  ←/→ move   Enter confirm   Esc = No' },
  { kind: 'dim', text: '└───────────────────────────────────────────────────────────┘' },
];

const APPROVAL_HUD = { tokensIn: 14620, tokensOut: 1180, cost: '$0.0000', ctx: '18%' };

const DEFINITION_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: '/subagents' },
  { kind: 'out', text: 'Configured subagents (2)' },
  { kind: 'out', text: '  migrations' },
  { kind: 'dim', text: '    when to use: schema changes and data backfills' },
  { kind: 'dim', text: '    model:       (inherits parent)' },
  { kind: 'dim', text: '    tools:       read_file, search_files, run_command' },
  { kind: 'out', text: '  release-notes' },
  { kind: 'dim', text: '    when to use: turn a merged diff into a changelog entry' },
  { kind: 'dim', text: '    tools:       read_file, write_file' },
];

const DEFINITION_HUD = { tokensIn: 2140, tokensOut: 96, cost: '$0.0000', ctx: '4%' };

const SANDBOX_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: '/sandbox' },
  { kind: 'out', text: '  Sandbox' },
  { kind: 'out', text: '    Mode:    contained' },
  { kind: 'out', text: '    Allowed: read-only ops + write_file & edit_file (with' },
  { kind: 'dim', text: '             confirmation), run_command (with confirmation)' },
  { kind: 'out', text: '    Blocked: apply_patch without confirmation, raw shell beyond cwd' },
  { kind: 'dim', text: '    Set via:     --permission-mode <auto|approve|skip> at startup' },
  { kind: 'dim', text: '    Enforced by: agiworkforce-sandbox-policy (macOS Seatbelt / bwrap)' },
  { kind: 'dim', text: '  Esc to close' },
];

const SANDBOX_HUD = { tokensIn: 6180, tokensOut: 402, cost: '$0.0000', ctx: '9%' };

const ANATOMY = [
  {
    meta: 'Define',
    title: 'The definition is a file',
    body: 'A markdown file with frontmatter: a name, a description of when to use it, an optional model, and the tools it may or may not call. Project definitions sit in .agiworkforce/agents; global ones live in your home directory. Start a session on one with --agent.',
    href: '/cli',
  },
  {
    meta: 'Fan out',
    title: 'Subagents run beside you',
    body: 'The task tool spawns a subagent on its own thread. It reports as running, completed, failed, or cancelled, and hands back its output together with the files it modified. Seven run at once, and the tree stops three levels deep.',
    href: '/agi-code',
  },
  {
    meta: 'Observe',
    title: 'Hooks on the session lifecycle',
    body: 'Handlers fire on session start, on prompt submit, before and after a tool call, on a permission request, and on stop. That is where your own guardrails, logs, and automations attach.',
    href: '/features/plugins',
  },
];

export default function FeaturesAgentsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-agents-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">AGI Agents</p>
          <h1 id="agi-fl-agents-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">
              Delegation only works if <em className="agi-fl-h1-em">the default is no</em>.
            </span>
          </h1>
          <p className="agi-fl-lede">
            An agent is a session you hand work to: it reads files, runs commands, calls connectors,
            and reports back with what it changed. Every risky step opens an approval you have to
            answer, and the commands themselves run inside an OS sandbox the CLI refuses to start
            without.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/cli" className="agi-fl-cta agi-fl-cta--primary">
              See the agi CLI
            </Link>
            <Link href="/agent-permissions" className="agi-fl-cta agi-fl-cta--secondary">
              Read the permission model
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Agent highlights">
            <li>Approvals · explicit</li>
            <li>Sandbox · on by default</li>
            <li>Network · off by default</li>
          </ul>

          <div className="agi-fl-hero-console">
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="approval"
              routeMode="local"
              session={APPROVAL_SESSION}
              hud={APPROVAL_HUD}
              className="agi-fl-hero-frame--main"
            />
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="agents"
              routeMode="local"
              session={DEFINITION_SESSION}
              hud={DEFINITION_HUD}
              className="agi-fl-hero-frame--terminal"
            />
          </div>
        </section>

        <FeatureGrid
          eyebrow="Anatomy"
          title="An agent is a session you named and narrowed."
          items={ANATOMY}
        />

        <section className="agi-fl-section" aria-labelledby="agi-fl-agents-defaults-title">
          <p className="agi-fl-eyebrow">Defaults</p>
          <h2 id="agi-fl-agents-defaults-title" className="agi-fl-h2">
            Where a setting could have gone either way, it shipped closed.
          </h2>
          <p className="agi-fl-section-lede">
            Delegation is only as good as what happens when nobody is watching the screen. These are
            the values the code picks when you have not picked one.
          </p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Approval</td>
                <td>
                  The overlay opens with the cursor parked on No, held there by an assertion the
                  build checks. Hitting Enter on a prompt you did not read denies the call.
                </td>
              </tr>
              <tr>
                <td>Your answer</td>
                <td>
                  Yes allows one call and persists nothing. Allow Session lasts until you quit.
                  Always Allow is written to the permission store on disk, and /permissions reset
                  clears it again. Deny All cancels the rest of the turn.
                </td>
              </tr>
              <tr>
                <td>Sandbox</td>
                <td>
                  Command execution asks the OS for a sandbox: Seatbelt on macOS, bubblewrap on
                  Linux. When neither is present the run fails rather than quietly continuing
                  without one. Passing --no-sandbox is the way past, and it prints a warning.
                </td>
              </tr>
              <tr>
                <td>Network</td>
                <td>
                  A sandboxed command has no outbound network. An install, a clone, or an API call
                  has to be granted it explicitly.
                </td>
              </tr>
              <tr>
                <td>Subagents</td>
                <td>
                  A subagent inherits the parent&rsquo;s model, permission mode, and tool filters. A
                  named definition can narrow that set further and can never widen it.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <DevBand
          eyebrow="Containment"
          title="The session will tell you what its sandbox allows."
          body="Typing /sandbox prints the mode the session is running under, the tools it allows, the ones it blocks, and the backend enforcing it. The modes are read-only, contained, and unrestricted. Which route a session's tokens travel on is a separate boundary, covered on the Local page."
          ctas={[{ href: '/local', label: 'Read the routing boundary' }]}
          visual={
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="sandbox"
              routeMode="local"
              session={SANDBOX_SESSION}
              hud={SANDBOX_HUD}
            />
          }
        />

        <FinalCta
          eyebrow="AGI CLI"
          title="Write one agent file and hand it a task."
          body="Agent definitions, parallel subagents, lifecycle hooks, the approval overlay, and the OS sandbox are all in the agi CLI source today."
          ctas={[{ href: NOTIFY_CTA.href, label: NOTIFY_CTA.label }]}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
