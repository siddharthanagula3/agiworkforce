import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';
import { BYOK_SURFACES, DESKTOP_LOCAL_RUNTIMES } from '@/lib/marketing-constants';

export const metadata = buildMetadata({
  title: 'Security',
  description:
    'Where your data lives, what is encrypted, who can access it, what is logged, and what happens on deletion — per trust boundary, with the gaps named.',
  path: '/security',
});

const LAST_REVIEWED = POLICY_LAST_UPDATED.security;

const BOUNDARIES: {
  mark: string;
  mode: string;
  title: string;
  body: string;
}[] = [
  {
    mark: '◆',
    mode: 'Local',
    title: 'Nothing we operate is in the path.',
    body: `Desktop Local mode runs the model on your own hardware through ${DESKTOP_LOCAL_RUNTIMES.label}. Chats, files, and sessions are written to a SQLite database on your disk. No AGI server, no subprocessor, and no network egress to us is involved in the request, so there is nothing on our side to breach, subpoena, or retain.`,
  },
  {
    mark: '◇',
    mode: 'BYOK',
    title: 'Your key, your provider, direct.',
    body: `On ${BYOK_SURFACES.label}, requests made with your own provider key travel from the local runtime to that provider. The key stays in that runtime, never on our servers. We are not in the request path, so we hold neither the prompt nor the completion — but the provider you chose does, under their terms.`,
  },
  {
    mark: '●',
    mode: 'Managed Cloud',
    title: 'We host it, so we hold it. Public alpha.',
    body: 'Managed Cloud is the only mode where we store your content. It has been open to signed-in users by default since 27 June 2026 and is in public alpha, not general availability. Everything below about databases, access control, logging, and deletion describes this mode.',
  },
];

const DATA_ROWS: { category: string; local: string; byok: string; cloud: string }[] = [
  {
    category: 'Chats and messages',
    local: 'SQLite file on your device',
    byok: 'Device, plus your provider',
    cloud: 'Neon Postgres (United States)',
  },
  {
    category: 'Artifacts and generated files',
    local: 'Your device',
    byok: 'Your device',
    cloud: 'Neon Postgres; rendered on a separate sandbox origin',
  },
  {
    category: 'Uploaded and generated media',
    local: 'Your device',
    byok: 'Your device',
    cloud:
      'Cloudflare R2, catalogued in Neon and served by an authenticated owner-and-workspace-scoped app route; videos use a private bucket, while images and non-video files remain in a public bucket whose raw URLs are not returned by normal product responses',
  },
  {
    category: 'Memories, projects, settings',
    local: 'Your device',
    byok: 'Your device',
    cloud: 'Neon Postgres',
  },
  {
    category: 'Provider API keys',
    local: 'Not applicable',
    byok: 'Encrypted on your device, in the OS credential store or under a device-derived key',
    cloud: 'Not applicable — Managed Cloud uses our provider accounts, not yours',
  },
  {
    category: 'Account identity and sessions',
    local: 'Not held by us — no AGI identity is in the request path',
    byok: 'Account required to sync; identity at Clerk',
    cloud: 'Clerk (United States)',
  },
  {
    category: 'Security and error logs',
    local: 'Local audit log on your device',
    byok: 'Local audit log on your device',
    cloud: 'Neon (security events) and Sentry (errors, PII off)',
  },
  {
    category: 'Code execution',
    local: 'Your machine, behind the execution gate',
    byok: 'Your machine, behind the execution gate',
    cloud: 'E2B — off unless an operator explicitly enables it',
  },
];

const TRANSIT: { k: string; v: string }[] = [
  {
    k: 'HSTS',
    v: 'Every response carries Strict-Transport-Security with max-age=63072000 (two years), includeSubDomains, and preload. After the first visit a browser will not speak plaintext HTTP to us or any subdomain.',
  },
  {
    k: 'Mixed content',
    v: 'The Content-Security-Policy sets upgrade-insecure-requests and block-all-mixed-content, so a page cannot silently pull a subresource over HTTP.',
  },
  {
    k: 'Browser hardening',
    v: 'X-Frame-Options DENY, X-Content-Type-Options nosniff, X-DNS-Prefetch-Control off, a Permissions-Policy that denies camera, geolocation, payment, USB, and XR outright, and Referrer-Policy origin-when-cross-origin.',
  },
  {
    k: 'Host confusion',
    v: 'Browser traffic that lands on the API hostname is redirected (307) to the application host, so a signed-in session never renders on an origin it does not belong to.',
  },
];

const AT_REST: { k: string; v: string }[] = [
  {
    k: 'Desktop database',
    v: 'SQLCipher is compiled into the desktop build unconditionally — it is not an option you switch on. The local database is encrypted at rest on every install.',
  },
  {
    k: 'Desktop database key',
    v: 'A new install generates a 256-bit key from the operating system CSPRNG and stores it in the OS credential service, namespaced by the validated application bundle identifier so debug, test, and production builds can never share a key. A database created by an older build is adopted only after a read-only proof that its key opens it, and is never blindly rekeyed.',
  },
  {
    k: 'Desktop secrets',
    v: 'Provider API keys and connector credentials are sealed with AES-256-GCM under a key derived by PBKDF2-HMAC-SHA256 at 600,000 iterations, derived separately per purpose so a key that protects settings cannot open the credential store.',
  },
  {
    k: 'Desktop master password',
    v: 'The optional master password is verified with Argon2id at OWASP-recommended parameters, with a 12-character minimum and PHC-encoded storage so the parameters recorded at enrolment govern every later verification. We do not hold it and cannot recover it for you.',
  },
  {
    k: 'Hosted API keys',
    v: 'API keys you create for the hosted API are hashed with Argon2id. Only the hash and a short non-secret prefix are stored, and the prefix is stripped from API responses. The raw key exists once, in the response that created it.',
  },
  {
    k: 'Hosted connector tokens',
    v: 'Bearer tokens for custom MCP connectors are encrypted with AES-256-GCM under a dedicated key. If that key is missing or malformed the production process refuses to start rather than falling back to a per-process key that would silently lose your tokens on the next deploy.',
  },
  {
    k: 'Two-factor secrets',
    v: 'TOTP secrets are stored encrypted and backup codes are stored hashed. Disabling two-factor authentication requires a valid current code.',
  },
];

const ACCESS: { title: string; body: string }[] = [
  {
    title: 'Sessions and protected routes',
    body: 'Authentication is handled by Clerk. Six route groups — chat, library, schedules, settings, billing, and admin — are checked at the edge before the page renders; a request without a session cookie is redirected to login carrying its intended destination, so a protected page never renders and then complains.',
  },
  {
    title: 'Administrative access',
    body: 'Admin routes require an explicit admin or owner role read from the Clerk identity, not from anything the browser sends. There is no client-side flag that grants it.',
  },
  {
    title: 'Cross-site request forgery',
    body: 'State-changing requests carry an HMAC-SHA256 token compared in constant time. The signing secret must be at least 32 bytes or the process refuses it. A previous secret can be honoured during a rotation window and then removed. If no secret is configured, a random one is generated so every token fails — the system fails closed, not open.',
  },
  {
    title: 'Rate limiting and abuse',
    body: 'Limits are enforced per endpoint through Upstash Redis, which is required at production runtime — the module throws on start if it is not configured. Security-sensitive endpoints are marked fail-closed and reject requests when the limiter is unreachable; a few business-critical paths such as checkout are deliberately fail-open, and are marked as such in the code.',
  },
];

const ISOLATION: { title: string; body: string }[] = [
  {
    title: 'Script injection',
    body: "Every response carries a Content-Security-Policy built per request with a fresh random nonce. script-src contains no 'unsafe-inline': an injected inline script has no nonce and does not execute. object-src is 'none', base-uri and form-action are 'self', and frame-ancestors is 'none' everywhere except one documented case — owner-scoped PDF preview, which is restricted to PDF responses on an authenticated file route.",
  },
  {
    title: 'Allowlist integrity',
    body: 'The third-party origins the policy admits are derived, not pasted. The authentication origin is decoded from the publishable key and rejected unless it is shaped like a hostname; the upload origin is admitted only if the account identifier is exactly 32 hex characters and the bucket name matches a valid bucket shape. A typo in an environment variable therefore cannot widen script-src or connect-src to an arbitrary host — it just drops the origin.',
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
    body: 'Managed code execution through E2B is off unless an operator sets an explicit execution flag. Holding an E2B API key does not by itself open the loop — that was a deliberate design decision, so a credential appearing in the environment cannot quietly enable remote execution.',
  },
  {
    title: 'Desktop command execution',
    body: 'The desktop shell gate classifies a command three ways, most restrictive wins. Commands classified as forbidden never run, even if you approve them. Commands classified as prompt route into the confirmation flow before execution. The classifier combines argv-prefix policy rules with a dangerous-pattern check that catches pipes and shell operators the prefix rules cannot express.',
  },
];

const DB_ROWS: { k: string; v: string }[] = [
  {
    k: 'What the policies do',
    v: 'Row-level security policies on user-scoped tables carry both a read condition and an explicit write condition, so a cross-tenant read and a cross-tenant insert or update are both rejected by the database. The user identity comes from a session variable that returns NULL when unset, and NULL denies — an unset context sees nothing rather than everything.',
  },
  {
    k: 'How a request binds to them',
    v: 'A request served by the user-scoped database client opens a transaction, switches to a role that cannot bypass row-level security, binds the caller identity for that transaction only, and then runs the query. The identity is taken from a token whose signature was verified upstream.',
  },
  {
    k: 'Workspace scope',
    v: 'The workspace header a client sends is a selector, not a grant. Membership and role are resolved inside the database from the membership table, so a client that names a workspace it does not belong to collapses to personal scope. Malformed values are rejected before they reach the query.',
  },
  {
    k: 'Where this applies today',
    v: 'The user-scoped client is used by chat and conversation sync, projects, memory, settings and organization sharing, code sessions, schedules, connector permissions, media generation, research reports, artifact publishing, and OpenAI-compatible endpoints. On those routes the database enforces isolation independently of the application. We do not publish a route count because it changes as routes are added or consolidated.',
  },
  {
    k: 'Where it does not, yet',
    v: 'Other hosted routes connect as the database owner, which bypasses row-level security by design. Those routes must implement authentication, ownership, and workspace filters in their application queries; using the owner connection is not itself an isolation control. Widening database-enforced coverage is an open item below, with no promised date.',
  },
];

const LOGGING: { k: string; v: string }[] = [
  {
    k: 'What the hosted platform records',
    v: 'A single module owns writes into the security event table. It records seven failure and abuse event types — failed authentication, rate-limit exceeded, failed authorization, suspicious activity, administrative action, failed CSRF validation, and invalid signature — plus a separate taxonomy for successful business events. Authentication, account-lifecycle, billing, connector, team and organisation, API-key, and session routes call that module.',
  },
  {
    k: 'What it does not record',
    v: 'There is no hosted, user-visible journal of individual tool calls. Desktop keeps a local audit log of tool executions and permission requests; the hosted surface does not have an equivalent, and we are not going to describe one until it exists.',
  },
  {
    k: 'Error output',
    v: 'Errors returned to a browser are generic per status class. Database messages, constraint names, and driver codes are logged server-side and never sent to the client, except for a short explicit allowlist of application-defined codes the interface needs in order to explain what to do next.',
  },
  {
    k: 'Secret leakage',
    v: 'A detector scans values for secret-shaped strings — provider key prefixes, live payment keys, JSON web tokens, bearer headers, database connection strings — and throws before the value can be logged or returned.',
  },
  {
    k: 'Error monitoring',
    v: 'Sentry runs with default PII collection disabled, plus scrubbing hooks on both events and breadcrumbs.',
  },
  {
    k: 'Who can read it',
    v: 'Security event records are readable by the account they belong to, through user-scoped settings routes; org-wide admin views are not built yet. The table is append-only — update and delete are revoked from the application role. A database routine can delete records older than 90 days, but no scheduled route invokes it today, so automatic expiry is not promised.',
  },
];

const DELETION: { title: string; body: string }[] = [
  {
    title: 'The list is enumerated, not implied',
    body: 'Erasure walks a hardcoded, foreign-key-ordered list of 66 user-scoped tables covering conversations, artifacts, folders, tags, branches, bookmarks, reactions, shares, memories, settings, projects, shortcuts, search history, schedules, connectors, connector permissions, notifications, feedback, support tickets and their replies, API keys, two-factor enrolment, sessions, credits, redemptions, usage and billing records, mobile store transactions, video generation jobs, consent records, data-rights requests, email preferences, device registrations, sync data, workspace membership, subscriptions, and finally the profile row. Child tables that cascade are deliberately left out of the list so there is one source of truth, not two.',
  },
  {
    title: 'Bytes before rows',
    body: 'Stored media objects are deleted from object storage first, and only then are their catalogue rows removed. If an object delete fails, its row is kept so a later run can retry — deleting the row first would destroy the only pointer to a live object and leave it orphaned forever.',
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

const RELEASE: { k: string; v: string }[] = [
  {
    k: 'Dependency and code scanning',
    v: 'What blocks a merge: dependency audits at critical and high severity, cargo-deny checks for banned crates, sources, licences and advisories, and a check that every third-party GitHub Action is pinned to a full commit SHA (first-party `actions/*` are exempt from that check). What runs without blocking: a Semgrep security-audit pass, whose remaining findings are package-manager supply-chain hardening we have triaged and not yet done — it will block once they reach zero. A weekly Monday job runs a Rust advisory audit and clippy. We do not run CodeQL; if you saw that claim here before 14 August 2026, it was wrong.',
  },
  {
    k: 'macOS builds',
    v: 'The release workflow hard-fails unless Apple signing and notarization credentials are present, and publishes a notarized universal disk image. You can verify the signature and the stapled notarization ticket yourself with codesign, spctl, and stapler.',
  },
  {
    k: 'Windows builds',
    v: 'The installer is signed through Azure Trusted Signing, and the workflow throws — before anything is published — if the signature does not verify as Valid.',
  },
];

const NOT_DONE: { k: string; v: string }[] = [
  {
    k: 'SOC 2',
    v: 'No SOC 2 Type I or Type II report exists. No audit is underway and there is no auditor engaged. Nothing on this site should be read as implying otherwise.',
  },
  {
    k: 'ISO 27001',
    v: 'Not certified. No certification body engaged.',
  },
  {
    k: 'HIPAA',
    v: 'AGI is not offered for protected health information. We do not sign business associate agreements.',
  },
  {
    k: 'Penetration test',
    v: 'No third-party penetration test has been performed. The scanning described above is automated tooling in our own pipeline, which is not a substitute.',
  },
  {
    k: 'Bug bounty',
    v: 'We do not run a paid bounty programme. Reports are still read and fixed — see below — but do not expect payment.',
  },
  {
    k: 'Database policy coverage',
    v: 'Row-level security is bound on the user-scoped routes named above. Other privileged routes must enforce authenticated ownership and workspace scope in application queries; widening database-enforced coverage remains open work.',
  },
  {
    k: 'Inline styles',
    v: "The Content-Security-Policy still permits 'unsafe-inline' for styles because the component library depends on inline style attributes. Scripts do not have this exemption; styles do.",
  },
  {
    k: 'Production access controls',
    v: 'Production database credentials exist and are held by the operator. There is no just-in-time access approval workflow, no periodic access review, and no separate break-glass procedure. For a company this size that is the honest state, and it is what a reviewer should assume.',
  },
  {
    k: 'Availability commitments',
    v: 'No published recovery point or recovery time objective, and no backup-restore test evidence. The planned targets on /sla are targets, not commitments.',
  },
  {
    k: 'On-call',
    v: 'There is no 24/7 rotation. Incident response is best-effort during working hours.',
  },
  {
    k: 'Incident history',
    v: 'We have not published an incident archive or postmortems. The notification commitment is on /status; the archive does not exist yet.',
  },
  {
    k: 'EU representative',
    v: 'AGI Automation LLC has not yet designated a representative in the European Union under Article 27 GDPR. Status is tracked at /legal/eu-representative.',
  },
  {
    k: 'Health-check coverage',
    v: 'The live check on /status covers Postgres reachability, the payments API, and required environment configuration. Authentication, object storage, the gateway, the rate limiter, and model routes are not covered by it.',
  },
  {
    k: 'India — DPDP Act, 2023',
    v: 'Our position is published in full at /privacy/india, including the parts that are gaps rather than controls: no verifiable parental consent (the Act treats anyone under 18 as a child), no notice translations into Eighth Schedule languages, no Indian data residency, and a grievance contact published as a role rather than a named officer. The consent and rights machinery is implemented; those four are not.',
  },
  {
    k: 'Automated-abuse verification',
    v: 'There is no first-party CAPTCHA or bot-verification check anywhere in our own code, and no server-side verification call for one. Sign-up bot protection is a feature of our identity provider, configured in its dashboard rather than in this repository — which means we cannot demonstrate its state from source, and a reviewer should not assume it. Unauthenticated endpoints that accept personal data are protected by CSRF validation and per-IP rate limiting, which are real controls but are not bot verification.',
  },
  {
    k: 'Log redaction',
    v: 'Bearer tokens are redacted before logs are written. There is no field-level redaction configured on the structured logger itself, so an email address passed into a log call is written as given. Reducing what reaches logs, rather than filtering it afterwards, is open work.',
  },
  {
    k: 'Fail-closed coverage is not uniform',
    v: 'Some controls fail closed by design and are described above — the analytics consent gate is one, and the web rate limiter refuses to start in production without its backing store. Others degrade rather than refuse when a dependency is unavailable, and a small number of operational switches can be set to admit traffic that would otherwise be blocked. Making the fail direction consistent, and making every security-relevant setting refuse a boot rather than warn, is tracked remediation work rather than something we have finished.',
  },
  {
    k: 'Legacy credential formats',
    v: 'Some second-factor secrets stored before the current encryption scheme are still readable in their original format, and no migration job has rewritten them. New enrolments use the current scheme. Until that migration runs, the honest statement is that our encryption-at-rest posture is not uniform across every historical row.',
  },
];

export default function SecurityPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-security-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Security</p>
          <h1 id="agi-security-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Three boundaries,</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">three different answers.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            Written for someone doing a security review, not for a buyer.{' '}
            <strong>
              Where the data sits, what encrypts it, who can reach it, what gets logged, and what
              happens when you delete — answered per mode, in specifics you can check.
            </strong>{' '}
            We hold no SOC 2 report, no ISO 27001 certificate, and no third-party penetration test.
            The gaps are listed on this page rather than left for you to find.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="Page contents">
              <li>Reviewed {LAST_REVIEWED}</li>
              <li>Managed Cloud · public alpha</li>
              <li>No certifications claimed</li>
            </ul>
            <div className="agi-fl-cta-row">
              <a href="#report" className="agi-fl-cta agi-fl-cta--primary">
                Report a Vulnerability
              </a>
              <a href="#not-done" className="agi-fl-cta agi-fl-cta--secondary">
                Read What We Have Not Done
              </a>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-boundaries-title">
          <p className="agi-fl-eyebrow">Start here</p>
          <h2 id="agi-security-boundaries-title" className="agi-fl-h2">
            The mode decides the whole risk model.
          </h2>
          <p className="agi-fl-section-lede">
            Most of this page only applies to one of the three. In Local mode the honest answer to
            &ldquo;which of your subprocessors touches my data&rdquo; is none of them, because none
            of our infrastructure is in the path at all.
          </p>
          <div className="agi-fl-trust-grid">
            {BOUNDARIES.map((b) => (
              <div key={b.mode} className="agi-fl-trust-card">
                <p className="agi-fl-trust-mode">
                  <span aria-hidden="true">{b.mark}</span> {b.mode}
                </p>
                <h3 className="agi-fl-trust-title">{b.title}</h3>
                <p className="agi-fl-trust-body">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-data-title">
          <p className="agi-fl-eyebrow">Where data lives</p>
          <h2 id="agi-security-data-title" className="agi-fl-h2">
            By category, by mode, by holder.
          </h2>
          <p className="agi-fl-section-lede">
            Named third parties and their regions are listed on{' '}
            <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
              /subprocessors
            </Link>
            . Processing terms are on{' '}
            <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
              /dpa
            </Link>
            .
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Data</th>
                <th>Local</th>
                <th>BYOK</th>
                <th>Managed Cloud</th>
              </tr>
            </thead>
            <tbody>
              {DATA_ROWS.map((row) => (
                <tr key={row.category}>
                  <td style={{ width: '22%' }}>{row.category}</td>
                  <td>{row.local}</td>
                  <td>{row.byok}</td>
                  <td>{row.cloud}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-transit-title">
          <p className="agi-fl-eyebrow">Encryption in transit</p>
          <h2 id="agi-security-transit-title" className="agi-fl-h2">
            What the browser is told, and enforced with.
          </h2>
          <table className="agi-ledger">
            <tbody>
              {TRANSIT.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '22%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-rest-title">
          <p className="agi-fl-eyebrow">Encryption at rest</p>
          <h2 id="agi-security-rest-title" className="agi-fl-h2">
            Named algorithms, named parameters.
          </h2>
          <table className="agi-ledger">
            <tbody>
              {AT_REST.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '22%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-access-title">
          <p className="agi-fl-eyebrow">Access control</p>
          <h2 id="agi-security-access-title" className="agi-fl-h2">
            Who gets in, and what stops them.
          </h2>
          <ul className="agi-reasons">
            {ACCESS.map((item) => (
              <li key={item.title} className="agi-reason">
                <h3 className="agi-reason-h">{item.title}</h3>
                <p className="agi-reason-p">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-db-title">
          <p className="agi-fl-eyebrow">Tenant isolation</p>
          <h2 id="agi-security-db-title" className="agi-fl-h2">
            Database isolation, including where it does not reach yet.
          </h2>
          <p className="agi-fl-section-lede">
            This is the section most vendors round up. We are not going to, because the number is
            checkable and rounding it up is exactly the failure a review is meant to catch.
          </p>
          <table className="agi-ledger">
            <tbody>
              {DB_ROWS.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '24%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-isolation-title">
          <p className="agi-fl-eyebrow">Execution isolation</p>
          <h2 id="agi-security-isolation-title" className="agi-fl-h2">
            Untrusted code and untrusted URLs.
          </h2>
          <p className="agi-fl-section-lede">
            A model writes code and picks URLs. Both are untrusted input, and both are treated as
            such.
          </p>
          <ul className="agi-reasons">
            {ISOLATION.map((item) => (
              <li key={item.title} className="agi-reason">
                <h3 className="agi-reason-h">{item.title}</h3>
                <p className="agi-reason-p">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-logging-title">
          <p className="agi-fl-eyebrow">Logging</p>
          <h2 id="agi-security-logging-title" className="agi-fl-h2">
            What is captured, and what is deliberately not.
          </h2>
          <table className="agi-ledger">
            <tbody>
              {LOGGING.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '24%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-deletion-title">
          <p className="agi-fl-eyebrow">Deletion</p>
          <h2 id="agi-security-deletion-title" className="agi-fl-h2">
            What actually happens when you delete an account.
          </h2>
          <p className="agi-fl-section-lede">
            Deletion is the claim vendors are least often asked to demonstrate and most often fail.
            Here is the mechanism, in the order it runs.
          </p>
          <ul className="agi-reasons">
            {DELETION.map((item) => (
              <li key={item.title} className="agi-reason">
                <h3 className="agi-reason-h">{item.title}</h3>
                <p className="agi-reason-p">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-release-title">
          <p className="agi-fl-eyebrow">Release integrity</p>
          <h2 id="agi-security-release-title" className="agi-fl-h2">
            What runs before anything ships.
          </h2>
          <table className="agi-ledger">
            <tbody>
              {RELEASE.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '24%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="report" className="agi-fl-section" aria-labelledby="agi-security-report-title">
          <p className="agi-fl-eyebrow">Coordinated disclosure</p>
          <h2 id="agi-security-report-title" className="agi-fl-h2">
            Reporting a vulnerability.
          </h2>
          <p className="agi-fl-section-lede">
            Email{' '}
            <a href={contactMailto(CONTACT_SUBJECTS.security)} style={{ color: 'var(--agi-ink)' }}>
              {CONTACT_EMAIL}
            </a>{' '}
            with <strong>{CONTACT_SUBJECTS.security}</strong> in the subject line. This is the
            mailbox that is actually monitored; we would rather publish one address that works than
            a dedicated alias that bounces.
          </p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td style={{ width: '24%' }}>Include</td>
                <td>
                  The affected surface (web, desktop, mobile, extension, CLI), the version or URL,
                  steps to reproduce, and what an attacker gains. A proof of concept helps. Please
                  do not send video only.
                </td>
              </tr>
              <tr>
                <td>In scope</td>
                <td>
                  agiworkforce.com and its subdomains, the hosted API, the artifact sandbox origin,
                  the desktop application and its updater, the CLI, and the browser and editor
                  extensions.
                </td>
              </tr>
              <tr>
                <td>Out of scope</td>
                <td>
                  Findings in third-party services we consume — report those to the vendor. Denial
                  of service, volumetric or brute-force testing, social engineering of our staff or
                  users, physical attacks, spam or rate-limit exhaustion, and reports produced by a
                  scanner with no demonstrated impact.
                </td>
              </tr>
              <tr>
                <td>Safe harbour</td>
                <td>
                  If you research in good faith, stay within the scope above, avoid privacy
                  violations and service degradation, use only accounts you own or have permission
                  to test, and give us a reasonable chance to fix the issue before disclosing it, we
                  will not pursue or support legal action against you, and we will say so in writing
                  if you ask.
                </td>
              </tr>
              <tr>
                <td>Response</td>
                <td>
                  We do not publish a fixed acknowledgement or remediation time. This is not a 24/7
                  reporting channel; reports are reviewed on a best-effort basis during working
                  hours.
                </td>
              </tr>
              <tr>
                <td>Reward</td>
                <td>
                  There is no paid bounty programme. We will credit you by name in the changelog if
                  you want the credit, and decline to name you if you do not.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section id="not-done" className="agi-fl-section" aria-labelledby="agi-security-gaps-title">
          <p className="agi-fl-eyebrow">Open items</p>
          <h2 id="agi-security-gaps-title" className="agi-fl-h2">
            What we have not done.
          </h2>
          <p className="agi-fl-section-lede">
            No dates are attached to any of these. A date we cannot keep is worse than an admission
            we can. As of {LAST_REVIEWED}:
          </p>
          <table className="agi-ledger">
            <tbody>
              {NOT_DONE.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '24%' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-security-more-title">
          <p className="agi-fl-eyebrow">Related</p>
          <h2 id="agi-security-more-title" className="agi-fl-h2">
            The rest of the trust surface.
          </h2>
          <div className="agi-fl-cta-row">
            <Link href="/trust" className="agi-fl-cta agi-fl-cta--primary">
              Dated Posture Ledger
            </Link>
            <Link href="/status" className="agi-fl-cta agi-fl-cta--secondary">
              Live Status
            </Link>
            <Link href="/privacy" className="agi-fl-cta agi-fl-cta--ghost">
              Privacy Policy
            </Link>
            <Link href="/subprocessors" className="agi-fl-cta agi-fl-cta--ghost">
              Subprocessors
            </Link>
            <Link href="/dpa" className="agi-fl-cta agi-fl-cta--ghost">
              Data Processing Addendum
            </Link>
            <Link href="/sla" className="agi-fl-cta agi-fl-cta--ghost">
              Service Levels
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
