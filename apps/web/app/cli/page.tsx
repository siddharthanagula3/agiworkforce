import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'CLI — The operator’s command line | AGI Workforce',
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
  { cmd: 'login', desc: 'Sign in to a provider or our managed cloud' },
  { cmd: 'auth-status', desc: 'Show auth status for every provider' },
  { cmd: 'init', desc: 'Initialize ~/.agiworkforce/' },
  { cmd: 'onboarding', desc: 'Re-run the first-run onboarding' },
];

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
              Source on GitHub →
            </a>
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
