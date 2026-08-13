import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { FinalCta } from '@/features/marketing/components/FlagshipSections';
import { WaitlistTrigger } from '@/features/marketing/components/WaitlistModal';
import {
  BYOK_SURFACES,
  DESKTOP_LOCAL_RUNTIMES,
  LAUNCH,
  MARKETING,
} from '../../lib/marketing-constants';
import { byokProviderLabels } from './byok-providers';

export const metadata = buildMetadata({
  title: 'BYOK: Bring Your Own Keys to Desktop, CLI & VS Code',
  description: `Bring your own provider API keys to AGI ${BYOK_SURFACES.label}. Keys remain in the local runtime, traffic goes direct to your provider, and the route stays visible. ${LAUNCH.publicLabel}.`,
  path: '/byok',
});

// Resolved from the canonical model catalog, not typed by hand — see
// ./byok-providers.ts for why the hand-typed list was wrong.
const BYOK_PROVIDERS = byokProviderLabels();

export default function ByokPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-byok-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">BYOK · bring your own keys</p>
          <h1 id="agi-byok-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Your keys.</span>{' '}
            <span className="agi-fl-h1-line">Your providers.</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">Your billing.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Bring your own API keys to AGI {BYOK_SURFACES.label}. The local desktop or developer
            runtime owns the key, requests go directly to your provider, and the provider label
            stays visible on every route.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
              Check surface availability
            </Link>
            <Link href="/cli" className="agi-fl-cta agi-fl-cta--secondary">
              Set Up the CLI
            </Link>
            <Link href="/providers" className="agi-fl-cta agi-fl-cta--ghost">
              Browse All Providers
            </Link>
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="BYOK guarantees">
            <li>{BYOK_SURFACES.compact}</li>
            <li>Keys encrypted at rest</li>
            <li>Billed by your provider</li>
          </ul>

          <div className="agi-fl-hero-console" aria-hidden="true">
            <ProductFrame
              variant="desktop"
              title="AGI Desktop"
              badge="BYOK"
              routeMode="byok"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              badge="BYOK"
              routeMode="byok"
              className="agi-fl-hero-frame agi-fl-hero-frame--terminal"
            />
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-byok-steps-title">
          <p className="agi-fl-eyebrow">How it works</p>
          <h2 id="agi-byok-steps-title" className="agi-fl-h2">
            Three steps, no middleman.
          </h2>
          <ol className="agi-steps">
            <li className="agi-step">
              <span className="agi-step-n">01 / Add a key</span>
              <h3 className="agi-step-h">Add a provider key once</h3>
              <p className="agi-step-body">
                Add a key in the Desktop, CLI, or VS Code developer runtime. It stays with that
                local runtime. {BYOK_SURFACES.exclusion}
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">02 / Pick provider &amp; model</span>
              <h3 className="agi-step-h">Switch models without switching apps</h3>
              <p className="agi-step-body">
                Choose any provider from the catalog and change models mid-thread. The active
                provider label is visible before a request leaves your machine.
              </p>
            </li>
            <li className="agi-step">
              <span className="agi-step-n">03 / Pay your provider</span>
              <h3 className="agi-step-h">Pay your provider directly</h3>
              <p className="agi-step-body">
                BYOK traffic goes straight to your provider, on your account and your rates. AGI is
                the workspace, not the meter.
              </p>
            </li>
          </ol>
          <div className="agi-fl-cta-row">
            <Link href="/docs/byok-env" className="agi-fl-cta agi-fl-cta--ghost">
              Read the Env-Based BYOK Guide
            </Link>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-byok-providers-title">
          <p className="agi-fl-eyebrow">Provider catalog</p>
          <h2 id="agi-byok-providers-title" className="agi-fl-h2">
            BYOK providers, straight from the catalog.
          </h2>
          <p className="agi-fl-section-lede">
            BYOK on {BYOK_SURFACES.label} covers the providers below, the same catalog that powers
            AGI&rsquo;s {MARKETING.models.display} models. Desktop Local mode runs alongside them
            through {DESKTOP_LOCAL_RUNTIMES.label}.
          </p>
          <div className="agi-chip-row" aria-label="Supported BYOK providers">
            {BYOK_PROVIDERS.map((provider) => (
              <span key={provider} className="agi-chip">
                {provider}
              </span>
            ))}
          </div>
          <div className="agi-chip-row" aria-label="Supported Desktop Local runtimes">
            {DESKTOP_LOCAL_RUNTIMES.names.map((runtime) => (
              <span key={runtime} className="agi-chip">
                {runtime} (local)
              </span>
            ))}
          </div>
          <div className="agi-fl-cta-row">
            <Link href="/providers" className="agi-fl-cta agi-fl-cta--ghost">
              See Provider Details
            </Link>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-byok-boundary-title">
          <p className="agi-fl-eyebrow">The boundary</p>
          <div className="agi-callout">
            <h2 id="agi-byok-boundary-title" className="agi-callout-h">
              Local stays Local until you say otherwise.
            </h2>
            <p className="agi-callout-p">
              A Local chat never silently becomes a BYOK chat. Continuing Local work on your keys is
              an explicit, reviewed continuation. You choose the context that travels and see the
              provider label before anything is sent.
            </p>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-byok-cloud-title">
          <p className="agi-fl-eyebrow">AGI Cloud</p>
          <div className="agi-callout">
            <h2 id="agi-byok-cloud-title" className="agi-callout-h">
              Prefer managed compute?
            </h2>
            <p className="agi-callout-p">
              AGI managed cloud is in public alpha and open by default — sign in to start, no
              waitlist. Pricing shows Team’s per-seat offer and current checkout availability.
              Enterprise governance, SSO, and custom controls remain contract-scoped.
            </p>
          </div>
          <div className="agi-fl-cta-row">
            <WaitlistTrigger
              label="Discuss Enterprise Requirements"
              source="byok"
              className="agi-fl-cta agi-fl-cta--ghost"
            />
          </div>
        </section>

        <FinalCta
          eyebrow="BYOK"
          title="Your keys are ready when you are."
          body={`Follow the product pages for current ${BYOK_SURFACES.label} availability, add a provider key, and route work on your own account. Local Mode stays available the whole time.`}
          ctas={[
            { href: '/download', label: 'Check surface availability' },
            { href: '/cli', label: 'Explore the CLI' },
          ]}
          stamp="Availability varies by surface"
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
