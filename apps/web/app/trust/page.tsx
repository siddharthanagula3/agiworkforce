import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';

export const metadata = buildMetadata({
  title: 'Trust',
  description:
    'A dated posture ledger: what is true today, what artifact would prove it, and what we have not done. No certifications are claimed.',
  path: '/trust',
});

/**
 * The dated counterpart to /security.
 *
 * /security explains mechanisms. This page exists to answer two questions a
 * mechanism page cannot: "when was this last checked" and "what could I verify
 * without taking your word for it".
 *
 * The previous version of this page promised "claims with dates" and rendered
 * zero dates, and asserted an active SOC 2 evidence-collection programme that
 * does not exist anywhere in this repository. Both are fixed here. Every row
 * carries an as-of date and, where a claim would normally rest on a document,
 * an explicit statement of whether that document exists.
 *
 * Rule for editing: if you change a row, change its `asOf`. A stale date is a
 * defect, not cosmetics.
 */
const LAST_REVIEWED = '5 August 2026';
const NEXT_REVIEW = 'November 2026';

/** Certification and regulatory posture. `artifact` says what would prove it. */
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
      'Self-service export returns your account data as a JSON download, and account deletion runs an enumerated erasure across 34 user-scoped tables plus stored objects, on a daily scheduled job. Mechanism is documented on /security; the deletion window is stated in the privacy policy.',
    asOf: '2026-08-05',
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
    status: 'Published',
    artifact:
      'A current list of processors with purpose and region is published at /subprocessors. Processing terms are at /dpa.',
    asOf: '2026-08-05',
  },
];

/** Security controls, stated as implemented or not, with an as-of date. */
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
    state: 'Partial — 22 of 170 hosted API route files',
    detail:
      'Where bound, queries run under a role that cannot bypass policy with the caller identity set per transaction, and both reads and writes are constrained. Every other hosted route enforces ownership in application code only. The exact figure and the covered surfaces are on /security.',
    asOf: '2026-08-05',
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

/** Things a reviewer can check without asking us anything. */
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
