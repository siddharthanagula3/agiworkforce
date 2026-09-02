import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';
import { BYOK_SURFACES, DESKTOP_LOCAL_RUNTIMES } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Security: three boundaries, three different answers',
  description:
    'Where your data lives, what is encrypted, who can access it, what is logged, and what happens on deletion, per trust boundary, with the gaps named.',
  path: '/security',
});

const LAST_REVIEWED = POLICY_LAST_UPDATED.security;

const BOUNDARIES = [
  {
    meta: 'Local',
    title: 'Nothing we operate is in the path.',
    body: `Desktop Local mode runs the model on your own hardware through ${DESKTOP_LOCAL_RUNTIMES.label}. Chats, files, and sessions are written to a SQLite database on your disk. No AGI server, no subprocessor, and no network egress to us is involved in the request, so there is nothing on our side to breach, subpoena, or retain.`,
  },
  {
    meta: 'BYOK',
    title: 'Your key, your provider, direct.',
    body: `On ${BYOK_SURFACES.label}, requests made with your own provider key travel from the local runtime to that provider. The key stays in that runtime, never on our servers. We are not in the request path, so we hold neither the prompt nor the completion, but the provider you chose does, under their terms.`,
  },
  {
    meta: 'Managed Cloud',
    title: 'We host it, so we hold it. Public alpha.',
    body: 'Managed Cloud is the only mode where we store your content. It has been open to signed-in users by default since 27 June 2026 and is in public alpha, not general availability. Everything below about databases, access control, logging, and deletion describes this mode.',
  },
];

const DATA_ROWS: { label: string; value: string }[] = [
  {
    label: 'Chats and messages',
    value:
      'Local: SQLite file on your device. BYOK: device, plus your provider. Managed Cloud: Neon Postgres (United States).',
  },
  {
    label: 'Artifacts and generated files',
    value:
      'Local: your device. BYOK: your device. Managed Cloud: Neon Postgres; rendered on a separate sandbox origin.',
  },
  {
    label: 'Uploaded and generated media',
    value:
      'Local: your device. BYOK: your device. Managed Cloud: Cloudflare R2, catalogued in Neon and served by an authenticated owner-and-workspace-scoped app route; videos use a private bucket, while images and non-video files remain in a public bucket whose raw URLs are not returned by normal product responses.',
  },
  {
    label: 'Memories, projects, settings',
    value: 'Local: your device. BYOK: your device. Managed Cloud: Neon Postgres.',
  },
  {
    label: 'Provider API keys',
    value:
      'Local: not applicable. BYOK: encrypted on your device, in the OS credential store or under a device-derived key. Managed Cloud: not applicable, Managed Cloud uses our provider accounts, not yours.',
  },
  {
    label: 'Account identity and sessions',
    value:
      'Local: not held by us, no AGI identity is in the request path. BYOK: account required to sync; identity at Clerk. Managed Cloud: Clerk (United States).',
  },
  {
    label: 'Security and error logs',
    value:
      'Local: local audit log on your device. BYOK: local audit log on your device. Managed Cloud: Neon (security events) and Sentry (errors, PII off).',
  },
  {
    label: 'Code execution',
    value:
      'Local: your machine, behind the execution gate. BYOK: your machine, behind the execution gate. Managed Cloud: E2B, off unless an operator explicitly enables it.',
  },
];

const TRANSIT: { label: string; value: string }[] = [
  {
    label: 'HSTS',
    value:
      'Every response carries Strict-Transport-Security with max-age=63072000 (two years), includeSubDomains, and preload. After the first visit a browser will not speak plaintext HTTP to us or any subdomain.',
  },
  {
    label: 'Mixed content',
    value:
      'The Content-Security-Policy sets upgrade-insecure-requests and block-all-mixed-content, so a page cannot silently pull a subresource over HTTP.',
  },
  {
    label: 'Browser hardening',
    value:
      'X-Frame-Options DENY, X-Content-Type-Options nosniff, X-DNS-Prefetch-Control off, a Permissions-Policy that denies camera, geolocation, payment, USB, and XR outright, and Referrer-Policy origin-when-cross-origin.',
  },
  {
    label: 'Host confusion',
    value:
      'Browser traffic that lands on the API hostname is redirected (307) to the application host, so a signed-in session never renders on an origin it does not belong to.',
  },
];

const AT_REST: { label: string; value: string }[] = [
  {
    label: 'Desktop database',
    value:
      'SQLCipher is compiled into the desktop build unconditionally. It is not an option you switch on. The local database is encrypted at rest on every install.',
  },
  {
    label: 'Desktop database key',
    value:
      'A new install generates a 256-bit key from the operating system CSPRNG and stores it in the OS credential service, namespaced by the validated application bundle identifier so debug, test, and production builds can never share a key. A database created by an older build is adopted only after a read-only proof that its key opens it, and is never blindly rekeyed.',
  },
  {
    label: 'Desktop secrets',
    value:
      'Provider API keys and connector credentials are sealed with AES-256-GCM under a key derived by PBKDF2-HMAC-SHA256 at 600,000 iterations, derived separately per purpose so a key that protects settings cannot open the credential store.',
  },
  {
    label: 'Desktop master password',
    value:
      'The optional master password is verified with Argon2id at OWASP-recommended parameters, with a 12-character minimum and PHC-encoded storage so the parameters recorded at enrolment govern every later verification. We do not hold it and cannot recover it for you.',
  },
  {
    label: 'Hosted API keys',
    value:
      'API keys you create for the hosted API are hashed with Argon2id. Only the hash and a short non-secret prefix are stored, and the prefix is stripped from API responses. The raw key exists once, in the response that created it.',
  },
  {
    label: 'Hosted connector tokens',
    value:
      'Bearer tokens for custom MCP connectors are encrypted with AES-256-GCM under a dedicated key. If that key is missing or malformed the production process refuses to start rather than falling back to a per-process key that would silently lose your tokens on the next deploy.',
  },
  {
    label: 'Two-factor secrets',
    value:
      'TOTP secrets are stored encrypted and backup codes are stored hashed. Disabling two-factor authentication requires a valid current code.',
  },
];

const ACCESS = [
  {
    title: 'Sessions and protected routes',
    body: 'Authentication is handled by Clerk. Six route groups (chat, library, schedules, settings, billing, and admin) are checked at the edge before the page renders; a request without a session cookie is redirected to login carrying its intended destination, so a protected page never renders and then complains.',
  },
  {
    title: 'Administrative access',
    body: 'Admin routes require an explicit admin or owner role read from the Clerk identity, not from anything the browser sends. There is no client-side flag that grants it.',
  },
  {
    title: 'Cross-site request forgery',
    body: 'State-changing requests carry an HMAC-SHA256 token compared in constant time. The signing secret must be at least 32 bytes or the process refuses it. A previous secret can be honoured during a rotation window and then removed. If no secret is configured, a random one is generated so every token fails, the system fails closed, not open.',
  },
  {
    title: 'Rate limiting and abuse',
    body: 'Limits are enforced per endpoint through Upstash Redis, which is required at production runtime. The module throws on start if it is not configured. Security-sensitive endpoints are marked fail-closed and reject requests when the limiter is unreachable; a few business-critical paths such as checkout are deliberately fail-open, and are marked as such in the code.',
  },
];

const ISOLATION = [
  {
    title: 'Script injection',
    body: "Every response carries a Content-Security-Policy built per request with a fresh random nonce. script-src contains no 'unsafe-inline': an injected inline script has no nonce and does not execute. object-src is 'none', base-uri and form-action are 'self', and frame-ancestors is 'none' everywhere except one documented case, owner-scoped PDF preview, which is restricted to PDF responses on an authenticated file route.",
  },
  {
    title: 'Allowlist integrity',
    body: 'The third-party origins the policy admits are derived, not pasted. The authentication origin is decoded from the publishable key and rejected unless it is shaped like a hostname; the upload origin is admitted only if the account identifier is exactly 32 hex characters and the bucket name matches a valid bucket shape. A typo in an environment variable therefore cannot widen script-src or connect-src to an arbitrary host, it just drops the origin.',
  },
  {
    title: 'Model-generated artifacts',
    body: "Artifacts render on a separate origin with its own policy: default-src 'none', connect-src 'none', frame-src 'self', form-action 'none', base-uri 'none', object-src 'none', Referrer-Policy no-referrer, cross-origin isolation headers, and frame-ancestors pinned to our application hosts. Code in an artifact can paint, but it cannot make a fetch, XHR or WebSocket call (connect-src is 'none'), submit a form, or reach the parent page. It is not fully network-isolated: the policy still permits images and fonts over https and scripts from two pinned CDNs, so an artifact can issue outbound GETs for those resource types. Treat an artifact as sandboxed against interaction with your session, not as an airgap. Where that origin is not configured, artifacts fall back to a same-origin frame WITHOUT allow-same-origin, which is the flag combination that would defeat the sandbox. Scripts inside an HTML artifact do not run unless the artifact is explicitly marked as needing them.",
  },
  {
    title: 'Server-side request forgery',
    body: 'Outbound URLs are checked against private, loopback, link-local, and reserved ranges BEFORE the hostname allowlist is consulted, including IPv4-mapped IPv6 forms, so even an over-broad allowlist cannot be steered at cloud metadata at 169.254.169.254 or an internal address. Remote MCP server URLs must be HTTPS, must resolve to a public address, and must not embed credentials. The status page you can read at /status deliberately calls its health checks in-process rather than fetching itself, because building a request URL out of inbound headers is the same class of bug.',
  },
  {
    title: 'Hosted code execution',
    body: 'Managed code execution through E2B is off unless an operator sets an explicit execution flag. Holding an E2B API key does not by itself open the loop. That was a deliberate design decision, so a credential appearing in the environment cannot quietly enable remote execution.',
  },
  {
    title: 'Desktop command execution',
    body: 'The desktop shell gate classifies a command three ways, most restrictive wins. Commands classified as forbidden never run, even if you approve them. Commands classified as prompt route into the confirmation flow before execution. The classifier combines argv-prefix policy rules with a dangerous-pattern check that catches pipes and shell operators the prefix rules cannot express.',
  },
];

const DB_ROWS: { label: string; value: string }[] = [
  {
    label: 'What the policies do',
    value:
      'Row-level security policies on user-scoped tables carry both a read condition and an explicit write condition, so a cross-tenant read and a cross-tenant insert or update are both rejected by the database. The user identity comes from a session variable that returns NULL when unset, and NULL denies, an unset context sees nothing rather than everything.',
  },
  {
    label: 'How a request binds to them',
    value:
      'A request served by the user-scoped database client opens a transaction, switches to a role that cannot bypass row-level security, binds the caller identity for that transaction only, and then runs the query. The identity is taken from a token whose signature was verified upstream.',
  },
  {
    label: 'Workspace scope',
    value:
      'The workspace header a client sends is a selector, not a grant. Membership and role are resolved inside the database from the membership table, so a client that names a workspace it does not belong to collapses to personal scope. Malformed values are rejected before they reach the query.',
  },
  {
    label: 'Where this applies today',
    value:
      'The user-scoped client is used by chat and conversation sync, projects, memory, settings and organization sharing, code sessions, schedules, connector permissions, media generation, research reports, artifact publishing, and OpenAI-compatible endpoints. On those routes the database enforces isolation independently of the application. We do not publish a route count because it changes as routes are added or consolidated.',
  },
  {
    label: 'Where it does not, yet',
    value:
      'Other hosted routes connect as the database owner, which bypasses row-level security by design. Those routes must implement authentication, ownership, and workspace filters in their application queries; using the owner connection is not itself an isolation control. Widening database-enforced coverage is an open item below, with no promised date.',
  },
];

const LOGGING: { label: string; value: string }[] = [
  {
    label: 'What the hosted platform records',
    value:
      'A single module owns writes into the security event table. It records seven failure and abuse event types: failed authentication, rate-limit exceeded, failed authorization, suspicious activity, administrative action, failed CSRF validation, and invalid signature, plus a separate taxonomy for successful business events. Authentication, account-lifecycle, billing, connector, team and organisation, API-key, and session routes call that module.',
  },
  {
    label: 'What it does not record',
    value:
      'There is no hosted, user-visible journal of individual tool calls. Desktop keeps a local audit log of tool executions and permission requests; the hosted surface does not have an equivalent, and we are not going to describe one until it exists.',
  },
  {
    label: 'Error output',
    value:
      'Errors returned to a browser are generic per status class. Database messages, constraint names, and driver codes are logged server-side and never sent to the client, except for a short explicit allowlist of application-defined codes the interface needs in order to explain what to do next.',
  },
  {
    label: 'Secret leakage',
    value:
      'A detector scans values for secret-shaped strings (provider key prefixes, live payment keys, JSON web tokens, bearer headers, database connection strings) and throws before the value can be logged or returned.',
  },
  {
    label: 'Error monitoring',
    value:
      'Sentry runs with default PII collection disabled, plus scrubbing hooks on both events and breadcrumbs.',
  },
  {
    label: 'Who can read it',
    value:
      'Security event records are readable by the account they belong to, through user-scoped settings routes; org-wide admin views are not built yet. The table is append-only: update and delete are revoked from the application role. A database routine can delete records older than 90 days, but no scheduled route invokes it today, so automatic expiry is not promised.',
  },
];

const DELETION = [
  {
    title: 'The list is enumerated, not implied',
    body: 'Erasure walks a hardcoded, foreign-key-ordered list of 70 user-scoped tables covering conversations, artifacts, folders, tags, branches, bookmarks, reactions, shares, memories, settings, projects, shortcuts, search history, schedules, connectors, connector permissions, notifications, feedback, support tickets and their replies, API keys, two-factor enrolment, sessions, credits, redemptions, usage and billing records, mobile store transactions, video generation jobs, consent records, data-rights requests, beta applications, email preferences, device registrations, sync data, workspace membership, subscriptions, and finally the profile row. Child tables that cascade are deliberately left out of the list so there is one source of truth, not two.',
  },
  {
    title: 'Bytes before rows',
    body: 'Stored media objects are deleted from object storage first, and only then are their catalogue rows removed. If an object delete fails, its row is kept so a later run can retry, deleting the row first would destroy the only pointer to a live object and leave it orphaned forever.',
  },
  {
    title: 'It refuses to claim success it did not achieve',
    body: 'The erasure result carries a completeness flag that is true only when every table and every stored object was disposed of. A table that does not exist on a deployment is reported as skipped; a table that errored is reported with its error. Partial erasure does not report as done.',
  },
  {
    title: 'Data before identity',
    body: 'The scheduled purge erases account data BEFORE deleting the identity record. If erasure fails, you still have a recoverable account rather than orphaned rows with no owner to attach them to.',
  },
  {
    title: 'It actually runs',
    body: 'A cron-authenticated job runs daily at 04:30 UTC and processes up to 25 pending accounts per run. Separate scheduled jobs purge deleted media at 04:00 UTC, temporary chats at 03:00 UTC, and reclaim sandboxes at 05:45 UTC. This is the mechanism behind the 24-hour deletion window in the privacy policy.',
  },
  {
    title: 'Export first, if you want it',
    body: 'A self-service export endpoint returns your account data as a JSON file download before you delete anything.',
  },
  {
    title: 'Local mode',
    body: 'There is nothing for us to delete. Remove the application data directory and the encrypted database goes with it. We never had a copy.',
  },
];

const RELEASE: { label: string; value: string }[] = [
  {
    label: 'Dependency and code scanning',
    value:
      'What blocks a merge: dependency audits at critical and high severity, cargo-deny checks for banned crates, sources, licences and advisories, and a check that every third-party GitHub Action is pinned to a full commit SHA (first-party actions/* are exempt from that check). What runs without blocking: a Semgrep security-audit pass, whose remaining findings are package-manager supply-chain hardening we have triaged and not yet done. It will block once they reach zero. A weekly Monday job runs a Rust advisory audit and clippy. We do not run CodeQL; if you saw that claim here before 14 August 2026, it was wrong.',
  },
  {
    label: 'macOS builds',
    value:
      'The release workflow hard-fails unless Apple signing and notarization credentials are present, and publishes a notarized universal disk image. You can verify the signature and the stapled notarization ticket yourself with codesign, spctl, and stapler.',
  },
  {
    label: 'Windows builds',
    value:
      'The installer is signed through Azure Trusted Signing, and the workflow throws (before anything is published) if the signature does not verify as Valid.',
  },
];

const NOT_DONE: { label: string; value: string }[] = [
  {
    label: 'SOC 2',
    value:
      'No SOC 2 Type I or Type II report exists. No audit is underway and there is no auditor engaged. Nothing on this site should be read as implying otherwise.',
  },
  { label: 'ISO 27001', value: 'Not certified. No certification body engaged.' },
  {
    label: 'HIPAA',
    value:
      'AGI is not offered for protected health information. We do not sign business associate agreements.',
  },
  {
    label: 'Penetration test',
    value:
      'No third-party penetration test has been performed. The scanning described above is automated tooling in our own pipeline, which is not a substitute.',
  },
  {
    label: 'Bug bounty',
    value:
      'We do not run a paid bounty programme. Reports are still read and fixed (see below), but do not expect payment.',
  },
  {
    label: 'Database policy coverage',
    value:
      'Row-level security is bound on the user-scoped routes named above. Other privileged routes must enforce authenticated ownership and workspace scope in application queries; widening database-enforced coverage remains open work.',
  },
  {
    label: 'Inline styles',
    value:
      "The Content-Security-Policy still permits 'unsafe-inline' for styles because the component library depends on inline style attributes. Scripts do not have this exemption; styles do.",
  },
  {
    label: 'Production access controls',
    value:
      'Production database credentials exist and are held by the operator. There is no just-in-time access approval workflow, no periodic access review, and no separate break-glass procedure. For a company this size that is the honest state, and it is what a reviewer should assume.',
  },
  {
    label: 'Availability commitments',
    value:
      'No published recovery point or recovery time objective, and no backup-restore test evidence. The planned targets on /sla are targets, not commitments.',
  },
  {
    label: 'On-call',
    value: 'There is no 24/7 rotation. Incident response is best-effort during working hours.',
  },
  {
    label: 'Incident history',
    value:
      'We have not published an incident archive or postmortems. The notification commitment is on /status; the archive does not exist yet.',
  },
  {
    label: 'EU representative',
    value:
      'AGI Automation LLC has not yet designated a representative in the European Union under Article 27 GDPR. Status is tracked at /legal/eu-representative.',
  },
  {
    label: 'Health-check coverage',
    value:
      'The live check on /status covers Postgres reachability, the payments API, and required environment configuration. Authentication, object storage, the gateway, the rate limiter, and model routes are not covered by it.',
  },
  {
    label: 'India: DPDP Act, 2023',
    value:
      'Our position is published in full at /privacy/india, including the parts that are gaps rather than controls: no verifiable parental consent (the Act treats anyone under 18 as a child), no notice translations into Eighth Schedule languages, no Indian data residency, and a grievance contact published as a role rather than a named officer. The consent and rights machinery is implemented; those four are not.',
  },
  {
    label: 'Automated-abuse verification',
    value:
      'There is no first-party CAPTCHA or bot-verification check anywhere in our own code, and no server-side verification call for one. Sign-up bot protection is a feature of our identity provider, configured in its dashboard rather than in this repository, which means we cannot demonstrate its state from source, and a reviewer should not assume it. Unauthenticated endpoints that accept personal data are protected by CSRF validation and per-IP rate limiting, which are real controls but are not bot verification.',
  },
  {
    label: 'Log redaction',
    value:
      'Bearer tokens are redacted before logs are written. There is no field-level redaction configured on the structured logger itself, so an email address passed into a log call is written as given. Reducing what reaches logs, rather than filtering it afterwards, is open work.',
  },
  {
    label: 'Fail-closed coverage is not uniform',
    value:
      'Some controls fail closed by design and are described above: the analytics consent gate is one, and the web rate limiter refuses to start in production without its backing store. Others degrade rather than refuse when a dependency is unavailable, and a small number of operational switches can be set to admit traffic that would otherwise be blocked. Making the fail direction consistent, and making every security-relevant setting refuse a boot rather than warn, is tracked remediation work rather than something we have finished.',
  },
  {
    label: 'Legacy credential formats',
    value:
      'Some second-factor secrets stored before the current encryption scheme are still readable in their original format, and no migration job has rewritten them. New enrolments use the current scheme. Until that migration runs, the honest statement is that our encryption-at-rest posture is not uniform across every historical row.',
  },
];

export default function SecurityPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-security-title"
          eyebrow="Security"
          title="Three boundaries, three different answers."
          lede="Written for someone doing a security review, not for a buyer. Where the data sits, what encrypts it, who can reach it, what gets logged, and what happens when you delete: answered per mode, in specifics you can check. We hold no SOC 2 report, no ISO 27001 certificate, and no third-party penetration test. The gaps are listed on this page rather than left for you to find."
          ctas={[
            { href: '#report', label: 'Report a vulnerability' },
            { href: '#not-done', label: 'Read what we have not done', variant: 'secondary' },
          ]}
        />

        <Section id="review" labelledBy="agi-security-review-title" rule>
          <Stack gap="tight">
            <h2 className="agi-ds-h2" id="agi-security-review-title">
              Reviewed {LAST_REVIEWED}.
            </h2>
            <Prose size="sm">
              Managed Cloud is in public alpha. No certifications are claimed.
            </Prose>
          </Stack>
        </Section>

        <Section id="boundaries" labelledBy="agi-security-boundaries-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-security-boundaries-title">
                The mode decides the whole risk model.
              </h2>
              <Prose>
                Most of this page only applies to one of the three. In Local mode the honest answer
                to &ldquo;which of your subprocessors touches my data&rdquo; is none of them,
                because none of our infrastructure is in the path at all.
              </Prose>
            </div>
            <FactGrid items={BOUNDARIES} />
          </Stack>
        </Section>

        <Section id="data" labelledBy="agi-security-data-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-security-data-title">
                Where data lives, by category, by mode, by holder.
              </h2>
              <Prose>
                Named third parties and their regions are listed on{' '}
                <Link href="/subprocessors" className="agi-ds-link">
                  /subprocessors
                </Link>
                . Processing terms are on{' '}
                <Link href="/dpa" className="agi-ds-link">
                  /dpa
                </Link>
                .
              </Prose>
            </div>
            <Ledger caption="Where data lives" rows={DATA_ROWS} />
          </Stack>
        </Section>

        <Section id="transit" labelledBy="agi-security-transit-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-security-transit-title">
              Encryption in transit: what the browser is told, and enforced with.
            </h2>
            <Ledger caption="Encryption in transit" rows={TRANSIT} />
          </Stack>
        </Section>

        <Section id="rest" labelledBy="agi-security-rest-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-security-rest-title">
              Encryption at rest: named algorithms, named parameters.
            </h2>
            <Ledger caption="Encryption at rest" rows={AT_REST} />
          </Stack>
        </Section>

        <Section id="access" labelledBy="agi-security-access-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-security-access-title">
              Access control: who gets in, and what stops them.
            </h2>
            <NoteList items={ACCESS} />
          </Stack>
        </Section>

        <Section id="isolation" labelledBy="agi-security-isolation-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-security-isolation-title">
                Execution isolation: untrusted code and untrusted URLs.
              </h2>
              <Prose>
                A model writes code and picks URLs. Both are untrusted input, and both are treated
                as such.
              </Prose>
            </div>
            <NoteList items={ISOLATION} />
          </Stack>
        </Section>

        <Section id="db" labelledBy="agi-security-db-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-security-db-title">
                Tenant isolation: database isolation, including where it does not reach yet.
              </h2>
              <Prose>
                This is the section most vendors round up. We are not going to, because the number
                is checkable and rounding it up is exactly the failure a review is meant to catch.
              </Prose>
            </div>
            <Ledger caption="Database isolation" rows={DB_ROWS} />
          </Stack>
        </Section>

        <Section id="logging" labelledBy="agi-security-logging-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-security-logging-title">
              Logging: what is captured, and what is deliberately not.
            </h2>
            <Ledger caption="Logging" rows={LOGGING} />
          </Stack>
        </Section>

        <Section id="deletion" labelledBy="agi-security-deletion-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-security-deletion-title">
                Deletion: what actually happens when you delete an account.
              </h2>
              <Prose>
                Deletion is the claim vendors are least often asked to demonstrate and most often
                fail. Here is the mechanism, in the order it runs.
              </Prose>
            </div>
            <NoteList items={DELETION} />
          </Stack>
        </Section>

        <Section id="release" labelledBy="agi-security-release-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-security-release-title">
              Release integrity: what runs before anything ships.
            </h2>
            <Ledger caption="Release integrity" rows={RELEASE} />
          </Stack>
        </Section>

        <Section id="report" labelledBy="agi-security-report-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-security-report-title">
                Reporting a vulnerability.
              </h2>
              <Prose>
                Email{' '}
                <Link href={contactMailto(CONTACT_SUBJECTS.security)} className="agi-ds-link">
                  {CONTACT_EMAIL}
                </Link>{' '}
                with <strong>{CONTACT_SUBJECTS.security}</strong> in the subject line. This is the
                mailbox that is actually monitored; we would rather publish one address that works
                than a dedicated alias that bounces.
              </Prose>
            </div>
            <Ledger
              caption="Reporting a vulnerability"
              rows={[
                {
                  label: 'Include',
                  value:
                    'The affected surface (web, desktop, mobile, extension, CLI), the version or URL, steps to reproduce, and what an attacker gains. A proof of concept helps. Please do not send video only.',
                },
                {
                  label: 'In scope',
                  value:
                    'agiworkforce.com and its subdomains, the hosted API, the artifact sandbox origin, the desktop application and its updater, the CLI, and the browser and editor extensions.',
                },
                {
                  label: 'Out of scope',
                  value:
                    'Findings in third-party services we consume, report those to the vendor. Denial of service, volumetric or brute-force testing, social engineering of our staff or users, physical attacks, spam or rate-limit exhaustion, and reports produced by a scanner with no demonstrated impact.',
                },
                {
                  label: 'Safe harbour',
                  value:
                    'If you research in good faith, stay within the scope above, avoid privacy violations and service degradation, use only accounts you own or have permission to test, and give us a reasonable chance to fix the issue before disclosing it, we will not pursue or support legal action against you, and we will say so in writing if you ask.',
                },
                {
                  label: 'Response',
                  value:
                    'We do not publish a fixed acknowledgement or remediation time. This is not a 24/7 reporting channel; reports are reviewed on a best-effort basis during working hours.',
                },
                {
                  label: 'Reward',
                  value:
                    'There is no paid bounty programme. We will credit you by name in the changelog if you want the credit, and decline to name you if you do not.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="not-done" labelledBy="agi-security-gaps-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-security-gaps-title">
                What we have not done.
              </h2>
              <Prose>
                No dates are attached to any of these. A date we cannot keep is worse than an
                admission we can. As of {LAST_REVIEWED}:
              </Prose>
            </div>
            <Ledger caption="What we have not done" rows={NOT_DONE} />
          </Stack>
        </Section>

        <Section id="related" labelledBy="agi-security-more-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-security-more-title">
              The rest of the trust surface.
            </h2>
            <ButtonRow>
              <Button href="/trust">Dated posture ledger</Button>
              <Button href="/status" variant="secondary">
                Live status
              </Button>
              <Button href="/privacy" variant="secondary">
                Privacy policy
              </Button>
              <Button href="/subprocessors" variant="secondary">
                Subprocessors
              </Button>
              <Button href="/dpa" variant="secondary">
                Data processing addendum
              </Button>
              <Button href="/sla" variant="secondary">
                Service levels
              </Button>
            </ButtonRow>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
