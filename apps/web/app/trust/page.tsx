import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Trust',
  description:
    'A dated posture ledger: what is true today, what artifact would prove it, and what we have not done. No certifications are claimed.',
  path: '/trust',
});

const LAST_REVIEWED = POLICY_LAST_UPDATED.trust;
const NEXT_REVIEW = 'November 2026';

const COMPLIANCE: {
  item: string;
  status: string;
  artifact: string;
  asOf: string;
}[] = [
  {
    item: 'SOC 2',
    status: 'Not held',
    artifact:
      'A Type I or Type II report from a licensed auditor would prove it. No report exists, no auditor is engaged, and no audit is in progress. We are not going to describe internal work as an audit programme.',
    asOf: '2026-08-05',
  },
  {
    item: 'ISO 27001',
    status: 'Not held',
    artifact:
      'A certificate from an accredited certification body would prove it. None exists and no body is engaged.',
    asOf: '2026-08-05',
  },
  {
    item: 'HIPAA',
    status: 'Not offered',
    artifact:
      'A signed business associate agreement would be the artifact. We do not sign them and AGI is not offered for protected health information.',
    asOf: '2026-08-05',
  },
  {
    item: 'Third-party penetration test',
    status: 'Not performed',
    artifact:
      'A dated report and remediation letter from a testing firm would prove it. Neither exists. Automated scanning in our own pipeline is described on /security and is not a substitute.',
    asOf: '2026-08-05',
  },
  {
    item: 'GDPR — data subject rights',
    status: 'Implemented',
    artifact:
      'Self-service export returns your account data as a JSON download, and account deletion runs an enumerated erasure across 68 user-scoped tables plus stored objects, on a daily scheduled job. Mechanism is documented on /security; the deletion window is stated in the privacy policy. The figure read 34 until 14 August 2026, while the list had grown to 66 — nothing checked it. A test now derives it from the code.',
    asOf: '2026-08-14',
  },
  {
    item: 'GDPR — Article 27 EU representative',
    status: 'Not appointed',
    artifact:
      'A designation naming a representative established in the Union. It has not been made. This is a known open obligation, tracked at /legal/eu-representative, and we are listing it rather than letting you discover it.',
    asOf: '2026-08-05',
  },
  {
    item: 'CCPA / CPRA — access and deletion',
    status: 'Implemented',
    artifact:
      'The same export and erasure paths as above. We do not sell personal information; see the privacy policy for the disclosure.',
    asOf: '2026-08-05',
  },
  {
    item: 'Subprocessor transparency',
    status: 'Published — corrected 14 August 2026',
    artifact:
      'A list of processors with purpose and region is published at /subprocessors, and processing terms are at /dpa. Stating the correction rather than quietly reissuing the list: a review on 14 August found six recipients missing, including a transactional email provider that had been delisted nine days earlier on the false reasoning that no email package appeared in our dependencies — it calls the provider’s HTTP API directly, so the check could not have found it. The list is now built from egress rather than from the manifest.',
    asOf: '2026-08-14',
  },
  {
    item: 'DPDP (India) — notice under s.5',
    status: 'Published',
    artifact:
      'An itemised notice at /privacy/india naming the fiduciary, each purpose, the recipients, retention, the cross-border position and every data-principal right, with what the product actually does for each. Drafted from the repository; NOT yet reviewed by Indian counsel, and it says so in its own source.',
    asOf: '2026-08-14',
  },
  {
    item: 'DPDP (India) — consent under s.6',
    status: 'Implemented',
    artifact:
      'A per-purpose consent ledger in the database, append-only by database grant and by trigger, so a withdrawal can never overwrite the grant it withdraws. Boxes render unticked, an unticked box is recorded as a decision, and the largest anonymous intake refuses to store an address without an explicit consent row written first. Withdrawal is one click at /privacy/requests.',
    asOf: '2026-08-14',
  },
  {
    item: 'DPDP (India) — data principal rights (ss.11–14)',
    status: 'Partially implemented',
    artifact:
      'Export and account deletion are self-serve; consent withdrawal is self-serve at /privacy/requests; access, correction, erasure without an account, and nomination are recorded as durable requests with a reference and worked manually. Nomination has no field in the product. The gaps are stated on /privacy/india rather than implied away.',
    asOf: '2026-08-14',
  },
  {
    item: 'DPDP (India) — grievance redressal under s.13',
    status: 'Published, as a role',
    artifact:
      'A grievance route published in the site footer, on /privacy/india and in the terms, reachable without an account. It names a role rather than an individual because no named officer has been designated — designating one is an open founder decision, not an engineering task.',
    asOf: '2026-08-14',
  },
  {
    item: 'DPDP (India) — verifiable parental consent under s.9',
    status: 'Not implemented',
    artifact:
      'Under this Act a child is anyone under 18 and verifiable parental consent is mandatory. The web surface has no age gate; the mobile age gate is self-declared and its minor-safe mode can be cleared by the child. This is the largest open gap in our DPDP position and we are listing it rather than letting you discover it.',
    asOf: '2026-08-14',
  },
  {
    item: 'DPDP (India) — notice languages under s.6(4)',
    status: 'Not provided',
    artifact:
      'The Act entitles a data principal to the notice in any Eighth Schedule language. Only English is published. Translation is a commissioning decision that has not been made.',
    asOf: '2026-08-14',
  },
  {
    item: 'DPDP (India) — Significant Data Fiduciary obligations',
    status: 'Not applicable unless notified',
    artifact:
      'Significant Data Fiduciary status is a Central Government notification, not a self-assessment. AGI has not been notified. If it ever is, a named India-based Data Protection Officer, a data protection impact assessment and an independent audit become mandatory, and none of the three exists today.',
    asOf: '2026-08-14',
  },
  {
    item: 'DPDP (India) — data residency',
    status: 'Not offered',
    artifact:
      'All hosting is in the United States. There is no Indian region and no plan published for one, so using the service means personal data leaves India.',
    asOf: '2026-08-14',
  },
];

const POSTURE: { item: string; state: string; detail: string; asOf: string }[] = [
  {
    item: 'Local mode isolation',
    state: 'Implemented',
    detail:
      'Local chats run on your own hardware and are written to an encrypted database on your disk. No AGI infrastructure and no subprocessor is in the request path.',
    asOf: '2026-08-05',
  },
  {
    item: 'Device encryption at rest',
    state: 'Implemented',
    detail:
      'SQLCipher is compiled into every desktop build — not an option. New installs key the database with 256 bits from the OS random source, held in the OS credential service and namespaced per build identity.',
    asOf: '2026-08-05',
  },
  {
    item: 'Secret storage',
    state: 'Implemented',
    detail:
      'Provider keys are sealed with AES-256-GCM under purpose-separated PBKDF2-HMAC-SHA256 keys at 600,000 iterations. The optional master password uses Argon2id at OWASP parameters and cannot be recovered by us.',
    asOf: '2026-08-05',
  },
  {
    item: 'Transport security',
    state: 'Implemented',
    detail:
      'HSTS with a two-year max-age, subdomains included, preload requested; frame denial, MIME sniffing off, and a restrictive permissions policy on every response.',
    asOf: '2026-08-05',
  },
  {
    item: 'Content Security Policy',
    state: 'Implemented, with one documented exemption',
    detail:
      "Per-request nonce, no 'unsafe-inline' in script-src, object-src none, frame-ancestors none except owner-scoped PDF preview. Inline styles are still permitted; that exemption is listed as an open item on /security rather than omitted.",
    asOf: '2026-08-05',
  },
  {
    item: 'Artifact sandboxing',
    state: 'Implemented',
    detail:
      "Model-generated artifacts render on a separate origin with no network egress (connect-src 'none') and frame-ancestors pinned to our hosts. The fallback path drops allow-same-origin rather than weakening the sandbox.",
    asOf: '2026-08-05',
  },
  {
    item: 'Database row-level isolation',
    state: 'Partial — 35 of 147 database-backed hosted API route files',
    detail:
      'Counted against the 147 route files that reach the database; the other 97 hosted routes touch no database at all and are excluded from both sides rather than used to flatter the ratio. A route that reaches for the owner connection at all is counted against us, even where it also reads under policy. Where bound, queries run under a role that cannot bypass policy with the caller identity set per transaction, and both reads and writes are constrained. The remaining 112 connect as the database owner, which bypasses row-level security by design, and enforce ownership in application code only. The rules those routes must satisfy instead are on /security.',
    asOf: '2026-08-23',
  },
  {
    item: 'Authentication and CSRF',
    state: 'Implemented',
    detail:
      'Six protected route groups are checked before render; admin routes require an explicit server-side role. CSRF tokens are HMAC-SHA256 with an enforced minimum secret length, constant-time comparison, a rotation window, and fail-closed behaviour when unconfigured.',
    asOf: '2026-08-05',
  },
  {
    item: 'Rate limiting',
    state: 'Implemented',
    detail:
      'Per-endpoint limits backed by Redis, required at production runtime. Security-sensitive endpoints reject requests when the limiter is unreachable; a small number of business-critical paths are deliberately fail-open and marked so in code.',
    asOf: '2026-08-05',
  },
  {
    item: 'Egress and SSRF controls',
    state: 'Implemented',
    detail:
      'Private, loopback, link-local, and reserved ranges are rejected before any allowlist is consulted, including IPv4-mapped IPv6 forms. Remote MCP URLs must be HTTPS, publicly resolvable, and free of embedded credentials.',
    asOf: '2026-08-05',
  },
  {
    item: 'Security event logging',
    state: 'Implemented — seven event types',
    detail:
      'Failed authentication, rate-limit exceeded, failed authorization, suspicious activity, admin action, failed CSRF validation, and invalid signature, written by a single module. There is no hosted per-tool activity journal; the desktop keeps one locally.',
    asOf: '2026-08-05',
  },
  {
    item: 'Account erasure',
    state: 'Implemented and scheduled',
    detail:
      'Enumerated table sweep, stored objects deleted before their catalogue rows, a completeness flag that refuses to report partial success, erasure ordered before identity deletion, and a daily job that runs it.',
    asOf: '2026-08-05',
  },
  {
    item: 'Release signing',
    state: 'Implemented on macOS and Windows',
    detail:
      'The macOS workflow fails without Apple signing and notarization credentials and ships a notarized universal disk image. The Windows installer is signed through Azure Trusted Signing and the pipeline blocks if the signature does not verify.',
    asOf: '2026-08-05',
  },
  {
    item: 'Managed Cloud maturity',
    state: 'Public alpha, open by default since 27 June 2026',
    detail:
      'Signed-in users can use managed compute now. It is not general availability, and /sla describes targets rather than commitments. Hosted code execution through E2B stays off unless an operator sets an explicit flag.',
    asOf: '2026-08-05',
  },
  {
    item: 'Production access governance',
    state: 'Not implemented',
    detail:
      'Production database credentials exist and are held by the operator. There is no just-in-time access approval, no periodic access review, and no break-glass procedure.',
    asOf: '2026-08-05',
  },
  {
    item: 'Business continuity evidence',
    state: 'Not published',
    detail:
      'No recovery point objective, no recovery time objective, and no restore test evidence has been published. Treat continuity as unproven.',
    asOf: '2026-08-05',
  },
];

const VERIFY: { title: string; body: string }[] = [
  {
    title: 'Check our response headers',
    body: 'Request any page on agiworkforce.com and read Strict-Transport-Security, Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, and Permissions-Policy. The CSP nonce changes on every request; a repeated value would mean the claim on /security is wrong.',
  },
  {
    title: 'Check the artifact sandbox origin',
    body: "Fetch the sandbox origin directly and read its Content-Security-Policy. connect-src should be 'none' and frame-ancestors should be pinned to our application hosts, not a wildcard.",
  },
  {
    title: 'Check the macOS build signature',
    body: 'Download the disk image and run codesign --verify --deep --strict, spctl --assess --type execute, and stapler validate. A notarized, stapled Developer ID signature either verifies or it does not.',
  },
  {
    title: 'Check the Windows installer signature',
    body: 'Run Get-AuthenticodeSignature on the downloaded installer. Our release pipeline blocks publication unless that check reports Valid, so yours should agree.',
  },
  {
    title: 'Check Local mode with a packet capture',
    body: 'This is the claim worth testing, because it is the one that most differentiates us. Put the desktop app in Local mode with a local model and watch the network. Chat traffic to AGI infrastructure should be absent.',
  },
  {
    title: 'Check the live health signal',
    body: '/status runs its check when you load it and shows the timestamp. It is not a static badge, and it states exactly which dependencies it does and does not cover.',
  },
];

export default function TrustPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-trust-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Trust</p>
          <h1 id="agi-trust-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Claims with dates,</span>{' '}
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">and the ones we cannot make.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            A posture ledger, not a badge wall.{' '}
            <strong>
              Every row says what is true today, what artifact would prove it, and whether that
              artifact exists. Where it does not, the row says so.
            </strong>{' '}
            We hold no SOC 2 report, no ISO 27001 certificate, and no third-party penetration test —
            stated here rather than left out.
          </p>
          <div style={{ paddingBottom: 'clamp(48px, 7vw, 88px)' }}>
            <ul className="agi-fl-mode-ribbon" aria-label="Review dates">
              <li>Last reviewed {LAST_REVIEWED}</li>
              <li>Next review {NEXT_REVIEW}</li>
              <li>Managed Cloud · public alpha</li>
            </ul>
            <div className="agi-fl-cta-row">
              <Link href="/security" className="agi-fl-cta agi-fl-cta--primary">
                Read the Mechanisms
              </Link>
              <a href="#verify" className="agi-fl-cta agi-fl-cta--secondary">
                Verify Us Yourself
              </a>
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-trust-compliance-title">
          <p className="agi-fl-eyebrow">Certifications and obligations</p>
          <h2 id="agi-trust-compliance-title" className="agi-fl-h2">
            What we hold, and what we do not.
          </h2>
          <p className="agi-fl-section-lede">
            A certification claim is only as good as the document behind it, so each row names the
            document. Four of these rows say the document does not exist.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th>Proving artifact</th>
                <th>As of</th>
              </tr>
            </thead>
            <tbody>
              {COMPLIANCE.map((c) => (
                <tr key={c.item}>
                  <td style={{ width: '20%' }}>{c.item}</td>
                  <td style={{ width: '14%', color: 'var(--agi-ink)', fontWeight: 500 }}>
                    {c.status}
                  </td>
                  <td>{c.artifact}</td>
                  <td style={{ width: '12%', color: 'var(--agi-ink-quiet)' }}>{c.asOf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-trust-posture-title">
          <p className="agi-fl-eyebrow">Security posture</p>
          <h2 id="agi-trust-posture-title" className="agi-fl-h2">
            Control by control, dated.
          </h2>
          <p className="agi-fl-section-lede">
            Mechanisms are explained on{' '}
            <Link href="/security" style={{ color: 'var(--agi-ink)' }}>
              /security
            </Link>
            . This table is the summary a reviewer can scan, including the three rows that say a
            control is partial or absent.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Control</th>
                <th>State</th>
                <th>Detail</th>
                <th>As of</th>
              </tr>
            </thead>
            <tbody>
              {POSTURE.map((s) => (
                <tr key={s.item}>
                  <td style={{ width: '18%' }}>{s.item}</td>
                  <td style={{ width: '18%', color: 'var(--agi-ink)', fontWeight: 500 }}>
                    {s.state}
                  </td>
                  <td>{s.detail}</td>
                  <td style={{ width: '12%', color: 'var(--agi-ink-quiet)' }}>{s.asOf}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="verify" className="agi-fl-section" aria-labelledby="agi-trust-verify-title">
          <p className="agi-fl-eyebrow">Independent verification</p>
          <h2 id="agi-trust-verify-title" className="agi-fl-h2">
            Do not take our word for it.
          </h2>
          <p className="agi-fl-section-lede">
            Most of what this page asserts is externally observable. If any of these checks disagree
            with the tables above, the tables are wrong and we want to know.
          </p>
          <ul className="agi-reasons">
            {VERIFY.map((item) => (
              <li key={item.title} className="agi-reason">
                <h3 className="agi-reason-h">{item.title}</h3>
                <p className="agi-reason-p">{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-trust-changes-title">
          <p className="agi-fl-eyebrow">Change record</p>
          <h2 id="agi-trust-changes-title" className="agi-fl-h2">
            When this page last moved.
          </h2>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td style={{ width: '16%' }}>2026-08-05</td>
                <td>
                  Rewritten as a dated ledger. Removed a claim that SOC 2 evidence collection was
                  underway — no such programme exists. Corrected the code-signing rows, which
                  described signing as planned when both macOS notarization and Windows signing are
                  implemented and enforced in the release pipeline. Replaced the general
                  database-isolation claim with the actual route coverage. Added the unappointed EU
                  Article 27 representative, absent production access governance, and absent
                  continuity evidence as explicit rows.
                </td>
              </tr>
              <tr>
                <td>2026-07</td>
                <td>
                  Retention consolidated to a single enforced answer, and the subprocessor list
                  corrected to include processors that were live but unlisted.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-trust-more-title">
          <p className="agi-fl-eyebrow">Related</p>
          <h2 id="agi-trust-more-title" className="agi-fl-h2">
            Go deeper on any of it.
          </h2>
          <div className="agi-fl-cta-row">
            <Link href="/security" className="agi-fl-cta agi-fl-cta--primary">
              Security Mechanisms
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
