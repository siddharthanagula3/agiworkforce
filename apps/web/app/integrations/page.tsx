import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Integrations | AGI Workforce',
  description:
    'How AGI Workforce connects to other tools — MCP plugins, native messaging bridge, BYOK against any cloud provider.',
  alternates: { canonical: 'https://agiworkforce.com/integrations' },
};

export default function IntegrationsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Integrations.</h1>
          <p className="agi-page-lede">
            Three patterns connect AGI Workforce to the rest of your stack: MCP plugins, the native
            messaging bridge, and BYOK across cloud providers.{' '}
            <strong>
              The model picker is one of the integrations — every wired provider counts.
            </strong>
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">The three patterns</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">MCP plugins</h3>
              <p className="agi-reason-p">
                Plug any Model Context Protocol server into the agent. stdio, SSE, and streamable
                HTTP transports supported. Discover plugins, mount them, scope their access.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Native messaging bridge</h3>
              <p className="agi-reason-p">
                The Chrome extension talks to the desktop on localhost:8787. Browser captures
                intent; desktop runs the model and the tool calls.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Provider BYOK</h3>
              <p className="agi-reason-p">
                Bring keys to Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot,
                Zhipu, Ollama, LM Studio, or any OpenAI-compatible BYO endpoint.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What&rsquo;s wired today</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Cloud providers</td>
                <td>10+ wired natively. BYOK only — pay providers directly.</td>
              </tr>
              <tr>
                <td>Local providers</td>
                <td>Ollama, LM Studio. Free forever, fully offline.</td>
              </tr>
              <tr>
                <td>MCP transports</td>
                <td>stdio (shipped) · SSE + streamable HTTP (in flight).</td>
              </tr>
              <tr>
                <td>Native messaging</td>
                <td>Chrome MV3 extension ↔ desktop on localhost:8787.</td>
              </tr>
              <tr>
                <td>Editor</td>
                <td>VS Code extension with @agi chat participant.</td>
              </tr>
            </tbody>
          </table>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/providers" className="agi-cta-primary">
              See providers
            </Link>
            <Link href="/api-docs" className="agi-cta-ghost">
              API docs →
            </Link>
          </div>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
