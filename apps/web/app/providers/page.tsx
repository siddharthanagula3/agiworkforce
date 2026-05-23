import type { Metadata } from 'next';
import { formatProviderModeLabel, modelsCatalogJson } from '@agiworkforce/types';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { AgiChatDemo } from '../../components/agi/AgiChatDemo';

export const metadata: Metadata = {
  title: 'Providers — Twelve brains, one thread | AGI',
  description:
    'Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Ollama, LM Studio, plus any OpenAI-compatible BYO endpoint. Switch mid-conversation with token-level handoff.',
  alternates: { canonical: 'https://agiworkforce.com/providers' },
};

type ProviderEntry = {
  name: string;
  models: string;
  auth: string;
  providerKey?: string;
};

const PROVIDERS: ProviderEntry[] = [
  {
    name: 'Anthropic',
    models: 'Claude family',
    auth: `${formatProviderModeLabel('DirectByok')} · OAuth`,
    providerKey: 'anthropic',
  },
  {
    name: 'OpenAI',
    models: 'GPT family',
    auth: formatProviderModeLabel('DirectByok'),
    providerKey: 'openai',
  },
  {
    name: 'Google',
    models: 'Gemini family',
    auth: formatProviderModeLabel('DirectByok'),
    providerKey: 'google',
  },
  {
    name: 'xAI',
    models: 'Grok family',
    auth: formatProviderModeLabel('DirectByok'),
    providerKey: 'xai',
  },
  {
    name: 'DeepSeek',
    models: 'V & R family',
    auth: formatProviderModeLabel('DirectByok'),
    providerKey: 'deepseek',
  },
  {
    name: 'Perplexity',
    models: 'Sonar family',
    auth: formatProviderModeLabel('DirectByok'),
    providerKey: 'perplexity',
  },
  {
    name: 'Qwen',
    models: 'Qwen family',
    auth: formatProviderModeLabel('DirectByok'),
    providerKey: 'qwen',
  },
  {
    name: 'Moonshot',
    models: 'Kimi family',
    auth: formatProviderModeLabel('DirectByok'),
    providerKey: 'moonshot',
  },
  {
    name: 'Zhipu',
    models: 'GLM family',
    auth: formatProviderModeLabel('DirectByok'),
    providerKey: 'zhipu',
  },
  {
    name: 'Ollama',
    models: 'Any local GGUF',
    auth: formatProviderModeLabel('Local'),
    providerKey: 'ollama',
  },
  { name: 'LM Studio', models: 'Any local model', auth: formatProviderModeLabel('Local') },
  {
    name: 'Custom BYO',
    models: 'OpenAI-compatible URL',
    auth: formatProviderModeLabel('DirectByok'),
  },
];

type ProviderPricing = {
  inputPerMillion: number;
  outputPerMillion: number;
};

function getProviderPricing(providerKey: string | undefined): ProviderPricing | null {
  if (!providerKey) return null;
  const providers = modelsCatalogJson.providers as Record<
    string,
    { defaultPricing?: ProviderPricing }
  >;
  const pricing = providers[providerKey]?.defaultPricing;
  if (!pricing) return null;
  if (pricing.inputPerMillion === 0 && pricing.outputPerMillion === 0) return null;
  return pricing;
}

function formatPrice(usd: number): string {
  if (usd === 0) return 'free';
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(0)}`;
}

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
            {PROVIDERS.map((p) => {
              const pricing = getProviderPricing(p.providerKey);
              return (
                <div key={p.name} className="agi-provider-cell">
                  <div className="agi-provider-name">{p.name}</div>
                  <div className="agi-provider-models">{p.models}</div>
                  <div className="agi-provider-auth">{p.auth}</div>
                  {pricing && (
                    <div className="agi-provider-pricing">
                      <span>{formatPrice(pricing.inputPerMillion)}/MTok in</span>
                      <span className="agi-provider-pricing-sep">&nbsp;·&nbsp;</span>
                      <span>{formatPrice(pricing.outputPerMillion)}/MTok out</span>
                    </div>
                  )}
                </div>
              );
            })}
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
