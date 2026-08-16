import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { LEGAL_ENTITY, NOTICE_ADDRESS, POLICY_LAST_UPDATED } from '@/lib/legal-constants';
import modelRegistry from '@agiworkforce/types/models.json';

export const metadata = buildMetadata({
  title: 'Model licences',
  description:
    'Licence terms for every model this product can route to, generated from the canonical model registry: which are proprietary, which ship open weights, and what that means for your output.',
  path: '/model-licenses',
});

interface RegistryModel {
  id: string;
  name?: string;
  provider?: string;
  license?: string | null;
  openWeight?: boolean | null;
  modelType?: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  qwen: 'Qwen',
  moonshot: 'Moonshot',
  perplexity: 'Perplexity',
  zhipu: 'Zhipu',
  minimax: 'MiniMax',
  runway: 'Runway',
  managed_cloud: 'AGI Managed Cloud',
};

function licenceLabel(model: RegistryModel): string {
  if (typeof model.license === 'string' && model.license.trim().length > 0) {
    return model.license === 'proprietary' ? 'Proprietary (provider terms)' : model.license;
  }
  return 'Not recorded in the registry';
}

function weightsLabel(model: RegistryModel): string {
  if (model.openWeight === true) return 'Open weights';
  if (model.openWeight === false) return 'Closed weights';
  return 'Not recorded';
}

const MODELS: RegistryModel[] = Object.values(
  (modelRegistry as { models: Record<string, RegistryModel> }).models,
);

const BY_PROVIDER = MODELS.reduce<Record<string, RegistryModel[]>>((acc, model) => {
  const key = model.provider ?? 'unknown';
  (acc[key] ??= []).push(model);
  return acc;
}, {});

const PROVIDER_KEYS = Object.keys(BY_PROVIDER).sort((a, b) =>
  (PROVIDER_LABELS[a] ?? a).localeCompare(PROVIDER_LABELS[b] ?? b),
);

export default function ModelLicensesPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Model licences.</h1>
          <p className="agi-page-lede">
            This product routes to models from several vendors, some proprietary and some shipping
            open weights.{' '}
            <strong>
              The licence attached to the model that produced your output governs what you may do
              with it, and that is not the same for every model in the picker.
            </strong>{' '}
            This table is generated from the same model registry the router reads, so it cannot
            drift from what actually runs. Last updated: {POLICY_LAST_UPDATED.modelLicenses}.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">What the columns mean</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td style={{ width: '30%' }}>Proprietary</td>
                <td>
                  The provider licenses the model to us and to you under their own terms. Those
                  terms travel with the output. The providers themselves are listed on{' '}
                  <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
                    /subprocessors
                  </Link>
                  .
                </td>
              </tr>
              <tr>
                <td>Open weights</td>
                <td>
                  The model&rsquo;s weights are published under a named licence (for example MIT).
                  That licence governs the weights. It does not by itself grant rights in anything
                  the model reproduces.
                </td>
              </tr>
              <tr>
                <td>Not recorded</td>
                <td>
                  Our registry does not carry a licence for this entry yet. Treat it as unknown and
                  check the provider&rsquo;s own terms before relying on the output commercially. We
                  would rather say this than guess.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {PROVIDER_KEYS.map((providerKey) => (
          <section className="agi-section" key={providerKey}>
            <p className="agi-section-eyebrow">{PROVIDER_LABELS[providerKey] ?? providerKey}</p>
            <table className="agi-ledger">
              <tbody>
                {BY_PROVIDER[providerKey]!.sort((a, b) =>
                  (a.name ?? a.id).localeCompare(b.name ?? b.id),
                ).map((model) => (
                  <tr key={model.id}>
                    <td style={{ width: '40%' }}>{model.name ?? model.id}</td>
                    <td>
                      {licenceLabel(model)} &middot; {weightsLabel(model)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <section className="agi-section">
          <p className="agi-section-eyebrow">Your output</p>
          <p className="agi-page-lede">
            We do not claim ownership of what you generate. What you may do with it depends on the
            licence above, the provider&rsquo;s terms, and the law where you are — a model licence
            cannot grant you rights in material the model reproduces from its training data. If you
            believe a generation reproduces work you own, the notice route is on{' '}
            <Link href="/copyright" style={{ color: 'var(--agi-ink)' }}>
              /copyright
            </Link>
            .
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            {LEGAL_ENTITY}, {NOTICE_ADDRESS}. Model availability changes; this page regenerates from
            the registry, and material policy changes are recorded on{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            .
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/copyright" className="agi-cta-ghost">
              Copyright &rarr;
            </Link>
            <Link href="/subprocessors" className="agi-cta-ghost">
              Subprocessors &rarr;
            </Link>
            <Link href="/terms" className="agi-cta-ghost">
              Terms &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
