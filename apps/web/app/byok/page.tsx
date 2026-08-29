import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import type { TerminalLine } from '@/features/marketing/components/DeviceMockups';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';
import { BYOK_PROVIDERS } from '@/lib/byok-providers';
import { BYOK_SURFACES, LAUNCH } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'BYOK: Bring Your Own Keys to Desktop, CLI & VS Code',
  description: `Bring your own provider API keys to AGI ${BYOK_SURFACES.label}. Keys remain in the local runtime, traffic goes direct to your provider, and the route stays visible. ${LAUNCH.publicLabel}.`,
  path: '/byok',
});

const KEY_SESSION: readonly TerminalLine[] = [
  { kind: 'cmd', text: 'agi login google' },
  { kind: 'out', text: 'Enter Google API key (GOOGLE_API_KEY):' },
  { kind: 'ok', text: 'Done! Google API key saved to the OS credential store.' },
  { kind: 'cmd', text: 'agi auth-status' },
  { kind: 'out', text: 'Provider     Type      Status    Expires' },
  { kind: 'out', text: 'google       api_key   active    -' },
  { kind: 'cmd', text: 'agi exec --provider google "explain the auth store"' },
  { kind: 'out', text: 'One keyring entry per provider; the index holds names only.' },
];

const KEY_CUSTODY: { surface: string; custody: string }[] = [
  {
    surface: 'Desktop',
    custody:
      'The key is encrypted before it reaches local application storage, and saving it activates a direct-provider route in the running app without a restart.',
  },
  {
    surface: 'CLI',
    custody:
      'One OS-keyring entry per provider, under the service com.agiworkforce.cli.auth. The on-disk index keeps provider names because keyrings cannot be enumerated, and it holds no key material.',
  },
  {
    surface: 'VS Code',
    custody:
      'The extension hands the key to the editor’s own SecretStorage and reads it back from there.',
  },
  {
    surface: 'Self-hosted',
    custody:
      'An operator sets one environment variable per provider on their own deployment. The settings screen reports whether a variable is present and never the value behind it.',
  },
];

export default function ByokPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-byok-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">Bring your own keys</p>
              <h1 id="agi-byok-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">AGI Cloud</span>{' '}
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">never sees</em> your
                </span>{' '}
                <span className="agi-fl-h1-line">API key.</span>
              </h1>
              <p className="agi-fl-lede">
                Bring your own API keys to AGI {BYOK_SURFACES.label}. Each runtime holds the key in
                its own platform credential store, then calls the provider’s endpoint directly, so
                the usage lands on your provider account.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="/docs/byok-env" className="agi-fl-cta agi-fl-cta--primary">
                  Set up a provider key
                </Link>
                <Link href="/download" className="agi-fl-cta agi-fl-cta--secondary">
                  Check surface availability
                </Link>
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="What BYOK covers">
                <li>{BYOK_SURFACES.compact}</li>
                <li>{BYOK_PROVIDERS.length} provider env vars</li>
                <li>Direct provider endpoints</li>
              </ul>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <ProductFrame
                variant="terminal"
                title="agi · zsh"
                badge="BYOK"
                routeMode="byok"
                session={KEY_SESSION}
                hud={{ tokensIn: 1240, tokensOut: 386, cost: 'provider billed', ctx: '4%' }}
              />
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-byok-custody-title">
          <p className="agi-fl-eyebrow">Key custody</p>
          <h2 id="agi-byok-custody-title" className="agi-fl-h2">
            The key stays on the machine you typed it into.
          </h2>
          <p className="agi-fl-section-lede">
            There is no shared vault behind these surfaces. A key added on Desktop is unknown to the
            CLI, and a key added to the CLI is unknown to VS Code, because each one writes to the
            credential store its own platform provides.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Surface</th>
                <th>Where the key is held</th>
              </tr>
            </thead>
            <tbody>
              {KEY_CUSTODY.map((row) => (
                <tr key={row.surface}>
                  <td>{row.surface}</td>
                  <td>{row.custody}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-byok-env-title">
          <p className="agi-fl-eyebrow">The env-var contract</p>
          <h2 id="agi-byok-env-title" className="agi-fl-h2">
            A provider key arrives as an environment variable.
          </h2>
          <p className="agi-fl-section-lede">
            These are the names a self-hosted deployment reads, and the CLI prompts for the key by
            the same name while it collects one. Presence is all that is ever reported back to a
            settings screen; the value stays server-side.
          </p>
          <div className="agi-chip-row" aria-label="BYOK provider environment variables">
            {BYOK_PROVIDERS.map((provider) => (
              <span key={provider.id} className="agi-chip">
                {provider.envVar}
              </span>
            ))}
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-byok-boundary-title">
          <p className="agi-fl-eyebrow">Surface boundary</p>
          <div className="agi-callout">
            <h2 id="agi-byok-boundary-title" className="agi-callout-h">
              Key entry exists where the key can stay local.
            </h2>
            <p className="agi-callout-p">
              {BYOK_SURFACES.exclusion} Those surfaces have nowhere private to put a key, so they do
              not ask for one. Carrying an existing thread across Local, BYOK, and managed Cloud is
              a separate question, and the{' '}
              <Link href="/faq" className="agi-fl-surface-link">
                FAQ
              </Link>{' '}
              answers it.
            </p>
          </div>
        </section>

        <FinalCta
          eyebrow="BYOK"
          title="Route your work through the provider you already pay."
          body="The catalog lists each provider AGI can address, how many models it exposes, how it authenticates, and the per-million-token price it publishes."
          ctas={[{ href: '/providers', label: 'Browse the provider catalog' }]}
          stamp="Availability varies by surface"
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
