import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'VS Code Extension — Multi-provider coding assistant | AGI',
  description:
    '10+ providers in one VS Code extension. A standalone AGI chat panel for code questions, refactors, and slash commands. Bring your own keys.',
  alternates: { canonical: 'https://agiworkforce.com/vscode-extension' },
};

const SLASH: { cmd: string; desc: string }[] = [
  { cmd: '/explain', desc: 'Explain the selection in plain language' },
  { cmd: '/fix', desc: 'Find and fix bugs in the selection' },
  { cmd: '/refactor', desc: 'Suggest or apply refactoring' },
  { cmd: '/tests', desc: 'Generate unit tests for the selection' },
  { cmd: '/docs', desc: 'Write doc comments for the selection' },
  { cmd: '/model', desc: 'Switch the active provider and model' },
];

const FEATURES = [
  {
    label: 'AGI chat panel',
    body: 'A dedicated sidebar panel for code questions, refactors, and slash commands. Runs independently in VS Code without depending on Copilot or any other extension.',
  },
  {
    label: 'Multi-provider switching',
    body: '10+ providers available. Status-bar picker lets you swap model mid-session without leaving the editor.',
  },
  {
    label: 'BYOK',
    body: 'Bring your own keys. Pay providers directly. No AGI subscription required to use the editor extension.',
  },
  {
    label: 'Desktop bridge (optional)',
    body: 'Connect to AGI Desktop on localhost:8787 to unlock computer-use, full tool call routing, and multi-model pipelines.',
  },
];

/** Inline screenshot placeholder — styled to look like a code editor panel. */
function EditorScreenshot({ label, description }: { label: string; description: string }) {
  return (
    <div
      style={{
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule-strong)',
        borderRadius: 10,
        overflow: 'hidden',
      }}
    >
      {/* Editor title bar */}
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
            width: 10,
            height: 10,
            borderRadius: 2,
            background: 'var(--agi-amber-soft)',
            border: '1px solid var(--agi-amber)',
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: 'var(--agi-ink-2)',
            fontFamily: 'var(--mono)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </div>
      {/* Content area */}
      <div
        style={{
          padding: '28px 20px',
          minHeight: 140,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          background: `linear-gradient(135deg, var(--agi-card) 0%, var(--agi-amber-soft) 100%)`,
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

export default function VscodeExtensionPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Multi-provider coding assistant.</h1>
          <p className="agi-page-lede">
            10+ providers in one VS Code extension. A standalone AGI chat panel for code questions,
            refactors, and slash commands.{' '}
            <strong>Not locked to one model. Bring your own keys, pay providers directly.</strong>
          </p>
          <div className="agi-cta-row">
            <a
              href="https://github.com/siddharthanagula3/agiworkforce/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="agi-cta-primary"
            >
              Install via VSIX
            </a>
            <Link href="/providers" className="agi-cta-ghost">
              See the providers &rarr;
            </Link>
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
            <EditorScreenshot
              label="AGI chat panel"
              description="Standalone AGI sidebar panel answering a question about the open file. Runs independently without Copilot or other extensions."
            />
            <EditorScreenshot
              label="Provider switcher"
              description="Status-bar model picker showing available providers. Switch mid-session without leaving the editor or touching a config file."
            />
          </div>
        </section>

        {/* ---- FEATURES GRID ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">Features</p>
          <ul
            className="agi-perks-grid"
            style={{ marginTop: 24 }}
            aria-label="VS Code extension features"
          >
            {FEATURES.map((f) => (
              <li key={f.label} className="agi-perk-card">
                <p className="agi-perk-title">{f.label}</p>
                <p className="agi-perk-description">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">What you get</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">AGI chat panel</h3>
              <p className="agi-reason-p">
                A dedicated sidebar panel. Ask questions, request refactors, run slash commands
                without leaving the editor. No dependency on Copilot or other extensions.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Multi-provider switching</h3>
              <p className="agi-reason-p">
                10+ providers in the status-bar picker. Switch model mid-session without leaving the
                editor or touching a config file.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">BYOK</h3>
              <p className="agi-reason-p">
                Bring your own keys. Pay providers directly. No AGI subscription required to use the
                editor extension.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Slash commands</p>
          <table className="agi-ledger">
            <tbody>
              {SLASH.map((s) => (
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
        <section className="agi-section">
          <p className="agi-section-eyebrow">Distribution</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Marketplace</td>
                <td>Listing in review — install via VSIX from GitHub Releases</td>
              </tr>
              <tr>
                <td>Cursor / forks</td>
                <td>Compatible with VS Code forks — install the same VSIX</td>
              </tr>
              <tr>
                <td>Desktop bridge</td>
                <td>Optional — connects to desktop on localhost:8787 for full computer use</td>
              </tr>
              <tr>
                <td>Auth</td>
                <td>BYOK across providers — no keys leave your editor unencrypted</td>
              </tr>
            </tbody>
          </table>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
