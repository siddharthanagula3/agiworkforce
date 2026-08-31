import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import type { TerminalLine } from '@/features/marketing/components/DeviceMockups';
import { FeatureGrid } from '@/features/marketing/components/LandingSections';
import Link from 'next/link';
import { FinalCta, FlagshipHero } from '@/features/marketing/components/FlagshipSections';
import { LAUNCH, SURFACE_STATUS } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI CLI: the agi agent in your terminal',
  description: `agi is a Rust-native developer agent: resumable sessions, code review, sandboxed execution, hooks, skills, and MCP, offline-capable with local models. ${SURFACE_STATUS.cli}.`,
  path: '/cli',
});

const CI_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi --json-events exec "fix the flaky test" | jq -r .event | uniq' },
  { kind: 'out', text: 'spawning' },
  { kind: 'out', text: 'ready_for_prompt' },
  { kind: 'out', text: 'running_tool' },
  { kind: 'out', text: 'tool_result' },
  { kind: 'out', text: 'message_delta' },
  { kind: 'out', text: 'turn_usage' },
  { kind: 'ok', text: 'finished' },
];

const CI_HUD = { tokensIn: 9840, tokensOut: 612, cost: '$0.0000', ctx: '18%' };

const BOUNDARY_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: '/privacy-settings' },
  { kind: 'out', text: 'Privacy settings' },
  { kind: 'out', text: '  Local file access: explicit workspace roots only' },
  { kind: 'out', text: '  Additional roots: opt-in with --add-dir or /add-dir' },
  { kind: 'out', text: '  Local -> BYOK: explicit only with /continue-with-byok' },
  { kind: 'cmd', text: '/privacy-mode byok' },
  { kind: 'out', text: 'Privacy mode was not changed.' },
  { kind: 'ok', text: 'Local -> BYOK requires an explicit reviewable handoff.' },
];

const BOUNDARY_HUD = { tokensIn: 3180, tokensOut: 241, cost: '$0.0000', ctx: '6%' };

const SUBCOMMANDS: { cmd: string; desc: string }[] = [
  { cmd: 'exec', desc: 'Run a task non-interactively (alias: e)' },
  { cmd: 'review', desc: 'Review the working diff, or a range with --base' },
  { cmd: 'apply', desc: 'Apply the latest diff as a git patch (alias: a)' },
  { cmd: 'sandbox', desc: 'Run a command inside the OS sandbox' },
  { cmd: 'mcp-server', desc: 'Speak MCP over stdio; advertises no tools yet' },
  { cmd: 'app-server', desc: 'Serve an editor over stdio or a WebSocket' },
  { cmd: 'resume', desc: 'Continue a previous session' },
  { cmd: 'fork', desc: 'Fork a previous session' },
  { cmd: 'session', desc: 'List, show, fork, archive, or delete sessions' },
  { cmd: 'history', desc: 'Browse session history' },
  { cmd: 'models', desc: 'List, scan, and set model configuration' },
  { cmd: 'approvals', desc: 'Manage command and file-operation approvals' },
  { cmd: 'execpolicy', desc: 'Show execution policy rules' },
  { cmd: 'features', desc: 'Inspect feature flags' },
  { cmd: 'plugin', desc: 'List and install plugins' },
  { cmd: 'marketplace', desc: 'Search, install, and update marketplace plugins' },
  { cmd: 'ecosystem', desc: 'Scan for installed AI tools and import their MCP configs' },
  { cmd: 'migrate', desc: 'Import settings from another coding CLI' },
  { cmd: 'sync', desc: 'Export and import your settings across machines' },
  { cmd: 'login', desc: 'Sign in to AGI cloud, or a provider over OAuth' },
  { cmd: 'logout', desc: 'Sign out of AGI cloud' },
  { cmd: 'auth-status', desc: 'Show auth status for every configured provider' },
  { cmd: 'doctor', desc: 'Run local preflight diagnostics' },
  { cmd: 'completion', desc: 'Generate a shell completion script' },
  { cmd: 'init', desc: 'Initialize ~/.agiworkforce/ and register the project' },
  { cmd: 'onboarding', desc: 'Re-run the first-run onboarding wizard' },
];

const FEATURES = [
  {
    meta: 'Headless',
    title: 'The run comes back as JSONL',
    body: 'Put --json-events ahead of the subcommand and every lifecycle event lands on stdout as one JSON object: spawning, ready_for_prompt, running_tool, tool_result, message_delta, turn_usage, fallback_triggered, finished. Failures carry a stable kind — api_rate_limit, auth_expired, network, stream_disconnect — so a job can branch on the kind instead of matching an error string.',
  },
  {
    meta: 'Sessions',
    title: 'Fork at the turn it went wrong',
    body: 'Runs persist under ~/.agiworkforce/managed_sessions. agi session show prints the turn-by-turn transcript, and agi session fork --at-turn cuts a copy at one user turn under a name you pick with --as. The original stays as it was, and agi --resume picks either of them back up.',
  },
  {
    meta: 'Sandbox',
    title: 'Tool execution runs boxed',
    body: 'macOS uses Seatbelt, Linux uses bubblewrap, and agi sandbox puts a bare command through the same box. When bwrap or sandbox-exec is missing from PATH the run stops and prints the install line for your distribution rather than quietly running unsandboxed.',
  },
  {
    meta: 'Approvals',
    title: 'Turning the box off is loud',
    body: '--no-sandbox suppresses Seatbelt or bwrap and paints a red no sandbox indicator in the TUI footer for as long as it is off. Riskier tool calls still ask before they run, and agi approvals list, allow, deny, session and remove show and edit the answers you saved.',
  },
  {
    meta: 'Extensibility',
    title: 'Hooks, skills, and markdown commands',
    body: 'Hooks fire on session start and end, before and after every tool call, on prompt submit, around compaction, and at model resolution, where a hook can swap the model before the request leaves the agent. Slash commands are markdown files under .agiworkforce/commands, and a nested file becomes a namespaced command such as /review:security.',
  },
  {
    meta: 'MCP',
    title: 'What agi mcp-server actually does',
    body: 'As a client agi connects MCP servers over stdio, SSE, or Streamable HTTP, with OAuth tokens held in the OS credential store. As a server, agi mcp-server speaks the protocol and answers initialize and tools/list, but advertises an empty tool list on purpose — and its own help text says so instead of implying wiring that is not there.',
  },
  {
    meta: 'Routing',
    title: 'A comma in -m buys a fallback chain',
    body: 'Pass -m with a comma-separated list and a rate limit, a network error, a 5xx, or a dropped stream moves the turn to the next model. The TUI flashes a falling-back banner naming both models and the reason, and a fallback_triggered event goes out on the JSONL stream. Add --demo to watch the rotation fire without waiting for a real 429.',
  },
  {
    meta: 'Cost',
    title: 'The HUD reads the catalog',
    body: 'Tokens in and out, cache reads, dollars spent, and context percentage sit in the top-right of the TUI, and the context figure changes color as the window fills. Prices resolve from the shared models catalog rather than a table typed into the CLI.',
  },
];

export default function CliPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <FlagshipHero
          eyebrow={`AGI CLI · ${SURFACE_STATUS.cli}`}
          titleLines={['For every step the', 'agent takes, a JSON', 'line comes out.']}
          em="every step"
          lede="The agent is a single Rust program, and it does not need a person at the prompt. Put --json-events before the subcommand and stdout becomes JSONL: one object per lifecycle event, covering every tool call, every model rotation, and the token count for each turn. A pipeline reads the run instead of scraping it."
          ctas={[
            { href: '/download#cli-downloads', label: 'Check availability' },
            { href: '/agi-code', label: 'See it with the editor' },
          ]}
          modeRibbon={[]}
          visual={
            <ProductFrame
              variant="terminal"
              title="agi · ci"
              badge="json-events"
              routeMode="byok"
              session={CI_SESSION}
              hud={CI_HUD}
            />
          }
        />

        <FeatureGrid
          eyebrow="Capabilities"
          title="Every capability here has a command behind it."
          items={FEATURES}
        />

        <section className="agi-fl-section" aria-labelledby="agi-fl-cli-subcommands-title">
          <p className="agi-fl-eyebrow">Subcommands</p>
          <h2 id="agi-fl-cli-subcommands-title" className="agi-fl-h2">
            This is the list agi help prints.
          </h2>
          <p className="agi-fl-section-lede">
            Aliases exist where they earn their keep: e for exec, a for apply, completions for
            completion. Run agi with no subcommand and you land in the interactive TUI instead,
            where --no-tui drops you to the line-based REPL.
          </p>
          {/* The complete subcommand list is reference material - it belongs in
              docs, and repeating it open on a marketing page put twenty-five
              rows between the reader and the next thing worth reading. It stays
              here because it is true and someone evaluating the CLI may want
              it, but it opens on demand. */}
          <details className="agi-compare-disclosure">
            <summary className="agi-compare-summary">
              <span>Every subcommand</span>
              <span className="agi-compare-summary-hint">{SUBCOMMANDS.length} commands</span>
            </summary>
            <div>
              <table className="agi-ledger">
                <tbody>
                  {SUBCOMMANDS.map((s) => (
                    <tr key={s.cmd}>
                      <td
                        style={{ fontFamily: 'var(--agi-font-mono)', textTransform: 'lowercase' }}
                      >
                        {s.cmd}
                      </td>
                      <td>{s.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>

        {/* The terminal is the artifact on this page, so it takes the whole
            stage on true black rather than a column beside a paragraph. The
            session below refuses a privacy-mode switch mid-run; that exchange
            is the argument, and it reads better than a description of it. */}
        <section
          className="agi-stage agi-stage--void agi-terminal-stage"
          aria-labelledby="agi-cli-boundary-title"
        >
          <div className="agi-terminal-stage-caption">
            <p className="agi-fl-eyebrow">At the prompt</p>
            <h2 id="agi-cli-boundary-title" className="agi-fl-h2">
              A local session will not silently become a remote one.
            </h2>
          </div>

          <div className="agi-terminal-stage-frame">
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="privacy"
              routeMode="local"
              session={BOUNDARY_SESSION}
              hud={BOUNDARY_HUD}
            />
          </div>

          <div className="agi-fl-cta-row">
            <Link href="/local" className="agi-fl-cta agi-fl-cta--ghost">
              Run it against a local model
            </Link>
            <Link href="/byok" className="agi-fl-cta agi-fl-cta--ghost">
              Set up BYOK
            </Link>
          </div>
        </section>

        <FinalCta
          eyebrow={SURFACE_STATUS.cli}
          title="There is no build to hand you yet."
          body="When archives are published the download page will show them: it asks the release channel as it loads and lists only the platforms it can confirm, for macOS, Linux and Windows alike. Until then the launch list is the honest way to hear about it, and the permission reference already sets out what the agent may do before it asks."
          ctas={[
            { label: LAUNCH.ctaLabel, waitlist: true },
            { href: '/agent-permissions', label: 'See what runs without asking' },
          ]}
          stamp={`AGI CLI · ${SURFACE_STATUS.cli}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
