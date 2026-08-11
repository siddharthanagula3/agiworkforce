import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { POSITIONING } from '../../lib/marketing-constants';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Privacy policy',
  description:
    'What AGI collects, what it does not, and how that differs across Local, BYOK and Managed Cloud. Includes the retention schedule the product actually enforces.',
  path: '/privacy',
});

/*
 * PRIVACY POLICY
 *
 * CLAIMS REMOVED HERE — DO NOT RESTORE WITHOUT THE IMPLEMENTATION:
 *
 *  - "RLS-enforced; only you can read your rows" as an absolute. Database RLS is
 *    defined and forced on user-scoped tables, but it only bites where the
 *    request identity is bound per connection — the user-scoped sync paths.
 *    Migration db/neon/0037_rls_user_isolation.sql states this caveat itself.
 *    The honest claim is two layers, and that is what section 01 now says.
 *  - "Google Tag Manager" and "IP-anonymized". No GTM container is loaded — the
 *    analytics component loads gtag.js directly — and the gtag config sets no
 *    IP-anonymisation option.
 *  - "anonymous ... via Sentry". Error reports retain a stable user id by design.
 *  - "Server logs: 30 days ... up to 180 days" and "Backups: encrypted, 30-day
 *    rolling; deletion propagates to backups within the same window". Nothing in
 *    this repository sets, enforces, or tests any of those numbers, and no code
 *    touches a backup during erasure. Vendor-governed windows are now described
 *    as vendor-governed.
 *  - "Org-level retention windows on Enterprise". No control reads or enforces a
 *    per-organisation conversation retention window on the conversation path.
 *  - "Material changes are announced via email". There is no transactional email
 *    provider in this repository.
 *
 * CLAIM ADDED: billing-record retention (BIZ-046). The retention schedule had a
 * row for the account and none for the money. Erasure deletes `subscriptions`,
 * `credit_transactions`, `token_credits` and `usage_events`
 * (lib/server/account-erasure.ts USER_SCOPED_TABLES; the immediate
 * `delete_user_data()` path in db/neon/0020_functions.sql deletes the first
 * three), while `organization_usage_ledger.user_id` is nulled and the row kept
 * (ANONYMIZED_USER_COLUMNS), and `credit_idempotency_keys` /
 * `credit_settlement_jobs` are kept by BOTH paths (UNDELETED_USER_TABLES). None
 * of that was disclosed. The row says so, and says the part that is still not
 * true of any code: nothing ages billing rows out — `credit_idempotency_keys`
 * carries a 24-hour `expires_at` and `cleanup_expired_idempotency_keys()`
 * exists, but no cron route calls it, so do not describe a window here until
 * one runs.
 *
 * CLAIM CORRECTED: object storage. Clients now receive only the same-origin
 * `/api/files/{mediaAssetId}` address from `authenticatedMediaUrl()`. That route
 * authenticates the caller, resolves the active workspace, filters the catalog
 * row by owner + workspace + `deleted_at`, and returns `private, no-store`.
 * The storage layer is still split: generated videos use the private bucket,
 * while images/files use `putObject()` in the public bucket. Normal client
 * responses no longer expose those raw URLs, but the underlying non-video
 * object remains public if its storage URL is obtained. Do not collapse these
 * two access layers into either absolute.
 */

export default function PrivacyPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Privacy policy.</h1>
          <p className="agi-page-lede">
            What we collect, what we do not, and how that changes depending on which mode you run.{' '}
            <strong>
              AGI does not use customer conversation content to train AGI-owned models. We do not
              sell your data. {POSITIONING.trustBoundary}
            </strong>{' '}
            Last updated: {POLICY_LAST_UPDATED.privacy}. Managed Cloud is in public alpha.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">00 &middot; The mode decides the answer</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Most privacy policies have one answer. This product has three, because Local, BYOK and
            Managed Cloud are separate trust boundaries and your data goes to genuinely different
            places in each. Read this table first; the rest of the page is detail.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Mode</th>
                <th>Where your prompts go</th>
                <th>What we hold</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ width: '18%', verticalAlign: 'top' }}>Local</td>
                <td style={{ verticalAlign: 'top' }}>
                  To a model runtime on your own machine. Nothing is transmitted to us and nothing
                  is silently routed to BYOK or Managed Cloud.
                </td>
                <td>Nothing about the conversation. Conversations live in SQLite on your disk.</td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>BYOK</td>
                <td style={{ verticalAlign: 'top' }}>
                  From your client straight to the provider you targeted, on your own API key. We
                  are not in that request path.
                </td>
                <td>
                  Your account and settings. Not the prompt traffic. Your key is encrypted on your
                  device and the master password is not recoverable by us.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Managed Cloud</td>
                <td style={{ verticalAlign: 'top' }}>
                  Through our gateway to the provider serving the model you selected. Managed Cloud
                  is in public alpha.
                </td>
                <td>
                  Conversations, files, projects, memories, schedules and settings, so they sync
                  across your devices. This is the only mode where we act as your processor &mdash;
                  see the{' '}
                  <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
                    DPA
                  </Link>
                  .
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">01 &middot; What we collect</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Category</th>
                <th>Examples</th>
                <th>Why, and how it is protected</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Account</td>
                <td>Email, account ID, authentication metadata held by our identity provider.</td>
                <td>Authentication. We do not store your password ourselves.</td>
              </tr>
              <tr>
                <td>Billing</td>
                <td>
                  Stripe customer ID, plan, invoice metadata. Card details go to Stripe directly and
                  we never see or store them.
                </td>
                <td>Subscription management.</td>
              </tr>
              <tr>
                <td>Conversations (Managed Cloud)</td>
                <td>Threads, messages, tool calls, and references to attached files.</td>
                <td>
                  Cross-device sync. Two layers of access control: every route resolves the
                  authenticated user and scopes the query to them, and Postgres row-level security
                  policies are forced on the user-scoped tables behind the sync paths that bind the
                  request identity per connection. It is defence in depth, not one absolute switch.
                </td>
              </tr>
              <tr>
                <td>Files you upload or generate</td>
                <td>Attachments, generated images, and other stored media.</td>
                <td>
                  Stored in Cloudflare R2 and catalogued in Neon. The product gives clients an
                  authenticated same-origin file route that requires both the owning account and its
                  active Personal or organisation workspace to match. Missing, deleted, foreign, and
                  inactive-workspace files all return the same not-found response, and those
                  responses are private and not stored by browser caches. Generated videos use a
                  separate private bucket. Images and other non-video files remain in a public R2
                  bucket: normal product responses do not expose its raw URLs, but anyone who
                  obtains an underlying storage URL can access that object without signing in.
                </td>
              </tr>
              <tr>
                <td>Conversations (Local)</td>
                <td>SQLite on disk. Not silently routed to BYOK or Managed Cloud.</td>
                <td>We hold none of it.</td>
              </tr>
              <tr>
                <td>BYOK keys</td>
                <td>Encrypted on device. Master password unrecoverable by us.</td>
                <td>You stay in control of provider auth.</td>
              </tr>
              <tr>
                <td>Telemetry</td>
                <td>
                  Error and performance reports via Sentry, and page-view analytics via Google
                  Analytics. Both are opt-in and load only after you consent; the consent gate fails
                  closed, so a failure to read your choice means analytics stays off. No prompt
                  content is sent to either.
                </td>
                <td>
                  Operational visibility. Error reports are content-scrubbed and send no default
                  personal data, but they <em>do</em> retain a stable user id so a crash can be tied
                  to a session &mdash; they are pseudonymous, not anonymous.
                </td>
              </tr>
              <tr>
                <td>Logs and security events</td>
                <td>
                  Server logs with bearer tokens redacted, plus an append-only security audit log of
                  account-lifecycle and administrative events.
                </td>
                <td>Debugging, abuse prevention, and incident investigation.</td>
              </tr>
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            <strong>Hosted AI providers we may route requests to (Managed Cloud):</strong>{' '}
            Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity and Moonshot directly; MiniMax,
            Qwen and Zhipu through OpenRouter, which therefore also handles those requests. Which
            one depends on the model you select. The full current list with regions is at{' '}
            <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
              /subprocessors
            </Link>
            . BYOK routes from your client directly to the provider; Local contacts none of them.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">02 &middot; What we do not collect</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Training data</h3>
              <p className="agi-reason-p">
                AGI does not train AGI-owned models on customer prompts, responses, or files. In
                Managed Cloud, we send prompts and attached content to the provider serving the
                model you select and receive its response; for routed models, the request passes
                through OpenRouter. Those third parties handle that content under their applicable
                terms and data-use policies; this statement about AGI-owned models is not a promise
                on their behalf. In BYOK mode, provider handling is governed by your own provider
                account and terms.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Provider traffic in BYOK mode</h3>
              <p className="agi-reason-p">
                When you BYOK against Anthropic, OpenAI, Google or another provider, the request
                goes from your client to the provider. We do not see, log, or store that traffic.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Local-mode anything</h3>
              <p className="agi-reason-p">
                Local mode uses on-device or local model routes and does not silently send chats,
                files, or developer sessions to BYOK providers or Managed Cloud.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Advertising and cross-context profiles</h3>
              <p className="agi-reason-p">
                We run no advertising, set no advertising cookies, and do not sell or share personal
                data for cross-context behavioural advertising.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">03 &middot; How we use it</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            To run the service, bill you, secure the system, prevent abuse, respond to support
            requests, and comply with the law. Where the GDPR applies, our bases are performance of
            the contract with you (running the service and billing), our legitimate interests
            (security, abuse prevention, and keeping the service working), your consent (telemetry
            and analytics only), and legal obligation.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">04 &middot; Sharing</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            We share data only with the subprocessors listed at{' '}
            <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
              /subprocessors
            </Link>
            , and only as necessary to run the service. We do not sell data. We may disclose data if
            compelled by valid legal process; we narrow such disclosures to the minimum required. If
            AGI is involved in a merger or sale of assets, personal data may transfer as part of it,
            and this policy continues to apply until the acquirer publishes its own.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">05 &middot; Retention</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Every row below is a job or a mechanism that exists in the product, with the ones we do
            not control named as such. We would rather publish a shorter schedule that is true than
            a complete-looking one that is not.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Data</th>
                <th>Retention</th>
                <th>How it is enforced</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ width: '22%', verticalAlign: 'top' }}>Account and its content</td>
                <td style={{ verticalAlign: 'top' }}>
                  Kept while your account is active. Permanently erased 24 hours after a deletion
                  request.
                </td>
                <td>
                  The request records a deletion timestamp and schedules erasure 24 hours out; a
                  daily scheduled job then erases your user-scoped records and stored objects and
                  deletes your identity at our authentication provider.
                </td>
              </tr>
              <tr>
                <td style={{ width: '22%', verticalAlign: 'top' }}>Billing records</td>
                <td style={{ verticalAlign: 'top' }}>
                  Kept while your account exists. Most of it is erased with the account; some of it
                  deliberately is not.
                </td>
                <td>
                  Your subscription, credit ledger and usage rows are erased with everything else.
                  Three things survive on purpose, and you should know about them: an
                  organisation&rsquo;s billing history keeps the ledger row with your user id
                  removed, because the record belongs to that organisation rather than to you;
                  double-charge protection keys and any payment still moving when you delete are
                  kept, because deleting those can charge you twice or lose money we owe you; and
                  Stripe holds its own record of your payments and invoices under its retention, not
                  ours &mdash; card numbers go to Stripe directly and never reach us. No maximum age
                  is enforced on billing rows today, and we will not publish one until a job deletes
                  them.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Conversations (Managed Cloud)</td>
                <td style={{ verticalAlign: 'top' }}>
                  Kept until you delete them or delete your account.
                </td>
                <td>
                  There is no automatic expiry on ordinary conversations, and no per-organisation
                  retention window is enforced on them today. We will not describe one until it
                  runs.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Temporary chats (Managed Cloud)</td>
                <td style={{ verticalAlign: 'top' }}>About 30 days.</td>
                <td>
                  A daily scheduled job hard-deletes temporary conversations past the window;
                  messages go with them.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Deleted files</td>
                <td style={{ verticalAlign: 'top' }}>
                  30 days in the recently-deleted bin, then the bytes are removed.
                </td>
                <td>
                  A daily scheduled job hard-deletes the records and deletes the underlying objects
                  from storage. If an object deletion fails, the record survives and the next run
                  retries it.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Sandboxes</td>
                <td style={{ verticalAlign: 'top' }}>Reclaimed once unreachable.</td>
                <td>
                  A daily scheduled job reclaims abandoned sandboxes whose resume mapping has
                  expired.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Security audit log</td>
                <td style={{ verticalAlign: 'top' }}>90 days.</td>
                <td>
                  A database routine deletes entries older than 90 days.{' '}
                  <strong>It is run by an administrator, not on a schedule</strong>, so treat 90
                  days as the policy rather than an automatic guarantee.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Server logs and backups</td>
                <td style={{ verticalAlign: 'top' }}>Vendor-governed.</td>
                <td>
                  Platform logs and database or object-storage snapshots are retained according to
                  our hosting vendors&rsquo; own configuration. We do not operate a separate process
                  that reaches into vendor snapshots to remove individual records, and we will not
                  claim a number we do not set.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">06 &middot; Your rights, and how to use them</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Depending on where you live and subject to applicable exceptions, privacy laws such as
            the GDPR, UK GDPR, and CCPA may give you rights of access, correction, deletion,
            portability, objection or restriction, and non-discrimination. Two requests are
            self-serve in the product:
          </p>
          <table className="agi-ledger" style={{ marginTop: 16 }}>
            <tbody>
              <tr>
                <td style={{ width: '22%', verticalAlign: 'top' }}>Export</td>
                <td>
                  Signed in, you can export your data from the account export endpoint at any time.
                  It is rate limited and each export is recorded in the security audit log.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Deletion</td>
                <td>
                  Request account deletion from the product. Erasure is scheduled 24 hours later and
                  then performed. Two limits stated plainly: we send no confirmation email, because
                  there is no transactional email system in the product; and there is no self-serve
                  way to cancel a scheduled deletion, so if you change your mind inside the 24-hour
                  window you must reach support.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Everything else</td>
                <td>
                  Email{' '}
                  <a
                    href={contactMailto(CONTACT_SUBJECTS.privacy)}
                    style={{ color: 'var(--agi-ink)' }}
                  >
                    {CONTACT_EMAIL}
                  </a>{' '}
                  from your account address with the subject line &ldquo;
                  {CONTACT_SUBJECTS.privacy}&rdquo;. Applicable law determines the response period.
                  You may use an authorised agent where the law allows.
                </td>
              </tr>
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            EU, UK and Swiss residents may also lodge a complaint with their supervisory authority.
            California residents: we do not sell or share personal information, so there is no
            opt-out to exercise, and the CCPA service-provider terms we operate under are in section
            06 of the{' '}
            <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
              DPA
            </Link>
            .
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">07 &middot; International transfers</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI data is hosted in the United States.{' '}
            <strong>We do not offer EU or UK data residency</strong>, so European customers&rsquo;
            data is transferred to and processed in the US. For EU, UK and Swiss personal data we
            rely on the Standard Contractual Clauses with the UK Addendum and the Swiss adaptations,
            set out in section 06 of the{' '}
            <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
              DPA
            </Link>
            . AGI has not appointed a representative under GDPR Art. 27; the current position is at{' '}
            <Link href="/legal/eu-representative" style={{ color: 'var(--agi-ink)' }}>
              /legal/eu-representative
            </Link>
            .
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">08 &middot; Children</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI accounts are for people aged 18 and over; 13- to 17-year-olds may use it only under
            an account opened and supervised by a parent, guardian or school, as set out in section
            02 of the{' '}
            <Link href="/terms" style={{ color: 'var(--agi-ink)' }}>
              terms
            </Link>
            . We do not knowingly collect personal data from children under 13, or under the higher
            digital-consent age where one applies. If you believe a child has provided us data,
            email us and we will delete it.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">09 &middot; Changes</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            We may update this policy. The current version is always at this URL with the revision
            date at the top, and material changes are recorded on{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            . We do not operate a transactional email system, so we do not promise emailed notice of
            a change.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">10 &middot; Contact</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            {LEGAL_ENTITY}, {NOTICE_ADDRESS}. Email{' '}
            <a href={contactMailto(CONTACT_SUBJECTS.privacy)} style={{ color: 'var(--agi-ink)' }}>
              {CONTACT_EMAIL}
            </a>
            .
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/terms" className="agi-cta-ghost">
              Terms &rarr;
            </Link>
            <Link href="/dpa" className="agi-cta-ghost">
              DPA &rarr;
            </Link>
            <Link href="/cookies" className="agi-cta-ghost">
              Cookies &rarr;
            </Link>
            <Link href="/subprocessors" className="agi-cta-ghost">
              Subprocessors &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
