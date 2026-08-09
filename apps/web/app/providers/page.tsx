import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { formatProviderModeLabel, modelsCatalogJson } from '@agiworkforce/types';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { AgiChatDemo } from '@shared/components/agi/AgiChatDemo';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';
import { LAUNCH, MARKETING } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: `Providers: ${MARKETING.providers.display} providers, one thread`,
  description:
    'Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, Ollama, LM Studio, plus any OpenAI-compatible endpoint. Switch providers mid-conversation and keep your history.',
  path: '/providers',
});

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
  return Number.isInteger(usd) ? `$${usd}` : `$${usd.toFixed(2)}`;
}

export default function ProvidersPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-providers-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Model choice · {MARKETING.providers.display} providers</p>
          <h1 id="agi-providers-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Every provider.</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">One thread.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Route work across {MARKETING.providers.display} providers and {MARKETING.models.display}{' '}
            models. Frontier cloud APIs through your own keys on Desktop and CLI, plus Ollama and LM
            Studio for fully local work. Switch providers mid-conversation and keep your history.
            The provider label is visible on every route.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/byok" className="agi-fl-cta agi-fl-cta--primary">
              Set Up BYOK
            </Link>
            <Link href="/local" className="agi-fl-cta agi-fl-cta--secondary">
              Run AGI Locally
            </Link>
            <Link href="/download" className="agi-fl-cta agi-fl-cta--ghost">
              Get notified
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
            <li>Local · on-device</li>
            <li>BYOK · Desktop &amp; CLI</li>
            <li>Cloud · public alpha</li>
          </ul>
          <div className="agi-fl-hero-console" aria-hidden="true">
            <ProductFrame
              variant="desktop"
              title="AGI Desktop"
              badge="BYOK"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-providers-roster-title">
          <p className="agi-fl-eyebrow">The roster</p>
          <h2 id="agi-providers-roster-title" className="agi-fl-h2">
            Cloud APIs, local runtimes, and your own endpoints.
          </h2>
          <p className="agi-fl-section-lede">
            Cloud providers run through BYOK on Desktop and CLI. Your keys, your billing, traffic
            straight to the provider. Local runtimes are free and work offline. Prices shown are
            provider list rates per million tokens, read from the AGI model catalog.
          </p>
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

        <section className="agi-fl-section" aria-labelledby="agi-providers-handoff-title">
          <p className="agi-fl-eyebrow">Cross-provider continuity</p>
          <h2 id="agi-providers-handoff-title" className="agi-fl-h2">
            Watch the handoff.
          </h2>
          <p className="agi-fl-section-lede">
            Start a thread with one provider and continue it with another. Your conversation history
            travels with the switch, and the active provider label stays visible in the header. The
            preview below is scripted. It shows the route change, not a live model call.
          </p>
          <AgiChatDemo />
        </section>

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Pick the model after you start, not before."
          body="Desktop and the CLI are released. Add a key or a local runtime, and change your mind mid-thread whenever the work changes shape."
          ctas={[
            { href: '/download', label: 'Check availability' },
            { href: '/byok', label: 'Set Up BYOK' },
            { href: '/local', label: 'Run AGI Locally' },
          ]}
          stamp={LAUNCH.publicLabel}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
