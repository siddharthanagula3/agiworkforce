import Link from 'next/link';
import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

const SLASH: { cmd: string; desc: string }[] = [
  { cmd: '/explain', desc: 'Explain the selection in plain language' },
  { cmd: '/fix', desc: 'Find and fix bugs in the selection' },
  { cmd: '/refactor', desc: 'Suggest or apply refactoring' },
  { cmd: '/tests', desc: 'Generate unit tests for the selection' },
  { cmd: '/docs', desc: 'Write doc comments for the selection' },
  { cmd: '/model', desc: 'Switch the active provider and model' },
];

export default function RedesignPreviewVscodeExtensionPage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">Multi-provider coding assistant.</h1>
        <p className="pv-page-lede">
          10+ providers in one VS Code extension. Inline completions, code lens, hover provider, and
          an @agi chat participant inside Copilot Chat.{' '}
          <strong>Not locked to one model. Bring your own keys, pay providers directly.</strong>
        </p>
        <div className="pv-cta-row">
          <a
            href="https://github.com/siddharthanagula3/agiworkforce/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="pv-cta-primary"
          >
            Install via VSIX
          </a>
          <Link href="/redesign-preview/providers" className="pv-cta-ghost">
            See the providers →
          </Link>
        </div>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">What you get</p>
        <ul className="pv-reasons">
          <li className="pv-reason">
            <h3 className="pv-reason-h">@agi chat participant</h3>
            <p className="pv-reason-p">
              Use <code>@agi</code> inside Copilot Chat. Ask questions, request refactors, run slash
              commands without leaving the chat panel.
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Inline completions</h3>
            <p className="pv-reason-p">
              Ghost-text as you type, powered by whichever provider you pick. Switch providers per
              file, per project, or globally.
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Code lens + hover</h3>
            <p className="pv-reason-p">
              Inline actions above functions: Explain, Fix, Refactor, Add Tests, Add Docs. Hover any
              symbol for an inline explanation.
            </p>
          </li>
        </ul>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Slash commands</p>
        <table className="pv-ledger">
          <tbody>
            {SLASH.map((s) => (
              <tr key={s.cmd}>
                <td style={{ fontFamily: 'var(--pv-font-mono)', textTransform: 'lowercase' }}>
                  {s.cmd}
                </td>
                <td>{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Distribution</p>
        <table className="pv-ledger">
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

      <AgiFooter />
    </main>
  );
}
