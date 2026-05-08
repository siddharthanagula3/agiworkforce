import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'VS Code Extension — Multi-provider coding assistant | AGI Workforce',
  description:
    '10+ providers in one VS Code extension. Inline completions, code lens, hover provider, and an @agi chat participant inside Copilot Chat. Bring your own keys.',
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

export default function VscodeExtensionPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Multi-provider coding assistant.</h1>
          <p className="agi-page-lede">
            10+ providers in one VS Code extension. Inline completions, code lens, hover provider,
            and an @agi chat participant inside Copilot Chat.{' '}
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
              See the providers →
            </Link>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What you get</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">@agi chat participant</h3>
              <p className="agi-reason-p">
                Use <code>@agi</code> inside Copilot Chat. Ask questions, request refactors, run
                slash commands without leaving the chat panel.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Inline completions</h3>
              <p className="agi-reason-p">
                Ghost-text as you type, powered by whichever provider you pick. Switch providers per
                file, per project, or globally.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Code lens + hover</h3>
              <p className="agi-reason-p">
                Inline actions above functions: Explain, Fix, Refactor, Add Tests, Add Docs. Hover
                any symbol for an inline explanation.
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
