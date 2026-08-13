import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Subprocessors',
  description:
    'Third parties that process customer data on AGI&rsquo;s behalf, with their purpose and region.',
  path: '/subprocessors',
});

/*
 * REMOVED 2026-08-05 — "Resend · Transactional email (account, billing, support)".
 *
 * No transactional email provider is wired anywhere in this repository: there is
 * no resend/sendgrid/postmark/mailgun/nodemailer/SES dependency in the web
 * manifest and no send call site. Two production files state the same thing in
 * terms — app/api/user/delete-account/route.ts ("there is no transactional email
 * provider anywhere in this repository") and
 * lib/services/organization-invitation-service.ts.
 *
 * Listing a processor that receives nothing is a defect in the opposite
 * direction from an omission: it makes the list unreliable, and it propped up
 * three separate promises of emailed notice that could not be performed. Do not
 * re-add the entry until an email provider is actually wired — and when it is,
 * add it here in the same change.
 */
const SUBS: { name: string; purpose: string; region: string }[] = [
  {
    name: 'Neon',
    purpose: 'Primary Postgres data store for account, chat, and application data.',
    region: 'United States',
  },
  {
    name: 'Clerk',
    purpose: 'Authentication, session, and user identity management.',
    region: 'United States',
  },
  {
    name: 'Vercel',
    purpose: 'Hosting and edge delivery for the web surface (agiworkforce.com).',
    region: 'Global edge',
  },
  {
    name: 'Fly.io',
    purpose:
      'Runtime for the real-time signaling server used by collaborative and multi-device sessions.',
    region: 'United States (San Jose)',
  },
  { name: 'Stripe', purpose: 'Payment processing for paid tiers.', region: 'United States' },
  {
    name: 'Cloudflare',
    purpose:
      'Two roles. (1) Cloudflare R2 object storage: files you upload and files the model generates are stored here. AGI serves catalogued files through a signed-in, active-workspace-scoped app route and does not return raw storage URLs in normal responses. Generated videos use a private bucket; images and other non-video files remain in a public bucket and can be opened without AGI sign-in if their underlying URL is obtained. (2) Edge delivery and DDoS protection for the marketing site.',
    region: 'Global edge',
  },
  //
  // The five entries below were absent while the services were live in
  // production. A subprocessor list that omits a processor of personal data is a
  // compliance defect, not a documentation gap — each of these is wired today:
  //
  {
    name: 'Sentry',
    purpose:
      'Error and performance monitoring. Receives crash reports and diagnostic context from the web surface and server routes.',
    region: 'United States',
  },
  {
    name: 'E2B',
    purpose:
      'Managed sandbox runtime. Executes code and processes files you supply during a Managed Cloud session. Sandbox execution is gated behind an explicit operator flag and is off by default; while it is off, nothing is sent here.',
    region: 'United States',
  },
  {
    name: 'Google Analytics',
    purpose:
      'Product analytics for the marketing site. Receives page views and device/browser metadata.',
    region: 'United States',
  },
  {
    name: 'Model providers (Managed Cloud)',
    purpose:
      'Inference for Managed Cloud chat: Anthropic, OpenAI, Google, xAI, DeepSeek, Moonshot and Perplexity. Your prompt and any attached content are sent to the provider serving the model you select. This applies to Managed Cloud only — in Local Mode nothing is sent, and under BYOK you contract with the provider directly.',
    region: 'United States and other regions, per provider',
  },
  {
    // Not optional to disclose: aggregator-routing.ts routes MiniMax, Qwen and
    // Zhipu through OpenRouter on AGI's own keys, so prompt content for those
    // models passes through OpenRouter as well as the model provider.
    name: 'OpenRouter',
    purpose:
      'Inference routing for the MiniMax, Qwen and Zhipu models on Managed Cloud. Prompt content for those models passes through OpenRouter on its way to the model provider.',
    region: 'United States',
  },
  {
    name: 'MiniMax, Qwen and Zhipu',
    purpose:
      'Inference for their own models on Managed Cloud, reached through OpenRouter rather than directly.',
    region: 'Outside the United States, per provider',
  },
  {
    name: 'Upstash',
    purpose: 'Rate limiting and ephemeral request state.',
    region: 'Global edge',
  },
  {
    // Easy to miss because no AGI code runs at Expo, but two mobile paths
    // terminate there. lib/services/push-notification-service.ts POSTs the
    // notification title and body — which carry the names users give their
    // scheduled tasks — to exp.host, and apps/mobile/app.config.js points
    // `updates.url` at u.expo.dev, which every cold start requests.
    name: 'Expo',
    purpose:
      'Two roles for the iOS and Android apps. (1) Push delivery: notification titles and bodies — including the names you give scheduled tasks — are relayed through Expo on their way to Apple and Google. (2) Over-the-air updates: every app launch requests an update manifest from Expo, which sees the device IP and build fingerprint.',
    region: 'United States',
  },
];

export default function SubprocessorsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Subprocessors.</h1>
          <p className="agi-page-lede">
            Third parties that process customer data on our behalf.{' '}
            <strong>
              This page is Annex III to our{' '}
              <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
                data processing addendum
              </Link>
              . When the list changes we update it here and record the change on{' '}
              <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
                /changelog
              </Link>
              , and customers have 30 days from publication to object.
            </strong>{' '}
            Last updated: {POLICY_LAST_UPDATED.subprocessors}.
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">Current subprocessors</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Subprocessor</th>
                <th>Purpose</th>
                <th>Region</th>
              </tr>
            </thead>
            <tbody>
              {SUBS.map((s) => (
                <tr key={s.name}>
                  <td style={{ width: '32%', verticalAlign: 'top' }}>{s.name}</td>
                  <td>{s.purpose}</td>
                  <td style={{ width: '18%', color: 'var(--agi-ink-quiet)' }}>{s.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">How you find out about a change</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Additions and replacements are published on this page and recorded on{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            , which you can subscribe to. We deliberately do not promise emailed notice:{' '}
            <strong>
              there is no transactional email system in this product today, so a commitment to email
              you is one we could not perform
            </strong>
            . To object to a new subprocessor on reasonable data protection grounds, write to us
            within 30 days of publication — the objection and termination route is in section 05 of
            the{' '}
            <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
              DPA
            </Link>
            .
          </p>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What about LLM providers?</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            When you BYOK against Anthropic, OpenAI, Google, or any other provider, that provider
            becomes a processor of <em>your</em> data, on <em>your</em> contract, not ours. We do
            not process your prompts; the request flows directly from your client to the provider
            you targeted. See{' '}
            <Link href="/byok" style={{ color: 'var(--agi-ink)' }}>
              BYOK
            </Link>{' '}
            for the full posture.
          </p>
        </section>
        <MarketingFooter />
      </main>
    </div>
  );
}
