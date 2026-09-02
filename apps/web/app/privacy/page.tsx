import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PolicyContents } from '@shared/components/legal/PolicyContents';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';
import {
  Container,
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { POSITIONING } from '../../lib/marketing-constants';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';
import {
  METERING_EVIDENCE_RETENTION_DAYS,
  STATUTORY_RECORD_RETENTION_DAYS,
} from '@/lib/billing/financial-record-retention';

const STATUTORY_RECORD_RETENTION_YEARS = Math.round(STATUTORY_RECORD_RETENTION_DAYS / 365.25);
const METERING_EVIDENCE_RETENTION_YEARS = Math.round(METERING_EVIDENCE_RETENTION_DAYS / 365.25);

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
 *  - "Material changes are announced via email". CORRECTED 2026-08-14: the
 *    original reason given here — "there is no transactional email provider in
 *    this repository" — was FALSE. lib/support/handoff/resend-client.ts calls
 *    the Resend HTTP API over plain `fetch`, so no dependency grep could find
 *    it, and /subprocessors delisted the provider on that same bad reasoning
 *    while support transcripts were being emailed through it. The claim still
 *    cannot be made, for the narrower true reason: no mailing path here can
 *    reach an arbitrary list of customers. Say that, never the old sentence —
 *    a guard in app/__tests__/legal-policy-set.test.ts enforces it.
 *
 * CLAIM ADDED: billing-record retention (BIZ-046). The retention schedule had a
 * row for the account and none for the money. Erasure deletes `subscriptions`,
 * `credit_transactions`, `token_credits` and `usage_events`
 * (lib/server/account-erasure.ts USER_SCOPED_TABLES; the immediate
 * `delete_user_data()` path in db/neon/0020_functions.sql deletes the first
 * three), while `organization_usage_ledger.user_id` is nulled and the row kept
 * (ANONYMIZED_USER_COLUMNS), and `credit_idempotency_keys` /
 * `credit_settlement_jobs` are kept by BOTH paths (UNDELETED_USER_TABLES). None
 * of that was disclosed. The row says so.
 *
 * CLAIM ADDED 2026-08-17: maximum age on billing rows (BILL-35). The earlier
 * version of this row said no job ages billing rows out, which was true then.
 * `lib/billing/financial-record-retention.ts` is now the schedule and
 * `/api/cron/enforce-billing-retention` runs it daily from vercel.json. Every
 * window quoted in the row below is either read from that module or matches one
 * of its rules; the two tables it deliberately leaves ageless
 * (FINANCIAL_TABLES_WITHOUT_MAXIMUM_AGE) are named in the row as ageless. If a
 * rule changes, change the row — a guard in
 * __tests__/billing-record-retention-disclosure.test.ts fails otherwise.
 *
 * CLAIM CORRECTED 2026-08-17: audit-log immutability (DOCS-17). The row on what
 * survives erasure said the application role "is blocked from writing to" both
 * audit trails. That is false for `security_audit_logs`: app_rls holds INSERT
 * and SELECT — writing the entry is its job — and only UPDATE and DELETE were
 * revoked (db/neon/0043_audit_log_immutability.sql, backstopped by the
 * non-owner trigger in 0123). It is true only of `enterprise_audit_events`,
 * where 0087 revokes INSERT too and writes go through
 * record_enterprise_audit_event(). The row now states the two grants
 * separately; __tests__/audit-log-immutability-disclosure.test.ts derives the
 * privileges from the migrations and fails if the prose drifts from them.
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

/**
 * Section list for the contents block. Must stay identical to the rendered
 * eyebrows — they are one piece of copy, not two, and drift makes the contents
 * describe a document that is not there.
 */
const SECTIONS = [
  '00 · The mode decides the answer',
  '01 · What we collect',
  '02 · What we do not collect',
  '03 · How we use it, and on what basis',
  '04 · Sharing',
  '05 · Retention',
  '06 · What you can change yourself',
  '07 · Your rights, and how to use them',
  '08 · International transfers',
  '09 · Children',
  '10 · Changes',
  '11 · Contact',
] as const;

const MODE_LEDGER: readonly LedgerRow[] = [
  {
    label: 'Local',
    value: (
      <>
        <strong>Where your prompts go:</strong> to a model runtime on your own machine. Nothing is
        transmitted to us and nothing is silently routed to BYOK or Managed Cloud.
        <br />
        <strong>What we hold:</strong> nothing about the conversation. Conversations live in SQLite
        on your disk.
      </>
    ),
  },
  {
    label: 'BYOK',
    value: (
      <>
        <strong>Where your prompts go:</strong> from your client straight to the provider you
        targeted, on your own API key. We are not in that request path.{' '}
        <strong>
          Available on the desktop app, the CLI and the VS Code extension. The web app is cloud-only
          and has no user-key path, so anything you do in a browser is Managed Cloud.
        </strong>
        <br />
        <strong>What we hold:</strong> your account and settings. Not the prompt traffic. Your key
        is encrypted on your device and the master password is not recoverable by us.
      </>
    ),
  },
  {
    label: 'Managed Cloud',
    value: (
      <>
        <strong>Where your prompts go:</strong> through our gateway to the provider serving the
        model you selected. Managed Cloud is in public alpha.
        <br />
        <strong>What we hold:</strong> conversations, files, projects, memories, schedules and
        settings, so they sync across your devices. This is the only mode where we act as your
        processor. See the{' '}
        <Link href="/dpa" className="agi-ds-link">
          DPA
        </Link>
        .
      </>
    ),
  },
];

const COLLECT_LEDGER: readonly LedgerRow[] = [
  {
    label: 'Account',
    value: (
      <>
        <strong>Examples:</strong> email, account ID, authentication metadata held by our identity
        provider.
        <br />
        <strong>Why, and how it is protected:</strong> authentication. We do not store your password
        ourselves.
      </>
    ),
  },
  {
    label: 'Billing',
    value: (
      <>
        <strong>Examples:</strong> Stripe customer ID, plan, invoice metadata. Card details go to
        Stripe directly and we never see or store them.
        <br />
        <strong>Why, and how it is protected:</strong> subscription management.
      </>
    ),
  },
  {
    label: 'Conversations (Managed Cloud)',
    value: (
      <>
        <strong>Examples:</strong> threads, messages, tool calls, and references to attached files.
        <br />
        <strong>Why, and how it is protected:</strong> cross-device sync. Two layers of access
        control: every route resolves the authenticated user and scopes the query to them, and
        Postgres row-level security policies are forced on the user-scoped tables behind the sync
        paths that bind the request identity per connection. It is defence in depth, not one
        absolute switch.
      </>
    ),
  },
  {
    label: 'Files you upload or generate',
    value: (
      <>
        <strong>Examples:</strong> attachments, generated images, and other stored media.
        <br />
        <strong>Why, and how it is protected:</strong> stored in Cloudflare R2 and catalogued in
        Neon. The product gives clients an authenticated same-origin file route that requires both
        the owning account and its active Personal or organisation workspace to match. Missing,
        deleted, foreign, and inactive-workspace files all return the same not-found response, and
        those responses are private and not stored by browser caches. Generated videos use a
        separate private bucket. Images and other non-video files remain in a public R2 bucket:
        normal product responses do not expose its raw URLs, but anyone who obtains an underlying
        storage URL can access that object without signing in.
      </>
    ),
  },
  {
    label: 'Conversations (Local)',
    value: (
      <>
        <strong>Examples:</strong> SQLite on disk. Not silently routed to BYOK or Managed Cloud.
        <br />
        <strong>Why, and how it is protected:</strong> we hold none of it.
      </>
    ),
  },
  {
    label: 'BYOK keys',
    value: (
      <>
        <strong>Examples:</strong> encrypted on device. Master password unrecoverable by us.
        <br />
        <strong>Why, and how it is protected:</strong> you stay in control of provider auth.
      </>
    ),
  },
  {
    label: 'Telemetry',
    value: (
      <>
        <strong>Examples:</strong> error and performance reports via Sentry, and page-view analytics
        via Google Analytics. Both are opt-in and load only after you consent; the consent gate
        fails closed, so a failure to read your choice means analytics stays off. No prompt content
        is sent to either.
        <br />
        <strong>Why, and how it is protected:</strong> operational visibility. Error reports are
        content-scrubbed and send no default personal data, but they <em>do</em> retain a stable
        user id so a crash can be tied to a session, so they are pseudonymous, not anonymous.
      </>
    ),
  },
  {
    label: 'Logs and security events',
    value: (
      <>
        <strong>Examples:</strong> server logs with bearer tokens redacted, plus an append-only
        security audit log of account-lifecycle and administrative events.
        <br />
        <strong>Why, and how it is protected:</strong> debugging, abuse prevention, and incident
        investigation.
      </>
    ),
  },
  {
    label: 'Things you send us on purpose',
    value: (
      <>
        <strong>Examples:</strong> feedback (your subject, message, and optionally a diagnostic log
        we scrub for secrets before storing), content reports (the category, your note, and a short
        excerpt of the message you are reporting), and support conversations.
        <br />
        <strong>Why, and how it is protected:</strong> answering you and fixing what you reported. A
        support escalation emails the transcript and the contact address you gave to our support
        inbox, which is one of the three things in this product that can send email at all.
      </>
    ),
  },
  {
    label: 'Records you create by using the product',
    value: (
      <>
        <strong>Examples:</strong> your search history, and the memories the assistant keeps about
        you when you enable them.
        <br />
        <strong>Why, and how it is protected:</strong> making search and the assistant useful across
        sessions. Both are yours to clear: search history has a clear action, and memory is off
        unless you turn it on.
      </>
    ),
  },
  {
    label: 'Profile details you choose to add',
    value: (
      <>
        <strong>Examples:</strong> display name, avatar, and optional fields such as a phone number,
        stored with your settings.
        <br />
        <strong>Why, and how it is protected:</strong> personalising the product. Optional means
        optional: nothing here is required to use an account.
      </>
    ),
  },
  {
    label: 'Early-access list',
    value: (
      <>
        <strong>Examples:</strong> your email address, if you ask us to tell you when enterprise
        features open.
        <br />
        <strong>Why, and how it is protected:</strong> only what you consented to, recorded per
        purpose before the address is stored. You can be asked about product updates separately and
        decline that without leaving the list.
      </>
    ),
  },
  {
    label: 'Devices and downloads',
    value: (
      <>
        <strong>Examples:</strong> push tokens for the mobile apps. For a desktop download: a hashed
        IP, the user-agent, the referring page and a coarse country in the download record, and
        separately, your <em>unhashed</em> IP address in our server logs.
        <br />
        <strong>Why, and how it is protected:</strong> delivering notifications you asked for, and
        understanding which builds are being downloaded.{' '}
        <strong>
          Two honest caveats. The hash in the download record uses a fixed salt, so it is
          pseudonymous rather than anonymous: anyone holding both the hash and a candidate address
          can confirm a match. And the download endpoint separately writes the raw IP to application
          logs for abuse detection, which the hashing does not cover.
        </strong>{' '}
        Both are improvements we owe you rather than controls we are claiming.
      </>
    ),
  },
  {
    label: 'Directory-provisioned identities (Enterprise)',
    value: (
      <>
        <strong>Examples:</strong> when your employer connects a directory, the name, email and
        directory identifier it sends us for each user it provisions.
        <br />
        <strong>Why, and how it is protected:</strong> creating and deactivating accounts on your
        organisation&rsquo;s instruction. Your employer decides what is sent; we act on it.
      </>
    ),
  },
];

const NOT_COLLECTED: readonly { title: string; body: React.ReactNode }[] = [
  {
    title: 'Training data',
    body: (
      <>
        AGI does not train AGI-owned models on customer prompts, responses, or files. In Managed
        Cloud, we send prompts and attached content to the provider serving the model you select and
        receive its response; for routed models, the request passes through OpenRouter. Those third
        parties handle that content under their applicable terms and data-use policies; this
        statement about AGI-owned models is not a promise on their behalf. In BYOK mode, provider
        handling is governed by your own provider account and terms.
      </>
    ),
  },
  {
    title: 'Provider traffic in BYOK mode',
    body: 'When you BYOK against Anthropic, OpenAI, Google or another provider, the request goes from your client to the provider. We do not see, log, or store that traffic.',
  },
  {
    title: 'Local-mode anything',
    body: 'Local mode uses on-device or local model routes and does not silently send chats, files, or developer sessions to BYOK providers or Managed Cloud.',
  },
  {
    title: 'Advertising and cross-context profiles',
    body: 'We run no advertising, set no advertising cookies, and do not sell or share personal data for cross-context behavioural advertising.',
  },
];

const BASIS_LEDGER: readonly LedgerRow[] = [
  {
    label: 'Creating and running your account',
    value: (
      <>
        <strong>Data used:</strong> email, account identifier, authentication metadata, settings.
        <br />
        <strong>Basis:</strong> <strong>performance of a contract.</strong> You asked us to run an
        account; it cannot exist without these.
      </>
    ),
  },
  {
    label: 'Running the assistant (Managed Cloud)',
    value: (
      <>
        <strong>Data used:</strong> conversations, files, projects, memories, schedules.
        <br />
        <strong>Basis:</strong> <strong>performance of a contract.</strong> This is the service
        itself. Local and BYOK do not produce this data for us at all.
      </>
    ),
  },
  {
    label: 'Taking payment',
    value: (
      <>
        <strong>Data used:</strong> billing identifiers, plan, invoice metadata. Card numbers go to
        Stripe and never reach us.
        <br />
        <strong>Basis:</strong> <strong>performance of a contract</strong>, and{' '}
        <strong>legal obligation</strong> for the records tax and accounting law requires us to
        keep.
      </>
    ),
  },
  {
    label: 'Answering you',
    value: (
      <>
        <strong>Data used:</strong> support conversations, feedback, content reports.
        <br />
        <strong>Basis:</strong> <strong>performance of a contract</strong> when you are a customer;{' '}
        <strong>legitimate interests</strong> otherwise. You initiated the contact, and we cannot
        reply without keeping what you sent.
      </>
    ),
  },
  {
    label: 'Keeping the service secure and available',
    value: (
      <>
        <strong>Data used:</strong> server logs, the security audit log, rate-limiting state,
        account status.
        <br />
        <strong>Basis:</strong> <strong>legitimate interests.</strong> Every user has an interest in
        the service not being taken over or abused, the data is operational rather than content, and
        you cannot opt out of it without also opting out of being protected by it.
      </>
    ),
  },
  {
    label: 'Understanding which builds are downloaded',
    value: (
      <>
        <strong>Data used:</strong> download records: hashed IP, user-agent, referrer, coarse
        country, plus the raw IP in server logs, as section 01 says.
        <br />
        <strong>Basis:</strong> <strong>legitimate interests.</strong> Narrow, and the honest
        caveats about the fixed salt and the raw log entry are in section 01 rather than buried
        here.
      </>
    ),
  },
  {
    label: 'Crash and error reporting',
    value: (
      <>
        <strong>Data used:</strong> error reports with a stable user id, content-scrubbed.
        <br />
        <strong>Basis:</strong> <strong>your consent.</strong> Off unless you turn it on in
        settings. No prompt content is sent.
      </>
    ),
  },
  {
    label: 'Product analytics',
    value: (
      <>
        <strong>Data used:</strong> aggregated page views.
        <br />
        <strong>Basis:</strong> <strong>your consent.</strong> Nothing loads until you give it, and
        the gate fails closed: if your choice cannot be read, analytics stays off.
      </>
    ),
  },
  {
    label: 'Telling you when something opens',
    value: (
      <>
        <strong>Data used:</strong> the email you gave the early-access list.
        <br />
        <strong>Basis:</strong> <strong>your consent</strong>, recorded per purpose against the
        revision of this notice you were shown, before the address is stored.
      </>
    ),
  },
  {
    label: 'Complying with the law',
    value: (
      <>
        <strong>Data used:</strong> whatever a valid legal process compels, narrowed to the minimum.
        <br />
        <strong>Basis:</strong> <strong>legal obligation.</strong>
      </>
    ),
  },
];

const RETENTION_LEDGER: readonly LedgerRow[] = [
  {
    label: 'Account and its content',
    value: (
      <>
        <strong>Retention:</strong> kept while your account is active. Permanently erased 24 hours
        after a deletion request.
        <br />
        <strong>Enforced by:</strong> the request records a deletion timestamp and schedules erasure
        24 hours out; a daily scheduled job then erases your user-scoped records and stored objects
        and deletes your identity at our authentication provider.
      </>
    ),
  },
  {
    label: 'Billing records',
    value: (
      <>
        <strong>Retention:</strong> erased with the account, or aged out at the end of the statutory
        record-keeping period ({STATUTORY_RECORD_RETENTION_YEARS} years), whichever comes first for
        that row.
        <br />
        <strong>Enforced by:</strong> your subscription, credit ledger and usage rows are erased
        with everything else. Three things survive on purpose, and you should know about them: an
        organisation&rsquo;s billing history keeps the ledger row with your user id removed, because
        the record belongs to that organisation rather than to you; double-charge protection keys
        and any payment still moving when you delete are kept, because deleting those can charge you
        twice or lose money we owe you; and Stripe holds its own record of your payments and
        invoices under its retention, not ours: card numbers go to Stripe directly and never reach
        us. A daily scheduled job now enforces a maximum age on the rows that outlive an account.
        Books of account (the credit ledger and the organisation usage ledger) are kept{' '}
        {STATUTORY_RECORD_RETENTION_YEARS} years and then deleted, and the request-shaped metadata
        beside them is emptied after {METERING_EVIDENCE_RETENTION_YEARS} years because the amount,
        the type and the date are the record, not the routing detail. Metering events are deleted
        after {METERING_EVIDENCE_RETENTION_YEARS} years and their metadata emptied after 180 days.
        Double-charge protection keys are deleted once their 24-hour window closes, completed
        settlement jobs 90 days after they finish, and payment-webhook receipts 180 days after
        processing, with any error text they captured cleared after 30 days. Two things carry no
        maximum age and we will not pretend otherwise: your current plan row and your current credit
        balance, because ageing those out would cancel a live subscription or delete credits you
        paid for. They go when the account goes.
      </>
    ),
  },
  {
    label: 'Conversations (Managed Cloud)',
    value: (
      <>
        <strong>Retention:</strong> kept until you delete them or delete your account.
        <br />
        <strong>Enforced by:</strong> there is no automatic expiry on ordinary conversations, and no
        per-organisation retention window is enforced on them today. We will not describe one until
        it runs.
      </>
    ),
  },
  {
    label: 'Temporary chats (Managed Cloud)',
    value: (
      <>
        <strong>Retention:</strong> about 30 days.
        <br />
        <strong>Enforced by:</strong> a daily scheduled job hard-deletes temporary conversations
        past the window; messages go with them.
      </>
    ),
  },
  {
    label: 'Deleted files',
    value: (
      <>
        <strong>Retention:</strong> 30 days in the recently-deleted bin, then the bytes are removed.
        <br />
        <strong>Enforced by:</strong> a daily scheduled job hard-deletes the records and deletes the
        underlying objects from storage. If an object deletion fails, the record survives and the
        next run retries it.
      </>
    ),
  },
  {
    label: 'Sandboxes',
    value: (
      <>
        <strong>Retention:</strong> within 24 hours of creation, or sooner once its resume mapping
        is gone.
        <br />
        <strong>Enforced by:</strong> a daily scheduled job enforces a 24-hour age cap on every
        sandbox (matching the resume mapping&rsquo;s own 24-hour expiry) and reclaims it at that cap
        or as soon as the mapping no longer points to it, whichever comes first.
      </>
    ),
  },
  {
    label: 'Security audit log',
    value: (
      <>
        <strong>Retention:</strong> 90 days.
        <br />
        <strong>Enforced by:</strong> a database routine deletes entries older than 90 days, run by
        a <strong>scheduled job every night</strong>:{' '}
        <code>/api/cron/purge-security-audit-logs</code> at 02:30 UTC, registered in{' '}
        <code>vercel.json</code>. This entry previously said the routine was run by an administrator
        rather than on a schedule; that stopped being true when the cron was added, and the policy
        is corrected here rather than left understating what happens.
      </>
    ),
  },
  {
    label: 'Server logs and backups',
    value: (
      <>
        <strong>Retention:</strong> vendor-governed.
        <br />
        <strong>Enforced by:</strong> platform logs and database or object-storage snapshots are
        retained according to our hosting vendors&rsquo; own configuration. We do not operate a
        separate process that reaches into vendor snapshots to remove individual records, and we
        will not claim a number we do not set.
      </>
    ),
  },
];

const SURVIVORS_LEDGER: readonly LedgerRow[] = [
  {
    label: 'Security and organisation audit log entries naming you',
    value:
      'Both audit trails are append-only integrity controls, enforced by database privilege rather than by our code. On the security trail the application role can add an entry but cannot update or delete one; on the organisation trail it cannot insert either, and writes go through a privileged routine instead. That is the point of an audit trail. Erasure does not purge them. We are recording that as a gap rather than describing the erasure as total: a separate privileged routine exists to purge them, and it is not part of the automatic path.',
  },
  {
    label: 'A record that you were erased',
    value:
      'A suppression entry survives so the system can tell that this subject must stay erased. Deleting it would erase the evidence that the erasure happened.',
  },
  {
    label: 'Double-charge protection keys and payments still moving',
    value:
      'Deleting these can charge you twice or lose a settlement owed to you. They outlive the account they protected.',
  },
  {
    label: 'Rows that belong to an organisation rather than to you',
    value:
      "An organisation's billing ledger keeps the row with your user id removed; files you added to a shared project keep the file and drop the attribution; abuse reports you filed about someone else keep the report and drop you. Deleting an organisation because its creator left would erase every other member.",
  },
  {
    label: "Stripe's own records",
    value:
      'Your payments and invoices sit with Stripe under its retention, not ours. Card numbers go to Stripe directly and never reach us.',
  },
  {
    label: 'Anything given without an account, keyed to an address',
    value: (
      <>
        <strong>
          An early-access email, a consent decision or a rights request made without signing in is
          not reachable by account deletion
        </strong>
        , because there is no account to delete. Nothing ages those out automatically either. Use
        the request form at{' '}
        <Link href="/privacy/requests" className="agi-ds-link">
          /privacy/requests
        </Link>{' '}
        and we will remove them.
      </>
    ),
  },
];

const CONTROLS_LEDGER: readonly LedgerRow[] = [
  {
    label: 'Export your data',
    value:
      'Account settings. Returns your account data as a download. It is rate limited, and every export is written to the security audit log. It does not yet cover every category this page lists. Where something is missing, use the access request in the next section.',
  },
  {
    label: 'Delete your account',
    value:
      'Account settings. Erasure is scheduled 24 hours out, then performed by a daily job that also deletes your identity at our authentication provider. Read the survivors table in section 05 first. Cancellation is self-serve: sign back in and cancel from Settings > Account any time before the 24 hours are up.',
  },
  {
    label: 'Withdraw a consent',
    value: (
      <>
        <Link href="/privacy/requests" className="agi-ds-link">
          /privacy/requests
        </Link>
        . Per purpose, one click, immediate. Withdrawing an optional purpose never costs you access
        to anything you did not withdraw.
      </>
    ),
  },
  {
    label: 'Turn analytics off',
    value: (
      <>
        The cookie preferences dialog, reachable from{' '}
        <Link href="/cookies" className="agi-ds-link">
          /cookies
        </Link>
        . It is already off until you turn it on; this is how you change your mind.
      </>
    ),
  },
  {
    label: 'Turn crash reporting off',
    value:
      'Settings. A separate switch from analytics, in a different place, because they are different vendors doing different things. We would rather say that than imply one toggle covers both.',
  },
  {
    label: 'Clear your search history',
    value: 'Settings. Removes the stored history for your account.',
  },
  {
    label: 'Memory',
    value:
      'Off unless you enable it. When on, the assistant keeps facts about you across sessions, and you can remove them.',
  },
  {
    label: 'Temporary chat',
    value:
      'The composer. A temporary conversation is hard-deleted by a daily job about 30 days later, messages with it.',
  },
  {
    label: 'Delete a conversation or a file',
    value:
      'In the product. Deleted files sit in a recently-deleted bin for 30 days, then the bytes are removed from storage.',
  },
  {
    label: 'Choose where a request goes',
    value:
      'The mode selector. Local keeps the conversation on your machine and sends us nothing; BYOK goes from your client straight to your provider on your key. Both are desktop, CLI and VS Code capabilities: the web app is cloud-only.',
  },
];

export default function PrivacyPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-privacy-title"
          eyebrow="Legal"
          title="Privacy policy."
          lede={
            <>
              What we collect, what we do not, and how that changes depending on which mode you run.{' '}
              <strong>
                AGI does not use customer conversation content to train AGI-owned models. We do not
                sell your data. {POSITIONING.trustBoundary}
              </strong>{' '}
              Last updated: {POLICY_LAST_UPDATED.privacy}. Managed Cloud is in public alpha.
            </>
          }
          ctas={[]}
        />

        <Container className="my-10">
          <PolicyContents
            sections={SECTIONS}
            intro="Start with section 00: which mode you run changes almost every answer below it."
          />
        </Container>

        <Section id="s-00" labelledBy="agi-privacy-s00-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-privacy-s00-title">
                00 · The mode decides the answer
              </h2>
              <Prose>
                Most privacy policies have one answer. This product has three, because Local, BYOK
                and Managed Cloud are separate trust boundaries and your data goes to genuinely
                different places in each. Read this table first; the rest of the page is detail.
              </Prose>
            </div>
            <Ledger caption="Mode and where your data goes" rows={MODE_LEDGER} />
          </Stack>
        </Section>

        <Section id="s-01" labelledBy="agi-privacy-s01-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s01-title">
              01 · What we collect
            </h2>
            <Ledger caption="What we collect" rows={COLLECT_LEDGER} />
            <Prose size="sm">
              <strong>Why this table grew on {POLICY_LAST_UPDATED.privacy}.</strong> A review
              compared it against every write path in the product and found the six categories above
              missing: the things you send us on purpose (feedback with its diagnostic logs, content
              reports and support transcripts), search history and memories, profile fields, the
              early-access list, device tokens and download records, and directory-provisioned
              identities. All of it was already being collected; this page had not kept up. If you
              add a collection point and do not add a row here, that is the defect this paragraph
              exists to prevent.
            </Prose>
            <Prose size="sm">
              <strong>Hosted AI providers we may route requests to (Managed Cloud):</strong>{' '}
              Anthropic, OpenAI, Google, xAI, DeepSeek, Perplexity and Moonshot directly; MiniMax,
              Qwen and Zhipu through OpenRouter, which therefore also handles those requests. Which
              one depends on the model you select.{' '}
              <strong>
                OpenRouter is additionally the failover for every other chat model in the catalogue
              </strong>
              , so if a direct route fails, prompt content for a model from any provider can pass
              through it. We would rather say that than let the three named families imply a
              narrower answer. The full current list with regions is at{' '}
              <Link href="/subprocessors" className="agi-ds-link">
                /subprocessors
              </Link>
              . BYOK routes from your client directly to the provider; Local contacts none of them.
            </Prose>
            <div className="agi-ds-card p-6">
              <Stack gap="tight">
                <h3 className="agi-ds-h3">
                  If you never opened an account and your data is in here anyway
                </h3>
                <Prose size="sm">
                  The rest of this notice is written to the person holding the account. This part is
                  written to everyone else. Text typed or pasted into a chat, files uploaded to it,
                  and whatever a connector fetches when an account holder points the agent at a
                  mailbox, calendar, drive or CRM routinely carries personal data about people who
                  never signed up: a colleague on the thread, a guest on the invite, a name in the
                  spreadsheet. So do the identities an employer&rsquo;s directory provisions for
                  people who may never sign in. We do not ask those people for anything and we do
                  not contact them; nothing in the product does.
                </Prose>
                <Prose size="sm">
                  <strong>What happens to it.</strong> It is kept as part of the record it arrived
                  in and gets that record&rsquo;s treatment: the storage described in the table
                  above and the clock in section 05, nothing separate. In Local it never reaches us.
                  In BYOK it goes from the account holder&rsquo;s client to their provider, not to
                  us.
                </Prose>
                <Prose size="sm">
                  <strong>On what basis.</strong> In Managed Cloud we hold it as the account
                  holder&rsquo;s processor and act on their instruction under the{' '}
                  <Link href="/dpa" className="agi-ds-link">
                    DPA
                  </Link>
                  ; they are the controller, and bringing your data in was their decision, not ours.
                  Our own processing rests on our contract with them rather than on any consent from
                  you, and the{' '}
                  <Link href="/terms" className="agi-ds-link">
                    terms
                  </Link>{' '}
                  make them confirm they were entitled to give it to us, including having given any
                  notice or obtained any consent your law required first. That duty is theirs and we
                  cannot discharge it for them.
                </Prose>
                <Prose size="sm">
                  <strong>What you can do about it.</strong> File an access, correction, erasure or
                  grievance request at{' '}
                  <Link href="/privacy/requests" className="agi-ds-link">
                    /privacy/requests
                  </Link>{' '}
                  without signing in: the form asks for a contact address, not an account. Two
                  limits, said here rather than discovered later: we can only act on a record we can
                  locate, so the request needs enough detail to find it; and where the data sits
                  inside a customer&rsquo;s account we hold it on that customer&rsquo;s instruction,
                  so we will usually have to route your request to them rather than act on it
                  ourselves.
                </Prose>
              </Stack>
            </div>
          </Stack>
        </Section>

        <Section id="s-02" labelledBy="agi-privacy-s02-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s02-title">
              02 · What we do not collect
            </h2>
            <NoteList items={NOT_COLLECTED} />
          </Stack>
        </Section>

        <Section id="s-03" labelledBy="agi-privacy-s03-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s03-title">
              03 · How we use it, and on what basis
            </h2>
            <Prose>
              One row per purpose, rather than a sentence listing four bases and leaving you to work
              out which applies to what. Where a row says <em>legitimate interests</em>, it also
              says why we think ours do not override yours. That balancing test is the part a bare
              list omits.
            </Prose>
            <Ledger caption="How we use it, and on what basis" rows={BASIS_LEDGER} />
            <Prose size="sm">
              <strong>India works differently and has its own page.</strong> Under the Digital
              Personal Data Protection Act, 2023 consent is the default ground rather than one of
              several, so the analysis is not the same as the table above. It is at{' '}
              <Link href="/privacy/india" className="agi-ds-link">
                /privacy/india
              </Link>
              , and it governs for data principals in India where the two differ.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-04" labelledBy="agi-privacy-s04-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s04-title">
              04 · Sharing
            </h2>
            <Prose>
              We share data only with the subprocessors listed at{' '}
              <Link href="/subprocessors" className="agi-ds-link">
                /subprocessors
              </Link>
              , and only as necessary to run the service. We do not sell data. We may disclose data
              if compelled by valid legal process; we narrow such disclosures to the minimum
              required. If AGI is involved in a merger or sale of assets, personal data may transfer
              as part of it, and this policy continues to apply until the acquirer publishes its
              own.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-05" labelledBy="agi-privacy-s05-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s05-title">
              05 · Retention
            </h2>
            <Prose>
              Every row below is a job or a mechanism that exists in the product, with the ones we
              do not control named as such. We would rather publish a shorter schedule that is true
              than a complete-looking one that is not.
            </Prose>
            <Ledger caption="Retention schedule" rows={RETENTION_LEDGER} />
            <div className="agi-ds-card p-6">
              <Stack gap="tight">
                <h3 className="agi-ds-h3">What deliberately survives deleting your account</h3>
                <Prose size="sm">
                  &ldquo;Delete my account&rdquo; erases an enumerated list of 70 user-scoped tables
                  and your stored files. A short list of things is kept on purpose, and you should
                  know what before you decide, not after.
                </Prose>
              </Stack>
            </div>
            <Ledger caption="What survives deletion, and why" rows={SURVIVORS_LEDGER} />
          </Stack>
        </Section>

        <Section id="s-06" labelledBy="agi-privacy-s06-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s06-title">
              06 · What you can change yourself
            </h2>
            <Prose>
              Controls that exist in the product right now, separated from the statutory rights in
              the next section on purpose. A right you have to write in and ask for is not the same
              thing as a switch you can reach, and a policy that mixes them makes the product sound
              more self-serve than it is.
            </Prose>
            <Ledger caption="Controls you can use today" rows={CONTROLS_LEDGER} />
          </Stack>
        </Section>

        <Section id="s-07" labelledBy="agi-privacy-s07-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s07-title">
              07 · Your rights, and how to use them
            </h2>
            <Prose>
              Depending on where you live and subject to applicable exceptions, privacy laws such as
              the GDPR, UK GDPR, and CCPA may give you rights of access, correction, deletion,
              portability, objection or restriction, and non-discrimination. Two requests are
              self-serve in the product:
            </Prose>
            <Ledger
              caption="Rights and how to use them"
              rows={[
                {
                  label: 'Export',
                  value:
                    'Signed in, you can export your data from the account export endpoint at any time. It is rate limited and each export is recorded in the security audit log.',
                },
                {
                  label: 'Deletion',
                  value:
                    'Request account deletion from the product. Erasure is scheduled 24 hours later and then performed. You get no confirmation email, because the only email this product sends is support escalation, scheduled-task notifications and operational alerts to us: there is no account-lifecycle mail. Cancellation is self-serve: sign back in and cancel from Settings > Account any time before the 24 hours are up, and the request is discarded without touching your data. Once that window has closed the product refuses to cancel, so the request cannot be revived after erasure begins.',
                },
                {
                  label: 'Everything else',
                  value: (
                    <>
                      Email{' '}
                      <a href={contactMailto(CONTACT_SUBJECTS.privacy)} className="agi-ds-link">
                        {CONTACT_EMAIL}
                      </a>{' '}
                      from your account address with the subject line &ldquo;
                      {CONTACT_SUBJECTS.privacy}&rdquo;. Applicable law determines the response
                      period. You may use an authorised agent where the law allows.
                    </>
                  ),
                },
              ]}
            />
            <Prose size="sm">
              EU, UK and Swiss residents may also lodge a complaint with their supervisory
              authority. California residents: we do not sell or share personal information, so
              there is no opt-out to exercise, and the CCPA service-provider terms we operate under
              are in section 06 of the{' '}
              <Link href="/dpa" className="agi-ds-link">
                DPA
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="s-08" labelledBy="agi-privacy-s08-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s08-title">
              08 · International transfers
            </h2>
            <Prose>
              AGI data is hosted in the United States.{' '}
              <strong>We do not offer EU or UK data residency</strong>, so European customers&rsquo;
              data is transferred to and processed in the US. For EU, UK and Swiss personal data we
              rely on the Standard Contractual Clauses with the UK Addendum and the Swiss
              adaptations, set out in section 06 of the{' '}
              <Link href="/dpa#s-06" className="agi-ds-link">
                DPA
              </Link>
              . AGI has not appointed a representative under GDPR Art. 27; the current position is
              at{' '}
              <Link href="/legal/eu-representative" className="agi-ds-link">
                /legal/eu-representative
              </Link>
              .
            </Prose>
          </Stack>
        </Section>

        <Section id="s-09" labelledBy="agi-privacy-s09-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s09-title">
              09 · Children
            </h2>
            <Prose>
              AGI accounts are for people aged 18 and over; 13- to 17-year-olds may use it only
              under an account opened and supervised by a parent, guardian or school, as set out in
              section 02 of the{' '}
              <Link href="/terms" className="agi-ds-link">
                terms
              </Link>
              . We do not knowingly collect personal data from children under 13, or under the
              higher digital-consent age where one applies. If you believe a child has provided us
              data, email us and we will delete it.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-10" labelledBy="agi-privacy-s10-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s10-title">
              10 · Changes
            </h2>
            <Prose>
              We may update this policy. The current version is always at this URL with the revision
              date at the top, and material changes are recorded on{' '}
              <Link href="/changelog" className="agi-ds-link">
                /changelog
              </Link>
              . No mailing path in this product can reach an arbitrary list of customers, so we do
              not promise emailed notice of a change.
            </Prose>
          </Stack>
        </Section>

        <Section id="s-11" labelledBy="agi-privacy-s11-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-privacy-s11-title">
              11 · Contact
            </h2>
            <Prose>
              {LEGAL_ENTITY}, {NOTICE_ADDRESS}. Email{' '}
              <a href={contactMailto(CONTACT_SUBJECTS.privacy)} className="agi-ds-link">
                {CONTACT_EMAIL}
              </a>
              .
            </Prose>
            <nav aria-label="Related legal pages" className="agi-ds-btn-row">
              <Link href="/terms" className="agi-ds-link">
                Terms
              </Link>
              <Link href="/dpa" className="agi-ds-link">
                DPA
              </Link>
              <Link href="/cookies" className="agi-ds-link">
                Cookies
              </Link>
              <Link href="/subprocessors" className="agi-ds-link">
                Subprocessors
              </Link>
            </nav>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
