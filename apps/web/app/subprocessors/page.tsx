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
    name: 'OpenRouter',
    purpose:
      'Inference routing on Managed Cloud, in two situations. (1) Always, for the MiniMax, Qwen and Zhipu models — prompt content for those passes through OpenRouter on its way to the model provider. (2) As a failover for any other catalogued chat model when the direct route to its provider fails. That second case means prompt content for a model you selected from any provider can pass through OpenRouter, and we would rather say so than let the narrower first case imply otherwise.',
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
    name: 'Expo',
    purpose:
      'Two roles for the iOS and Android apps. (1) Push delivery: notification titles and bodies — including the names you give scheduled tasks — are relayed through Expo on their way to Apple and Google. (2) Over-the-air updates: every app launch requests an update manifest from Expo, which sees the device IP and build fingerprint.',
    region: 'United States',
  },
  {
    name: 'Resend',
    purpose:
      'Transactional email, in three narrow paths and no others. (1) Support escalation: when a live-support session is escalated, the conversation transcript and the contact email you gave are emailed to our support address (lib/support/handoff/escalation-email.ts). (2) Scheduled-task notifications: if you enable them in Settings, the task name and your email address are used to tell you a run finished — the body carries no task output (lib/services/notification-email-service.ts). (3) Operational alerts to us, carrying user-linked job identifiers (lib/services/video-incident-alert-service.ts). There is no account-lifecycle email: no signup, deletion-confirmation, breach or policy-change mail is sent by anything.',
    region: 'United States',
  },
  {
    name: 'Runway',
    purpose:
      'Video generation. The prompt text you type is sent to Runway when you generate a video with one of its models (app/api/media/video/generate/route.ts). Only reachable when an operator has configured a Runway key; otherwise the route refuses rather than silently choosing another provider.',
    region: 'United States',
  },
  {
    name: 'Perplexity',
    purpose:
      'Two distinct roles, and the second was previously undisclosed. (1) Inference for its own models on Managed Cloud, as listed in the model-provider row above. (2) The backend for the platform web-search tool: when the assistant searches the web for you, your search query is sent to Perplexity (lib/web-search/web-search-tool.ts). That happens on the model’s initiative during a conversation, not only when you visit a search box.',
    region: 'United States',
  },
  {
    name: 'Google (Play Android Publisher)',
    purpose:
      'Verifying Android in-app purchases. The purchase token from your device is sent to Google to confirm a subscription is genuine and current (lib/server/mobile-iap-store-verification.ts). Apple is deliberately NOT listed for the equivalent iOS path: Apple’s signed notifications are verified locally against bundled root certificates, so nothing is sent back to Apple.',
    region: 'United States',
  },
  {
    name: 'OpenStreetMap Foundation (Nominatim)',
    purpose:
      'Geocoding for the maps tool. A place name or location you ask about is sent to Nominatim to resolve it to coordinates (lib/services/map-geocoding-service.ts). Nominatim’s usage policy requires an identifying User-Agent, so the request is attributable to AGI rather than to you.',
    region: 'European Union',
  },
  {
    name: 'GitHub',
    purpose:
      'The GitHub connector. When you install it, repository content and metadata you authorise are read through the GitHub API on your behalf (lib/github-app.ts). Nothing is read until you install the app and grant it access, and you can revoke it at GitHub at any time.',
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
            , which you can subscribe to. <strong>We do not promise emailed notice.</strong> The
            product can send email in three narrow paths &mdash; support escalation, scheduled-task
            notifications, and operational alerts to us &mdash; and none of them can mail an
            arbitrary list of customers. Until something can, a commitment to email you about a
            subprocessor change is one we could not perform. To object to a new subprocessor on
            reasonable data protection grounds, write to us within 30 days of publication &mdash;
            the objection and termination route is in section 05 of the{' '}
            <Link href="/dpa#s-05" style={{ color: 'var(--agi-ink)' }}>
              DPA
            </Link>
            .
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">
            Corrections made on {POLICY_LAST_UPDATED.subprocessors}
          </p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            A review of what actually leaves this product found this page had been wrong in both
            directions, and we would rather publish the correction than quietly reissue the list.
          </p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Six recipients were missing</h3>
              <p className="agi-reason-p">
                Resend, Runway, Perplexity&rsquo;s web-search role, Google&rsquo;s Play verification
                API, OpenStreetMap&rsquo;s Nominatim and GitHub were all receiving data while absent
                from this page. They are listed above with what each one receives.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">
                An email provider was removed on 5 August that had never stopped running
              </h3>
              <p className="agi-reason-p">
                It was delisted because no email package appeared in our dependencies. It does not
                use one &mdash; it calls the provider&rsquo;s HTTP API directly, so the check that
                justified the removal could not have found it. Support transcripts were being
                emailed the whole time. That is the most serious thing this review found, and it is
                fixed above.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">The OpenRouter entry was narrower than the code</h3>
              <p className="agi-reason-p">
                It named three model families. OpenRouter is also the failover for every other
                catalogued chat model, so prompt content for a model from any provider can pass
                through it. The row now says so.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">One reported recipient turned out not to be one</h3>
              <p className="agi-reason-p">
                Apple was reported as receiving purchase identifiers alongside Google. It does not:
                Apple&rsquo;s signed receipts are verified on our own servers against bundled
                certificates, and nothing is sent back. We checked rather than adding the row, and
                we are noting the near-miss because a list padded with recipients that receive
                nothing is unreliable in the same way as one with gaps.
              </p>
            </li>
          </ul>
        </section>
        <section className="agi-section">
          <p className="agi-section-eyebrow">What about LLM providers?</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            When you BYOK against Anthropic, OpenAI, Google, or any other provider, that provider
            becomes a processor of <em>your</em> data, on <em>your</em> contract, not ours. We do
            not process those prompts; the request goes from your client to the provider you
            targeted, and no row in the table above is in that path.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Which surface that applies to, precisely.</strong> BYOK is a capability of the
            desktop app, the CLI and the VS Code extension.{' '}
            <strong>
              The web app at agiworkforce.com is cloud-only: it has no user-supplied-key path at
              all.
            </strong>{' '}
            Every model request you make in a browser is a Managed Cloud request on our keys,
            through the recipients listed above. We used to state the BYOK posture here without
            naming the surface, which invited exactly the wrong inference on the one surface where
            it does not hold. See{' '}
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
