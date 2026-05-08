import { AgiTopBar } from '../AgiTopBar';
import { AgiFooter } from '../AgiFooter';
import { RouterVisualization } from '../RouterVisualization';

/*
 * Providers — the differentiator-1 page. Real provider grid, then the live
 * cross-provider chat demo (same component as homepage).
 */

const PROVIDERS = [
  { name: 'Anthropic', models: 'Claude family', auth: 'BYOK · OAuth' },
  { name: 'OpenAI', models: 'GPT family', auth: 'BYOK' },
  { name: 'Google', models: 'Gemini family', auth: 'BYOK' },
  { name: 'xAI', models: 'Grok family', auth: 'BYOK' },
  { name: 'DeepSeek', models: 'V & R family', auth: 'BYOK' },
  { name: 'Perplexity', models: 'Sonar family', auth: 'BYOK' },
  { name: 'Qwen', models: 'Qwen family', auth: 'BYOK' },
  { name: 'Moonshot', models: 'Kimi family', auth: 'BYOK' },
  { name: 'Zhipu', models: 'GLM family', auth: 'BYOK' },
  { name: 'Ollama', models: 'Any local GGUF', auth: 'Local' },
  { name: 'LM Studio', models: 'Any local model', auth: 'Local' },
  { name: 'Custom BYO', models: 'OpenAI-compatible URL', auth: 'BYOK' },
];

export default function RedesignPreviewProvidersPage() {
  return (
    <main className="pv-shell">
      <AgiTopBar />

      <section className="pv-page-hero">
        <h1 className="pv-page-h1">Twelve brains. One thread.</h1>
        <p className="pv-page-lede">
          Anthropic locks you to Claude. OpenAI to GPT. Google to Gemini. Most products lock you to
          one. <strong>We route to twelve, in one chat history.</strong> Token-level handoff, no
          summary lossy in the middle.
        </p>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">The roster</p>
        <div className="pv-providers-grid">
          {PROVIDERS.map((p) => (
            <div key={p.name} className="pv-provider-cell">
              <div className="pv-provider-name">{p.name}</div>
              <div className="pv-provider-models">{p.models}</div>
              <div className="pv-provider-auth">{p.auth}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="pv-section">
        <p className="pv-section-eyebrow">Cross-provider continuity</p>
        <h2 className="pv-section-h2">Watch the handoff.</h2>
        <p className="pv-page-lede" style={{ marginTop: 0, marginBottom: 32, maxWidth: '60ch' }}>
          Start a thread in Claude. Switch to GPT for the next turn. Finish in Gemini. The full
          history travels — system prompt, tool calls, intermediate reasoning. As tokens, not
          summaries.
        </p>
        <RouterVisualization />
      </section>

      <AgiFooter />
    </main>
  );
}
