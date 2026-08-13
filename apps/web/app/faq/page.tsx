import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  BYOK_SURFACES,
  DESKTOP_LOCAL_RUNTIMES,
  MARKETING,
  POSITIONING,
} from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'FAQ',
  description:
    'Frequently asked questions about providers, BYOK, Local mode, AGI managed cloud, and security.',
  path: '/faq',
});

const QA: { q: string; a: string }[] = [
  {
    q: 'How many providers do you support?',
    a: `${MARKETING.providers.display} provider integrations, including Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, and custom OpenAI-compatible endpoints. Desktop Local mode also supports four verified runtimes: ${DESKTOP_LOCAL_RUNTIMES.label}. The in-product catalog is the current source of truth.`,
  },
  {
    q: 'What does BYOK mean here?',
    a: `You bring your own API key on ${BYOK_SURFACES.label}. Keys stay in the local developer or desktop runtime and requests go directly to your provider. Usage is billed by the provider, not by AGI. ${BYOK_SURFACES.exclusion}`,
  },
  {
    q: 'Can I run AGI fully offline?',
    a: 'Yes on Desktop and CLI after a supported local runtime and model are installed. Those Local conversations are not sent to AGI, and Local mode is free; downloading a model may require internet first. Mobile has no published release, so its Local mode is not offered publicly yet.',
  },
  {
    q: 'Can I switch models mid-conversation?',
    a: 'Within the active trust boundary, yes: pick another supported model and the provider label updates before the next request leaves your machine. Moving between Local, BYOK, and managed Cloud is not an ordinary model switch. It requires an explicit fork or continuation with context selection, secret scanning, a payload preview, consent, and a visible destination label. Local content is never silently sent elsewhere.',
  },
  {
    q: 'What does AGI Cloud cost?',
    a: 'AGI managed cloud is in public alpha and open by default — sign in and start, no waitlist. Usage is metered and current plan details live on the pricing page. Local and BYOK remain free. Pricing is also the source of truth for which self-serve checkouts are configured for your region and billing cadence; Team is priced per seat when its checkout is available. Only Enterprise (custom governance, SSO, custom retention) is sales-assisted, with an early-access interest list.',
  },
  {
    q: 'How do I upgrade, downgrade, cancel, or get an invoice?',
    a: 'Start an available self-serve upgrade from Pricing. For a Stripe-billed plan, open Settings → Billing and choose Manage billing to use the Stripe Customer Portal for plan changes, cancellation, payment methods, and invoices; a scheduled cancellation date is shown in Billing after it is recorded. App Store and Google Play subscriptions must be managed in the store that bills them. Operator-provisioned Enterprise plans are handled through your organization. Refund eligibility is described in the Refund Policy.',
  },
  {
    q: 'Do you train on my data?',
    a: `AGI does not use customer conversation content to train AGI-owned models. ${POSITIONING.trustBoundary}`,
  },
  {
    q: 'What happens to my master password?',
    a: 'The Desktop master password is unrecoverable by design. We never have it. If you forget it, your encrypted keys cannot be decrypted. Back it up.',
  },
  {
    q: 'Is there an Enterprise plan?',
    a: 'Enterprise is in scoping, not on sale. SSO, audit log export, and custom retention are planned; contact sales to discuss your requirements and timeline.',
  },
  {
    q: 'Where do you host data?',
    a: 'Hosted data lives in the United States. EU/UK residency hosting is on the roadmap, not available today. Local conversations never leave your device in the first place.',
  },
];

export default function FaqPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-faq-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">FAQ</p>
          <h1 id="agi-faq-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Direct answers,</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">no spin.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            The questions we get most often, answered the way we'd want them answered. If something
            below is wrong or out of date, email contact@agiworkforce.com and we'll fix it.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
              <li>Local · on-device</li>
              <li>BYOK · your keys</li>
              <li>Cloud · public alpha</li>
            </ul>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-faq-qa-title">
          <p className="agi-fl-eyebrow">Q &amp; A</p>
          <h2 id="agi-faq-qa-title" className="agi-fl-h2">
            Ten questions, ten straight answers.
          </h2>
          <p className="agi-fl-section-lede">
            Providers, trust modes, managed cloud, billing, and what happens to your data. The short
            version of everything the rest of the site covers at length.
          </p>
          <ul className="agi-reasons" style={{ marginTop: 40 }}>
            {QA.map((item) => (
              <li className="agi-reason" key={item.q}>
                <h3 className="agi-reason-h">{item.q}</h3>
                <p className="agi-reason-p">{item.a}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-faq-more-title">
          <p className="agi-fl-eyebrow">Still stuck?</p>
          <h2 id="agi-faq-more-title" className="agi-fl-h2">
            Ask a human.
          </h2>
          <p className="agi-fl-section-lede">
            The help index covers the common how-tos, and a real person reads the inbox.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="/help" className="agi-fl-cta agi-fl-cta--primary">
              Browse the Help Index
            </Link>
            <Link href="/pricing" className="agi-fl-cta agi-fl-cta--secondary">
              See Pricing
            </Link>
            <Link href="/refund-policy" className="agi-fl-cta agi-fl-cta--ghost">
              Refund Policy
            </Link>
            <Link href="/legal" className="agi-fl-cta agi-fl-cta--ghost">
              Legal Index
            </Link>
            <a href="mailto:contact@agiworkforce.com" className="agi-fl-cta agi-fl-cta--ghost">
              Email Us
            </a>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
