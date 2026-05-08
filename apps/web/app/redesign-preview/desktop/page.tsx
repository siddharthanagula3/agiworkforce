import Link from 'next/link';
import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

const SPECS: { k: string; v: string }[] = [
  { k: 'Engine', v: 'Pure Rust, Tauri' },
  { k: 'Size', v: '~35 MB installed' },
  { k: 'Modes', v: 'Local · Cloud (BYOK or managed)' },
  { k: 'Storage', v: 'SQLite local · Supabase cloud' },
  { k: 'Computer use', v: 'Browser · files · terminal · screen' },
  { k: 'MCP plugins', v: 'stdio · SSE · streamable HTTP' },
  { k: 'Skills', v: 'Markdown + frontmatter, layered precedence' },
  { k: 'Code signing', v: 'Apple Developer ID D2PR62RLT4' },
];

export default function RedesignPreviewDesktopPage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">The native desktop.</h1>
        <p className="pv-page-lede">
          A small Rust binary that runs every provider natively. Local mode runs Ollama or LM Studio
          without ever touching the cloud. Cloud mode brings BYOK and Realtime cross-device sync.{' '}
          <strong>
            Not Electron. Not a wrapper around a website. The chat is the desktop app.
          </strong>
        </p>
        <div className="pv-cta-row">
          <Link href="/download" className="pv-cta-primary">
            Download
          </Link>
          <Link href="/redesign-preview/local" className="pv-cta-ghost">
            Run it offline →
          </Link>
        </div>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">What&rsquo;s inside</p>
        <table className="pv-ledger">
          <tbody>
            {SPECS.map((s) => (
              <tr key={s.k}>
                <td>{s.k}</td>
                <td>{s.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Available for</p>
        <ul className="pv-reasons">
          <li className="pv-reason">
            <h3 className="pv-reason-h">macOS</h3>
            <p className="pv-reason-p">
              Universal DMG, signed with our Apple Developer ID. Both Apple Silicon and Intel.
            </p>
            <Link href="/download" className="pv-cta-ghost" style={{ marginTop: 4 }}>
              Download →
            </Link>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Linux</h3>
            <p className="pv-reason-p">AppImage. Drop it anywhere on your path and run.</p>
            <Link href="/download" className="pv-cta-ghost" style={{ marginTop: 4 }}>
              Download →
            </Link>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Windows</h3>
            <p className="pv-reason-p">
              EXE shipping once the EV certificate clears. Use the AppImage under WSL until then.
            </p>
            <span className="pv-cta-ghost" style={{ marginTop: 4, opacity: 0.7 }}>
              On the waitlist
            </span>
          </li>
        </ul>
      </section>

      <AgiFooter />
    </main>
  );
}
