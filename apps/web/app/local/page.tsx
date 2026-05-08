import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Local — Run AI offline, free forever | AGI Workforce',
  description:
    'No internet. No API keys. No quotas. No per-token cost. Run any open-weight model on your laptop with Ollama or LM Studio.',
  alternates: { canonical: 'https://agiworkforce.com/local' },
};

export default function LocalPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Run AI offline. Free forever.</h1>
          <p className="agi-page-lede">
            No internet. No API keys. No quotas. No per-token cost. Run any open-weight model on
            your laptop with Ollama or LM Studio, and chat to it from the same surface you&rsquo;d
            chat to Claude or GPT.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">One install</p>
          <div className="agi-terminal">
            <div className="agi-terminal-bar">~/agi-workforce — local mode</div>
            <pre className="agi-terminal-pre">
              <span className="agi-terminal-comment">
                # macOS — install Ollama, pull any open-weight model, connect
              </span>
              {'\n'}
              <span className="agi-terminal-prompt">$</span>brew install ollama
              {'\n'}
              <span className="agi-terminal-prompt">$</span>ollama pull &lt;your-model&gt;
              {'\n'}
              <span className="agi-terminal-prompt">$</span>agiworkforce --provider ollama
              {'\n'}
              {'\n'}
              <span className="agi-terminal-comment"># or with LM Studio (GUI)</span>
              {'\n'}
              <span className="agi-terminal-prompt">$</span>agiworkforce --provider lmstudio
            </pre>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Why offline</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Privacy</h3>
              <p className="agi-reason-p">
                Nothing leaves your laptop. Not your prompts, not your files, not the responses. The
                model loads into memory and stays there.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Latency</h3>
              <p className="agi-reason-p">
                No network round-trip. On Apple Silicon, modern open-weight models stream at
                interactive speed. No rate limits, no queueing.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Cost</h3>
              <p className="agi-reason-p">
                Zero per-token cost. Zero rate limits. Zero subscriptions. Once a model is on your
                disk, you can run it as much as you like, forever.
              </p>
            </li>
          </ul>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
