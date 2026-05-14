import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Privacy policy | AGI Workforce',
  description: 'How AGI Workforce collects, uses, and protects your data.',
  alternates: { canonical: 'https://agiworkforce.com/privacy' },
};

export default function PrivacyPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Privacy policy.</h1>
          <p className="agi-page-lede">
            How we collect, use, and protect your data.{' '}
            <strong>
              We do not train on your data. We do not sell your data. We collect the minimum needed
              to run the service.
            </strong>{' '}
            Last updated: 2026-05-08.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">01 — What we collect</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Category</th>
                <th>Examples</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account</td>
                <td>Email, hashed password, account ID.</td>
                <td>Authentication.</td>
              </tr>
              <tr>
                <td>Billing</td>
                <td>Stripe customer ID, plan, invoice metadata. We never see your card.</td>
                <td>Subscription management.</td>
              </tr>
              <tr>
                <td>Conversations (cloud mode)</td>
                <td>Threads, messages, tool calls, attached files.</td>
                <td>Cross-device sync via Supabase. RLS-enforced; only you can read your rows.</td>
              </tr>
              <tr>
                <td>Conversations (local mode)</td>
                <td>SQLite on disk. Never leaves your machine.</td>
                <td>n/a</td>
              </tr>
              <tr>
                <td>BYOK keys</td>
                <td>Encrypted on device with AES-256-GCM. Master password unrecoverable.</td>
                <td>You stay in control of provider auth.</td>
              </tr>
              <tr>
                <td>Telemetry</td>
                <td>
                  Aggregated, anonymous usage counts via Sentry (error reporting), Google Analytics
                  and Google Tag Manager (anonymous traffic + funnel analytics, IP-anonymized). No
                  prompt content. Opt-in.
                </td>
                <td>Operational visibility.</td>
              </tr>
              <tr>
                <td>Logs</td>
                <td>Server logs with redacted bearer tokens. 30-day retention by default.</td>
                <td>Debugging and security.</td>
              </tr>
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            <strong>Hosted AI providers we may route requests to (cloud mode, optional):</strong>{' '}
            Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity, Moonshot, Groq, Mistral. BYOK mode
            routes from your client directly to the provider; cloud mode (Hobby tier and above)
            routes through our gateway. Local mode (Ollama, LM Studio) never contacts any of these.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">02 — What we do not collect</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Training data</h3>
              <p className="agi-reason-p">
                We do not train models on your prompts, responses, or files. Period.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Provider traffic in BYOK mode</h3>
              <p className="agi-reason-p">
                When you BYOK against Anthropic, OpenAI, Google, etc., the request goes from your
                client to the provider. We do not see, log, or store that traffic.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Local-mode anything</h3>
              <p className="agi-reason-p">
                Local mode (Ollama / LM Studio on your machine) is fully offline. No telemetry, no
                sync, no logs leave your laptop.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">03 — How we use it</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            To run the service, bill you, secure the system, respond to support requests, and comply
            with the law. We do not use your data to advertise to you, and we do not share it with
            advertisers. Aggregated, non-identifying analytics may be used to improve the product.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">04 — Sharing</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            We share data only with the subprocessors listed at{' '}
            <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
              /subprocessors
            </Link>{' '}
            (Supabase, Vercel, Fly.io, Stripe, Resend, Cloudflare), and only as necessary to run the
            service. We do not sell data. We may disclose data if compelled by valid legal process;
            we narrow such disclosures to the minimum required.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">05 — Retention and deletion</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>Account data</td>
                <td>
                  Retained while your account is active. Deleted within 30 days of account deletion
                  request.
                </td>
              </tr>
              <tr>
                <td>Conversations (cloud)</td>
                <td>Retained per your subscription. Org-level retention windows on Enterprise.</td>
              </tr>
              <tr>
                <td>Server logs</td>
                <td>
                  30 days by default. Up to 180 days for security incidents under investigation.
                </td>
              </tr>
              <tr>
                <td>Backups</td>
                <td>
                  Encrypted, 30-day rolling. Deletion propagates to backups within the same window.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">06 — Your rights</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Under GDPR, CCPA, and similar laws, you have the right to access, correct, delete, port,
            and object to processing of your personal data. To exercise any of these, email{' '}
            <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
              contact@agiworkforce.com
            </a>{' '}
            from your account email. We respond within 30 days. EU/UK customers can also lodge a
            complaint with their supervisory authority.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">07 — International transfers and EU residency</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            <strong>EU residency status:</strong> AGI Workforce data is hosted in the United States
            (us-east-2) by default. We do not currently offer European residency for stored data;
            European customers&rsquo; data is transferred to and processed in the US. For EU/UK
            personal data we use Standard Contractual Clauses through our DPA — see{' '}
            <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
              /dpa
            </Link>
            . EU/UK residency hosting is on our roadmap; see{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>{' '}
            for updates.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">08 — Children</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI Workforce is not directed at children under 13 (or 16 in the EU/UK). We do not
            knowingly collect data from children.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">09 — Changes</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            We may update this policy. Material changes are announced via email and on{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            . The &ldquo;last updated&rdquo; date at the top reflects the most recent revision.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">10 — Contact</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI Automation LLC, Austin, Texas, USA. Email{' '}
            <a href="mailto:contact@agiworkforce.com" style={{ color: 'var(--agi-ink)' }}>
              contact@agiworkforce.com
            </a>
            .
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/terms" className="agi-cta-ghost">
              Terms →
            </Link>
            <Link href="/dpa" className="agi-cta-ghost">
              DPA →
            </Link>
            <Link href="/cookies" className="agi-cta-ghost">
              Cookies →
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
