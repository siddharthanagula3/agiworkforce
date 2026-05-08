import type { Metadata } from 'next';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { AgiChatDemo } from '../../components/agi/AgiChatDemo';

export const metadata: Metadata = {
  title: 'Providers — Twelve brains, one thread | AGI Workforce',
  description:
    'Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Ollama, LM Studio, plus any OpenAI-compatible BYO endpoint. Switch mid-conversation with token-level handoff.',
  alternates: { canonical: 'https://agiworkforce.com/providers' },
};

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

export default function ProvidersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Twelve brains. One thread.</h1>
          <p className="agi-page-lede">
            Anthropic locks you to Claude. OpenAI to GPT. Google to Gemini. Most products lock you
            to one. <strong>We route to twelve, in one chat history.</strong> Token-level handoff,
            no summary lossy in the middle.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">The roster</p>
          <div className="agi-providers-grid">
            {PROVIDERS.map((p) => (
              <div key={p.name} className="agi-provider-cell">
                <div className="agi-provider-name">{p.name}</div>
                <div className="agi-provider-models">{p.models}</div>
                <div className="agi-provider-auth">{p.auth}</div>
              </div>
            ))}
          </div>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Cross-provider continuity</p>
          <h2 className="agi-section-h2">Watch the handoff.</h2>
          <p className="agi-page-lede" style={{ marginTop: 0, marginBottom: 32, maxWidth: '60ch' }}>
            Start a thread in Claude. Switch to GPT for the next turn. Finish in Gemini. The full
            history travels — system prompt, tool calls, intermediate reasoning. As tokens, not
            summaries.
          </p>
          <AgiChatDemo />
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
