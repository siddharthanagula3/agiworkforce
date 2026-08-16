import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GRIEVANCE_OFFICER_NAME,
  GRIEVANCE_RESPONSE_TARGET_DAYS,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';
import { CONSENT_PURPOSES } from '@/lib/consent-purposes';

export const metadata = buildMetadata({
  title: 'India — DPDP notice',
  description:
    'The notice required by the Digital Personal Data Protection Act, 2023: what personal data AGI processes, for which purposes, who it goes to, how to exercise your rights as a Data Principal, and the grievance contact.',
  path: '/privacy/india',
});

export default function IndiaDpdpNoticePage() {
  return (
    <div data-design="agi" data-legal-review="pending-counsel">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">
            India &middot; Digital Personal Data Protection Act, 2023
          </p>
          <h1 className="agi-page-h1">Notice to Data Principals in India.</h1>
          <p className="agi-page-lede">
            This is the itemised notice the DPDP Act requires us to give you before we process your
            personal data. It sits alongside the{' '}
            <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
              main privacy policy
            </Link>
            , which describes the same processing in more detail;{' '}
            <strong>where the two differ on your rights in India, this page governs.</strong> Last
            updated: {POLICY_LAST_UPDATED.indiaPrivacy}. Managed Cloud is in public alpha.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">00 &middot; Who is responsible</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            {LEGAL_ENTITY}, {NOTICE_ADDRESS}, is the <strong>Data Fiduciary</strong> for the
            processing described here &mdash; it decides why and how your personal data is
            processed. You are the <strong>Data Principal</strong>. AGI has no establishment in
            India and no data centre in India; your data is hosted in the United States, which
            section 06 explains.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">01 &middot; The mode decides what we hold</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Most of this notice depends on which mode you run, because Local, BYOK and Managed Cloud
            are separate trust boundaries and your data goes to genuinely different places in each.
            Read this first.
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
                <td>
                  Nothing about the conversation. It lives in SQLite on your disk, where this notice
                  has nothing to describe.
                </td>
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
                  Through our gateway to the provider serving the model you selected.
                </td>
                <td>
                  Conversations, files, projects, memories, schedules and settings, so they sync
                  across your devices.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">02 &middot; What we process, and for which purpose</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            The Act requires the purpose to be specific and the data to be limited to what that
            purpose needs. Each row below is one purpose, not a category we might later reuse.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Personal data</th>
                <th>Purpose it is processed for</th>
                <th>Why we may process it</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ width: '24%', verticalAlign: 'top' }}>
                  Email address, account identifier, authentication metadata
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  Creating and securing your account. Held by our identity provider; we do not store
                  your password.
                </td>
                <td>
                  Your request &mdash; you asked us to create the account, and the account cannot
                  exist without it.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  Billing identifiers, plan, invoice metadata
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  Taking payment and managing your subscription. Card details go to Stripe directly
                  and never reach us.
                </td>
                <td>Performing the paid service you signed up for.</td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  Conversations, files, projects, memories (Managed Cloud only)
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  Running the assistant and syncing your work across your devices.
                </td>
                <td>
                  Providing the Managed Cloud service you chose to use. Local and BYOK do not
                  produce this data for us.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  Error reports and performance traces (Sentry)
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  Diagnosing crashes. Content-scrubbed, but a stable user id is retained so a crash
                  can be tied to a session &mdash; pseudonymous, not anonymous.
                </td>
                <td>Your consent. Off until you turn it on.</td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Aggregated page views (Google Analytics 4)</td>
                <td style={{ verticalAlign: 'top' }}>
                  Understanding which parts of the product get used.
                </td>
                <td>
                  Your consent, recorded per purpose. The gate fails closed: if your choice cannot
                  be read, analytics stays off.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  Email address given on the early-access list
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  Telling you when enterprise features open. Optionally, product updates &mdash; a
                  separate box you can leave unticked or withdraw on its own.
                </td>
                <td>Your consent, recorded before the address is stored.</td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  Server logs and an append-only security audit log
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  Debugging, preventing abuse, and investigating security incidents. Bearer tokens
                  are redacted.
                </td>
                <td>Keeping the service secure and available.</td>
              </tr>
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            <strong>What we do not do with it.</strong> AGI does not train AGI-owned models on your
            prompts, responses or files. We run no advertising, set no advertising cookies, and do
            not sell or share personal data for cross-context behavioural advertising.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">
            03 &middot; The consent we ask for, one purpose at a time
          </p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Consent under this Act has to be specific, unbundled, and given by a clear affirmative
            action. So every box is unticked when you meet it, an optional purpose never blocks a
            necessary one, and every decision &mdash; including the boxes you leave unticked &mdash;
            is recorded against the revision of this notice that was on screen. These are the
            purposes we ask about:
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Purpose</th>
                <th>What it covers</th>
                <th>Required?</th>
              </tr>
            </thead>
            <tbody>
              {CONSENT_PURPOSES.map((purpose) => (
                <tr key={purpose.id}>
                  <td style={{ width: '24%', verticalAlign: 'top' }}>{purpose.label}</td>
                  <td style={{ verticalAlign: 'top' }}>{purpose.description}</td>
                  <td style={{ width: '18%', verticalAlign: 'top' }}>
                    {purpose.necessaryForRequest
                      ? 'Required for the thing you asked for'
                      : 'Optional — declining costs you nothing'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            Withdrawing is as easy as giving: change any of them at{' '}
            <Link href={CANONICAL_POLICY_ROUTES.dataRights} style={{ color: 'var(--agi-ink)' }}>
              /privacy/requests
            </Link>
            , with no email and no support ticket. Withdrawal stops the future processing that
            depended on it; it does not undo processing that already lawfully happened, and it does
            not delete your account &mdash; that is a separate request on the same page.{' '}
            <strong>
              AGI is not registered with a Consent Manager under section 6(7), so consent is given
              to us directly rather than through one.
            </strong>
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">04 &middot; Who else receives it</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            The published list, with what each one receives and where it runs, is at{' '}
            <Link href={CANONICAL_POLICY_ROUTES.subprocessors} style={{ color: 'var(--agi-ink)' }}>
              /subprocessors
            </Link>
            . In summary: an identity provider holds your login, Stripe holds your payments, our
            hosting and database vendors hold what you store in Managed Cloud, object storage holds
            your files, and error/analytics vendors receive only what section 02 describes and only
            with your consent.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            <strong>
              That published list is currently incomplete, and we would rather say so here than let
              you rely on it.
            </strong>{' '}
            A review completed on {POLICY_LAST_UPDATED.indiaPrivacy} found recipients that receive
            personal data and are not on it: an email provider used for support escalations and
            scheduled-task notifications, a video-generation provider that receives the prompt text
            you type, a geocoding service that receives location queries you make, and the Apple and
            Google store APIs that receive purchase identifiers on mobile. Correcting that page is a
            tracked open item. If your decision to use this service depends on the full recipient
            list, ask the grievance contact in section 08 before you sign up.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            <strong>Model providers.</strong> In Managed Cloud, the prompt and any attached content
            go to the provider serving the model you selected, and for routed models the request
            passes through OpenRouter. Those providers handle that content under their own terms and
            data-use policies; our no-training statement is about AGI-owned models and is not a
            promise on their behalf. In BYOK the request goes from your client straight to the
            provider on your key, governed by your own account with them. In Local, none of them are
            contacted.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">05 &middot; How long we keep it</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            The Act requires erasure once the purpose is no longer being served, unless retention is
            required by law. Every row below is a job or a mechanism that exists in the product, and
            the ones we do not control are named as such. The full schedule, including billing
            records, is section 05 of the{' '}
            <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
              privacy policy
            </Link>
            .
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Data</th>
                <th>Retention</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ width: '32%', verticalAlign: 'top' }}>Account and its content</td>
                <td>
                  Kept while your account is active. Permanently erased 24 hours after a deletion
                  request, by a daily scheduled job that also deletes your identity at our
                  authentication provider.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Conversations (Managed Cloud)</td>
                <td>
                  Kept until you delete them or delete your account. There is no automatic expiry on
                  ordinary conversations today, and we will not describe one until it runs.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Temporary chats</td>
                <td>About 30 days, hard-deleted by a daily job.</td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Deleted files</td>
                <td>
                  30 days in the recently-deleted bin, then the underlying objects are removed.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Security audit log</td>
                <td>
                  90 days as a policy. The routine that enforces it is run by an administrator, not
                  on a schedule, so treat it as the policy rather than an automatic guarantee.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Consent records</td>
                <td>
                  Kept for as long as the account exists, including withdrawn consents, because a
                  record that consent was once held is the evidence this Act asks us to be able to
                  produce. Erased with the account.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Early-access list email addresses</td>
                <td>
                  <strong>No maximum age is enforced today.</strong> The address is removed on
                  request via the grievance contact below. We will not publish a window until a job
                  deletes them.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Server logs and backups</td>
                <td>
                  Vendor-governed. We do not operate a process that reaches into vendor snapshots to
                  remove individual records, and we will not claim a number we do not set.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">06 &middot; Where it goes, and out of India</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            <strong>Your personal data is processed and stored in the United States.</strong> AGI
            does not offer data residency in India, so using this service means your personal data
            leaves India. The Act permits transfer outside India except to territories the Central
            Government restricts by notification; whether any notification affects the United States
            is a question of the live notification list on the date you read this, and we will not
            assert an answer to it here. If you need Indian data residency, we do not have it, and
            you should not sign up expecting it.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">07 &middot; Your rights, and what actually happens</p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Right</th>
                <th>How to use it, and what the product really does</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ width: '26%', verticalAlign: 'top' }}>
                  Access &mdash; a summary of your data and who it has been shared with
                </td>
                <td>
                  Signed in, export your data from the account export endpoint at any time. It is
                  rate limited and each export is recorded in the security audit log. The list of
                  recipients is section 04 and{' '}
                  <Link
                    href={CANONICAL_POLICY_ROUTES.subprocessors}
                    style={{ color: 'var(--agi-ink)' }}
                  >
                    /subprocessors
                  </Link>
                  ; the export does not enumerate them per record.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Correction, completion and updating</td>
                <td>
                  Profile and settings are editable in the product. For anything you cannot edit
                  yourself, use the request form below and say what is wrong; we correct it.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Erasure</td>
                <td>
                  Request account deletion in the product. Erasure is scheduled 24 hours later and
                  then performed. Two limits, stated plainly: you get no confirmation email, because
                  the only email this product sends is support-escalation and scheduled-task
                  notification &mdash; there is no account-lifecycle email path; and there is no
                  self-serve way to cancel a scheduled deletion, so inside that 24-hour window you
                  must reach us.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Withdraw consent</td>
                <td>
                  <Link
                    href={CANONICAL_POLICY_ROUTES.dataRights}
                    style={{ color: 'var(--agi-ink)' }}
                  >
                    /privacy/requests
                  </Link>{' '}
                  &mdash; per purpose, immediately, without contacting anyone.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Grievance redressal</td>
                <td>
                  Section 08. Use it before approaching the Data Protection Board &mdash; the Act
                  expects you to have exhausted our route first.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>
                  Nominate someone to exercise your rights if you die or become incapacitated
                </td>
                <td>
                  <strong>Not self-serve.</strong> There is no nomination field in the product
                  today. Send the nomination to the grievance contact in section 08 and we will
                  record it against your account manually. This is an open item, not a finished
                  feature.
                </td>
              </tr>
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            The Act also places duties on you: do not impersonate someone else when giving your
            data, do not suppress material information when it is legally required, and do not file
            false or frivolous grievances.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">08 &middot; Grievance redressal</p>
          <div className="agi-callout">
            <h3 className="agi-callout-h">{GRIEVANCE_OFFICER_NAME}</h3>
            <p className="agi-callout-p">
              Email{' '}
              <a
                href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)}
                style={{ color: 'var(--agi-ink)' }}
              >
                {CONTACT_EMAIL}
              </a>{' '}
              with the subject line &ldquo;{CONTACT_SUBJECTS.dpdpGrievance}&rdquo;, or post to{' '}
              {LEGAL_ENTITY}, {NOTICE_ADDRESS}. We aim to respond within{' '}
              {GRIEVANCE_RESPONSE_TARGET_DAYS} days.{' '}
              <strong>
                That target is our commitment, not a statutory deadline we are quoting.
              </strong>
            </p>
          </div>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            Subject-line routing is used because this is the one mailbox proven to receive mail; a
            dedicated grievance address is not provisioned, and we would rather publish a working
            inbox than a dedicated one that bounces. If our response does not resolve it, you may
            complain to the Data Protection Board of India.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">09 &middot; Children, stated honestly</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Under this Act a child is anyone under 18, and processing a child&rsquo;s data requires
            verifiable consent from a parent or guardian. AGI accounts are for people aged 18 and
            over, and the{' '}
            <Link href={CANONICAL_POLICY_ROUTES.terms} style={{ color: 'var(--agi-ink)' }}>
              terms
            </Link>{' '}
            permit 13- to 17-year-olds only under an account opened and supervised by a parent,
            guardian or school.{' '}
            <strong>
              We do not currently perform verifiable parental consent or age verification.
            </strong>{' '}
            That is a gap against this Act, we are naming it rather than implying otherwise, and it
            is tracked as an open item. We do not knowingly collect a child&rsquo;s personal data;
            if you believe we have, use the grievance contact above and we will delete it. We do not
            run behavioural advertising or tracking directed at children in any mode.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">10 &middot; Security and breach</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            We are required to protect your data with reasonable security safeguards, and to notify
            the Data Protection Board and every affected Data Principal if there is a breach. Our
            operational posture is at{' '}
            <Link href={CANONICAL_POLICY_ROUTES.security} style={{ color: 'var(--agi-ink)' }}>
              /security
            </Link>
            . The internal procedure for a breach &mdash; who declares it, what goes in the Board
            notification, and what you would receive &mdash; is written down and rehearsed against a
            72-hour clock. The email this product can send today is support-escalation and
            scheduled-task notification; there is no account-lifecycle mailing path, so a
            user-facing breach notice would be delivered in-product and at a public URL rather than
            by email. We would rather tell you that now than discover it during an incident.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">11 &middot; Language, and changes</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            This notice is published in English. The Act entitles you to it in any language in the
            Eighth Schedule to the Constitution; translations are not yet published, and that is an
            open item. The current version is always at this URL with the revision date at the top,
            and material changes are recorded on{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            . No mailing path for policy changes exists in the product, so we do not promise emailed
            notice of a change.
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href={CANONICAL_POLICY_ROUTES.dataRights} className="agi-cta-ghost">
              Exercise your rights &rarr;
            </Link>
            <Link href={CANONICAL_POLICY_ROUTES.privacy} className="agi-cta-ghost">
              Full privacy policy &rarr;
            </Link>
            <Link href={CANONICAL_POLICY_ROUTES.subprocessors} className="agi-cta-ghost">
              Subprocessors &rarr;
            </Link>
            <Link href={CANONICAL_POLICY_ROUTES.security} className="agi-cta-ghost">
              Security &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
