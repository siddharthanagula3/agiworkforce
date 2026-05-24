import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: "CLI — The operator's command line | AGI",
  description:
    'Pure Rust. Ratatui TUI. Same engine that powers every other surface. The CLI is the product; the apps are surfaces over it.',
  alternates: { canonical: 'https://agiworkforce.com/cli' },
};

const SUBCOMMANDS: { cmd: string; desc: string }[] = [
  { cmd: 'exec', desc: 'Run a task non-interactively' },
  { cmd: 'review', desc: 'Non-interactive code review' },
  { cmd: 'apply', desc: 'Apply latest diff as a git patch' },
  { cmd: 'sandbox', desc: 'Run a command inside a sandbox' },
  { cmd: 'mcp-server', desc: 'Run as an MCP server (stdio)' },
  { cmd: 'app-server', desc: 'Run the app server for IDE integration' },
  { cmd: 'resume', desc: 'Continue a previous session' },
  { cmd: 'fork', desc: 'Fork a previous session' },
  { cmd: 'session', desc: 'Inspect or branch sessions' },
  { cmd: 'plugin', desc: 'Manage plugins' },
  { cmd: 'history', desc: 'Browse session history' },
  { cmd: 'login', desc: 'Sign in to a provider or configure BYOK' },
  { cmd: 'auth-status', desc: 'Show auth status for every provider' },
  { cmd: 'init', desc: 'Initialize ~/.agiworkforce/' },
  { cmd: 'onboarding', desc: 'Re-run the first-run onboarding' },
];

const FEATURES = [
  {
    label: 'Non-interactive exec',
    body: 'agiworkforce exec is the headless mode. Pipe a task in, get an answer out. Ships to CI without a TUI.',
  },
  {
    label: 'Ratatui TUI',
    body: 'Full interactive terminal UI in 256-color. Model switcher, tool call trace, and diff viewer built in.',
  },
  {
    label: 'Session replay',
    body: 'Every tool call is journaled. Resume, fork, and branch any past session. Full reproducibility.',
  },
  {
    label: 'Sandboxed by default',
    body: 'macOS Seatbelt + Linux bwrap on by default for dangerous tools: file writes, shell exec, network.',
  },
  {
    label: 'MCP server mode',
    body: 'Run as an MCP server over stdio. Connects AGI to Claude Code, Cursor, and any MCP client.',
  },
  {
    label: 'Plugin system',
    body: '150+ built-in skills. Extend with your own plugins via the plugin manifest format.',
  },
  {
    label: 'BYOK across providers',
    body: '10+ providers. Keys stored in system keychain. Switch provider per session with --provider flag.',
  },
  {
    label: 'Multi-platform',
    body: 'macOS, Linux, WSL. Install via Homebrew, cargo, or the one-line curl installer.',
  },
];

/** Terminal-style screenshot placeholder. */
function TerminalScreenshot({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule-strong)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: 'var(--agi-bg-3)',
          borderBottom: '1px solid var(--agi-rule)',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--agi-rule-strong)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--agi-rule-strong)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--agi-rule-strong)',
            display: 'inline-block',
          }}
        />
        <span
          style={{
            marginLeft: 8,
            fontSize: 11,
            color: 'var(--agi-ink-quiet)',
            fontFamily: 'var(--mono)',
          }}
        >
          zsh &mdash; {title}
        </span>
      </div>
      <div
        style={{
          padding: '28px 20px',
          minHeight: 140,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background: 'linear-gradient(135deg, var(--agi-card) 0%, var(--agi-amber-soft) 100%)',
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--agi-amber)',
            margin: 0,
          }}
        >
          Screenshot
        </p>
        <p
          style={{
            fontSize: 13,
            color: 'var(--agi-ink-2)',
            textAlign: 'center',
            maxWidth: 300,
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {description}
        </p>
      </div>
    </div>
  );
}

export default function CliPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">agiworkforce — the operator&rsquo;s CLI.</h1>
          <p className="agi-page-lede">
            Pure Rust. Ratatui TUI. Same engine that powers every other surface.{' '}
            <strong>The CLI is the product. The apps are surfaces over it.</strong>
          </p>
          <div className="agi-cta-row">
            <Link href="/download" className="agi-cta-primary">
              Install
            </Link>
            <a
              href="https://github.com/siddharthanagula3/agiworkforce"
              target="_blank"
              rel="noopener noreferrer"
              className="agi-cta-ghost"
            >
              Source on GitHub &rarr;
            </a>
          </div>
        </section>

        {/* ---- SCREENSHOTS ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">How it looks</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            <TerminalScreenshot
              title="interactive TUI"
              description="Ratatui interactive mode with model switcher, streaming output, and tool call trace visible in the sidebar."
            />
            <TerminalScreenshot
              title="agiworkforce exec"
              description="Headless exec mode running a code review task in CI. stdin task, stdout structured diff, exit 0."
            />
            <TerminalScreenshot
              title="agiworkforce session"
              description="Session browser showing past runs with fork and resume options. Every tool call is journaled and replayable."
            />
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Install — pick one</p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">~/agi-workforce — install</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-comment"># Homebrew (macOS, Linux)</span>
              {'\n'}
              <span className="agi-terminal-prompt">$</span>brew install
              siddharthanagula3/tap/agiworkforce
              {'\n'}
              {'\n'}
              <span className="agi-terminal-comment"># cargo (any platform)</span>
              {'\n'}
              <span className="agi-terminal-prompt">$</span>cargo install agiworkforce-cli
              {'\n'}
              {'\n'}
              <span className="agi-terminal-comment"># curl (macOS, Linux, WSL)</span>
              {'\n'}
              <span className="agi-terminal-prompt">$</span>curl -fsSL
              https://agiworkforce.com/install.sh | sh
              {'\n'}
              {'\n'}
              <span className="agi-terminal-comment"># first run</span>
              {'\n'}
              <span className="agi-terminal-prompt">$</span>agiworkforce login
              {'\n'}
              <span className="agi-terminal-prompt">$</span>agiworkforce exec &quot;your first
              task&quot;
            </pre>
          </div>
        </section>

        {/* ---- FEATURES GRID ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">Features</p>
          <ul className="agi-perks-grid" style={{ marginTop: 24 }} aria-label="CLI features">
            {FEATURES.map((f) => (
              <li key={f.label} className="agi-perk-card">
                <p className="agi-perk-title">{f.label}</p>
                <p className="agi-perk-description">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">What it does</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Non-interactive runs</h3>
              <p className="agi-reason-p">
                <code>agiworkforce exec</code> is the headless mode — pipe a task, get an answer,
                ship to CI. No TUI, no editor, just stdin/stdout.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Sessions you can replay</h3>
              <p className="agi-reason-p">
                Resume, fork, and branch any past session. Every run is reproducible because every
                tool call is journaled.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Sandboxed by default</h3>
              <p className="agi-reason-p">
                macOS Seatbelt and Linux bwrap on by default for dangerous tools — file writes,
                shell execution, network access.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Subcommands</p>
          <table className="agi-ledger">
            <tbody>
              {SUBCOMMANDS.map((s) => (
                <tr key={s.cmd}>
                  <td style={{ fontFamily: 'var(--agi-font-mono)', textTransform: 'lowercase' }}>
                    {s.cmd}
                  </td>
                  <td>{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
