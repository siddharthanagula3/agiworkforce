import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';

export default function RedesignPreviewLocalPage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">Run AI offline. Free forever.</h1>
        <p className="pv-page-lede">
          No internet. No API keys. No quotas. No per-token cost. Run any open-weight model on your
          laptop with Ollama or LM Studio, and chat to it from the same surface you&rsquo;d chat to
          Claude or GPT.
        </p>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">One install</p>
        <div className="pv-terminal">
          <div className="pv-terminal-bar">~/agi-workforce — local mode</div>
          <pre className="pv-terminal-pre">
            <span className="pv-terminal-comment"># macOS</span>
            {'\n'}
            <span className="pv-terminal-prompt">$</span>brew install ollama
            {'\n'}
            <span className="pv-terminal-prompt">$</span>ollama pull llama3.3
            {'\n'}
            <span className="pv-terminal-prompt">$</span>agiworkforce --provider ollama
            {'\n'}
            {'\n'}
            <span className="pv-terminal-comment"># or with LM Studio (GUI)</span>
            {'\n'}
            <span className="pv-terminal-prompt">$</span>agiworkforce --provider lmstudio
          </pre>
        </div>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Why offline</p>
        <ul className="pv-reasons">
          <li className="pv-reason">
            <h3 className="pv-reason-h">Privacy</h3>
            <p className="pv-reason-p">
              Nothing leaves your laptop. Not your prompts, not your files, not the responses. The
              model loads into memory and stays there.
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Latency</h3>
            <p className="pv-reason-p">
              No network round-trip. On Apple Silicon, modern open-weight models stream at
              interactive speed. No rate limits, no queueing, no &ldquo;model is busy&rdquo;.
            </p>
          </li>
          <li className="pv-reason">
            <h3 className="pv-reason-h">Cost</h3>
            <p className="pv-reason-p">
              Zero per-token cost. Zero rate limits. Zero subscriptions. Once a model is on your
              disk, you can run it as much as you like, forever.
            </p>
          </li>
        </ul>
      </section>

      <AgiFooter />
    </main>
  );
}
