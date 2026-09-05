import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { TerminalWindow } from '@/features/marketing/components/DeviceMockups';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  MarketingFooter,
  Prose,
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { SURFACE_STATUS } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'AGI CLI: the agi agent in your terminal',
  description: `agi is a Rust-native developer agent: resumable sessions, code review, sandboxed execution, hooks, skills, and MCP, offline-capable with local models. ${SURFACE_STATUS.cli}.`,
  path: '/cli',
});

const SUBCOMMANDS: { cmd: string; desc: string }[] = [
  { cmd: 'exec', desc: 'Run a task non-interactively (alias: e)' },
  { cmd: 'review', desc: 'Review the working diff, or a range with --base' },
  { cmd: 'apply', desc: 'Apply the latest diff as a git patch (alias: a)' },
  { cmd: 'sandbox', desc: 'Run a command inside the OS sandbox' },
  { cmd: 'mcp-server', desc: 'Speak MCP over stdio; advertises an empty tool list on purpose' },
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

const CAPABILITIES = [
  {
    meta: 'Headless',
    title: 'The run comes back as JSONL',
    body: 'Every lifecycle event lands on stdout as one JSON object: spawning, ready_for_prompt, running_tool, tool_result, message_delta, turn_usage, fallback_triggered, finished. Failures carry a stable kind, such as api_rate_limit or auth_expired, so a job can branch on the kind instead of matching an error string.',
  },
  {
    meta: 'Sessions',
    title: 'Fork at the turn it went wrong',
    body: 'Runs persist under ~/.agiworkforce/managed_sessions. agi session fork --at-turn cuts a copy at one user turn under a name you pick with --as. The original stays as it was, and agi --resume picks either of them back up.',
  },
  {
    meta: 'Sandbox',
    title: 'Tool execution runs boxed',
    body: 'macOS uses Seatbelt, Linux uses bubblewrap, and agi sandbox puts a bare command through the same box. When the sandbox binary is missing from PATH the run stops and prints the install line for your distribution.',
  },
  {
    meta: 'Approvals',
    title: 'Turning the box off is loud',
    body: '--no-sandbox suppresses Seatbelt or bwrap and keeps a no sandbox indicator in the TUI footer for as long as it is off. agi approvals list, allow, deny, session and remove show and edit the answers you saved.',
  },
  {
    meta: 'Extensibility',
    title: 'Hooks, skills, and markdown commands',
    body: 'Hooks fire on session start and end, before and after every tool call, on prompt submit, and at model resolution. Slash commands are markdown files under .agiworkforce/commands, and a nested file becomes a namespaced command such as /review:security.',
  },
  {
    meta: 'MCP',
    title: 'What agi mcp-server does',
    body: 'As a client, agi connects MCP servers over stdio, SSE, or streamable HTTP, with OAuth tokens held in the OS credential store. As a server, agi mcp-server answers initialize and tools/list but advertises an empty tool list on purpose.',
  },
  {
    meta: 'Routing',
    title: 'A comma in -m buys a fallback chain',
    body: 'Pass -m with a comma-separated list and a rate limit, a network error, a 5xx, or a dropped stream moves the turn to the next model. A fallback_triggered event goes out on the JSONL stream when it happens.',
  },
  {
    meta: 'Cost',
    title: 'The HUD reads the catalog',
    body: 'Tokens in and out, cache reads, dollars spent, and context percentage sit in the top-right of the TUI. Prices resolve from the shared models catalog rather than a table typed into the CLI.',
  },
] as const;

export default function CliPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-cli-hero-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>AGI CLI</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-cli-hero-title">
                Every step the agent takes <em className="agi-ds-accent">prints a JSON line.</em>
              </h1>
              <Prose size="lg">
                The agent is a single Rust program and does not need a person at the prompt. Put
                --json-events before the subcommand and stdout becomes JSONL: one object per
                lifecycle event, every tool call, every model rotation, every turn&rsquo;s token
                count. A pipeline reads the run instead of scraping it.
              </Prose>
              <ButtonRow>
                <Button href="/download#cli-downloads">Get the CLI archives</Button>
                <Button href="/agi-code" variant="secondary">
                  See it with the editor
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <TerminalWindow />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-cli-status-title">
          <div className="agi-ds-container">
            <h2 className="agi-ds-h2" id="agi-cli-status-title">
              What is published today.
            </h2>
            <div style={{ marginTop: '2rem' }}>
              <SurfaceStatus
                state="live"
                name="AGI CLI"
                detail={`${SURFACE_STATUS.cli}. Five signed archives for macOS, Linux, and Windows, each checked against a Sigstore signature.`}
                action={{ label: 'See the release table', href: '/download#cli-downloads' }}
              />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-cli-capabilities-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Capabilities</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-cli-capabilities-title">
                Every capability here has a command behind it.
              </h2>
            </div>
            <div className="agi-ds-grid-2">
              {CAPABILITIES.map((item) => (
                <div className="agi-ds-card" style={{ padding: '1.5rem' }} key={item.title}>
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-cli-subcommands-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Subcommands</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-cli-subcommands-title">
                This is the list agi help prints.
              </h2>
              <Prose>
                Aliases exist where they earn their keep: e for exec, a for apply, completions for
                completion. Run agi with no subcommand and you land in the interactive TUI instead,
                where --no-tui drops you to the line-based REPL.
              </Prose>
            </div>
            <details>
              <summary className="agi-ds-navlink" style={{ cursor: 'pointer' }}>
                Every subcommand ({SUBCOMMANDS.length})
              </summary>
              <Ledger
                caption="agi subcommands"
                rows={SUBCOMMANDS.map((s) => ({ label: s.cmd, value: s.desc }))}
              />
            </details>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-cli-boundary-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>At the prompt</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-cli-boundary-title">
                A local session will not silently become a remote one.
              </h2>
            </div>
            <Prose size="lg">
              /privacy-mode reports the session&rsquo;s current authority, local, byok, or managed,
              and refuses a switch typed at the prompt: running /privacy-mode byok on a local
              session leaves the mode unchanged and prints that the move needs an explicit,
              reviewable handoff. /continue-with-byok is that handoff. It forks a new session with
              no history, runs a secret scan over the messages you pick for it, and shows the exact
              payload with counts of what was included, excluded, and truncated before it sends
              anything.
            </Prose>
          </div>
        </section>

        <section className="agi-lp-close" aria-labelledby="agi-cli-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-cli-close-title">
                Set it up against <em className="agi-ds-accent">a local model or a key.</em>
              </h2>
              <Prose size="lg">
                The CLI reaches every lane: a model on your own hardware, your own provider key in
                the OS keyring, or AGI Cloud once you sign in.
              </Prose>
              <ButtonRow>
                <Button href="/local" variant="secondary">
                  Run it against a local model
                </Button>
                <Button href="/byok" variant="secondary">
                  Set up a provider key
                </Button>
                <Button href="/agent-permissions" variant="secondary">
                  See what runs without asking
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
