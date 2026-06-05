import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LAUNCH, POSITIONING } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'Local — Run AI offline, free forever',
  description: `Free local AI on your device with supported Ollama, LM Studio, Apple, Gemini Nano, Gemma, and open-weight routes. ${LAUNCH.publicLabel}.`,
  alternates: { canonical: 'https://agiworkforce.com/local' },
};

export default function LocalPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <p className="agi-section-eyebrow" style={{ marginBottom: 12 }}>
            {LAUNCH.publicLabel}
          </p>
          <h1 className="agi-page-h1">Free local AI. No cloud bill.</h1>
          <p className="agi-page-lede">
            Local mode is how AGI can acquire users without burning managed-compute dollars. Run
            supported local models through Ollama, LM Studio, Apple, Gemini Nano, Gemma, and
            open-weight routes, then upgrade to BYOK or invited Cloud only when you choose.
            <strong> {POSITIONING.trustBoundary}</strong>
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
              <span className="agi-terminal-prompt">$ </span>brew install ollama
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>ollama pull &lt;your-model&gt;
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi --provider ollama
              {'\n'}
              {'\n'}
              <span className="agi-terminal-comment"># or with LM Studio (GUI)</span>
              {'\n'}
              <span className="agi-terminal-prompt">$ </span>agi --provider lmstudio
            </pre>
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Why Local wins attention</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Private by boundary</h3>
              <p className="agi-reason-p">
                In Local mode, prompts, files, and responses stay on the device unless the user
                explicitly forks the work into BYOK or invited Cloud with a visible provider label.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">No inference subsidy</h3>
              <p className="agi-reason-p">
                Local inference uses the user&rsquo;s hardware. AGI can offer a free experience,
                capture demand, and reserve managed compute for users who request Cloud access.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Same product shell</h3>
              <p className="agi-reason-p">
                Users get the same AGI composer, projects, artifacts, model selector, and memory
                controls before they ever pay for tokens or join managed Cloud.
              </p>
            </li>
          </ul>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
