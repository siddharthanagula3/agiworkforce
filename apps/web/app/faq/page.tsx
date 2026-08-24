import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { BYOK_SURFACES, DESKTOP_LOCAL_RUNTIMES, MARKETING } from '../../lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'FAQ',
  description:
    'Frequently asked questions about providers, BYOK, Local mode, AGI managed cloud, and security.',
  path: '/faq',
});

const QA: { q: string; a: string }[] = [
  {
    q: 'How many providers do you support?',
    a: `${MARKETING.providers.display} provider integrations, including Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Qwen, Moonshot and Zhipu. The CLI can additionally route to a custom OpenAI-compatible endpoint you declare in its own config file, over https or localhost only; Desktop and Web have no setting that points AGI at an arbitrary endpoint, so this is a CLI capability rather than a product-wide one. Desktop Local mode also supports four verified runtimes: ${DESKTOP_LOCAL_RUNTIMES.label}. The in-product catalog is the current source of truth.`,
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
    a: 'AGI does not use customer conversation content to train AGI-owned models, and we do not sell your data. Be precise about the part people misread: in managed cloud we send your prompt and attachments to the provider serving the model you selected. MiniMax, Qwen and Zhipu route through OpenRouter, which is also the failover for every other chat model in the catalogue, so content for a model from any provider can pass through it. Those third parties handle that content under their applicable terms and data-use policies — our statement about AGI-owned models is not a promise on their behalf. In BYOK mode your own provider account and terms govern, and in Local mode none of them are contacted. Recipients are listed at /subprocessors.',
  },
  {
    q: 'Who can read my conversations?',
    a: 'In Local mode, nobody but you — they never reach us. In managed cloud we store them, so the honest answer is not "nobody": access is limited to people who need it to operate or support the service, and every request is scoped to the account that owns it by two layers of access control. The privacy policy states what those layers are and, more usefully, where each one stops.',
  },
  {
    q: 'Do you sell my data, or use it for ads?',
    a: 'No to both. We do not sell personal data, we do not share it for cross-context behavioural advertising, we run no advertising and we set no advertising cookies. Analytics is opt-in and stays off until you turn it on. The third parties that do receive data, and exactly what each one gets, are listed on the subprocessors page.',
  },
  {
    q: 'How do I delete everything, or get a copy of it?',
    a: 'Both are self-serve in account settings. Export returns your data as a download. Deletion is scheduled 24 hours out and then performed by a daily job that also deletes your identity at our authentication provider. No confirmation email is sent, but cancellation is self-serve too: sign back in and cancel from Settings > Account any time before the 24 hours are up. A short list of things is kept on purpose, and the privacy policy has a table of exactly what and why.',
  },
  {
    q: 'What if I never made an account — can you still delete what you hold?',
    a: 'Yes, but not automatically. An email address you gave a waitlist, or a consent you gave without signing in, is not reachable by account deletion because there is no account to delete, and nothing ages those out on a schedule. Use the request form on the data-rights page and we will remove them.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Cancelling a subscription does not delete your account or your content — the account continues on the free tier and your data stays until you delete it. If you want it gone, delete the account; if you want a copy first, export it.',
  },
  {
    q: 'Are you GDPR or DPDP compliant?',
    a: 'Those are not badges anyone issues, so a plain yes would be worth nothing. What we publish instead is the working: a per-regime status ledger on the trust page with a date on every line and what would prove it, an India-specific notice under the Digital Personal Data Protection Act, and a security page that lists what we have NOT done alongside what we have. We hold no SOC 2 report and no ISO 27001 certificate, and we say so in the same places we say what we do have.',
  },
  {
    q: 'What happens to my master password?',
    a: 'The Desktop master password is unrecoverable by design. We never have it. If you forget it, your encrypted keys cannot be decrypted. Back it up.',
  },
  {
    q: 'Is there an Enterprise plan?',
    a: 'Enterprise is contract-scoped rather than self-serve — there is no checkout for it, so it starts with a conversation. On what actually exists rather than what is planned: single sign-on and SCIM directory provisioning are built and are provisioned by us for an organisation. A customer-facing audit-log export and per-organisation retention windows are NOT built, and we would rather say that here than let "Enterprise" imply the whole category. Contact sales to discuss requirements and timing.',
  },
  {
    q: 'Where do you host data?',
    a: 'Hosted data lives in the United States. We do not offer data residency in the EU, the UK or India, and we are not publishing a date for one — if residency is a requirement for you, we do not meet it today. Local conversations never leave your device in the first place, and BYOK requests go from your client straight to your provider.',
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
          {/*
            The count is derived, not typed. It read "Ten questions" while the
            list held sixteen — a hardcoded number next to a list is a claim
            that goes stale the first time someone adds an entry, which is
            exactly what happened.
          */}
          <h2 id="agi-faq-qa-title" className="agi-fl-h2">
            {QA.length} questions, {QA.length} straight answers.
          </h2>
          <p className="agi-fl-section-lede">
            Providers, trust modes, managed cloud, billing, and what happens to your data. The short
            version of everything the rest of the site covers at length. For the data questions in
            more depth there is a page of its own at{' '}
            <Link href="/data-use" style={{ color: 'var(--agi-ink)' }}>
              how we use your data
            </Link>
            , and the policy that governs them all is the{' '}
            <Link href="/privacy" style={{ color: 'var(--agi-ink)' }}>
              privacy policy
            </Link>
            .
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
