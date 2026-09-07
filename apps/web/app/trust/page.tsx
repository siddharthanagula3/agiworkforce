import Link from 'next/link';
import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Button,
  ButtonRow,
  Container,
  Ledger,
  Prose,
  Section,
  Stack,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { NoteList } from '@/features/marketing/components/pages/company/shared';
import { PolicyContents } from '@shared/components/legal/PolicyContents';
import { POLICY_LAST_UPDATED } from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Trust: a dated posture ledger',
  description:
    'A dated posture ledger: what is true today, what artifact would prove it, and what we have not done. No certifications are claimed.',
  path: '/trust',
});

const LAST_REVIEWED = POLICY_LAST_UPDATED.trust;
const NEXT_REVIEW = 'November 2026';

const SECTIONS = [
  { label: 'What we hold, and what we do not', id: 'compliance' },
  { label: 'Control by control, dated', id: 'posture' },
  { label: 'Do not take our word for it', id: 'verify' },
  { label: 'When this page last moved', id: 'changes' },
  { label: 'Go deeper on any of it', id: 'related' },
] as const;

const COMPLIANCE: { label: string; value: string }[] = [
  {
    label: 'SOC 2',
    value:
      'Not held. A Type I or Type II report from a licensed auditor would prove it. No report exists, no auditor is engaged, and no audit is in progress. We are not going to describe internal work as an audit programme. As of 2026-08-05.',
  },
  {
    label: 'ISO 27001',
    value:
      'Not held. A certificate from an accredited certification body would prove it. None exists and no body is engaged. As of 2026-08-05.',
  },
  {
    label: 'HIPAA',
    value:
      'Not offered. A signed business associate agreement would be the artifact. We do not sign them and AGI is not offered for protected health information. As of 2026-08-05.',
  },
  {
    label: 'Third-party penetration test',
    value:
      'Not performed. A dated report and remediation letter from a testing firm would prove it. Neither exists. Automated scanning in our own pipeline is described on /security and is not a substitute. As of 2026-08-05.',
  },
  {
    label: 'GDPR: data subject rights',
    value:
      'Implemented. Self-service export returns your account data as a JSON download, and account deletion runs an enumerated erasure across 73 user-scoped tables plus stored objects, on a daily scheduled job. Mechanism is documented on /security; the deletion window is stated in the privacy policy. The figure read 34 until 14 August 2026, while the list had grown to 66, nothing checked it. A test now derives it from the code. As of 2026-08-14.',
  },
  {
    label: 'GDPR: Article 27 EU representative',
    value:
      'Not appointed. A designation naming a representative established in the Union. It has not been made. This is a known open obligation, tracked at /legal/eu-representative, and we are listing it rather than letting you discover it. As of 2026-08-05.',
  },
  {
    label: 'CCPA / CPRA: access and deletion',
    value:
      'Implemented. The same export and erasure paths as above. We do not sell personal information; see the privacy policy for the disclosure. As of 2026-08-05.',
  },
  {
    label: 'Subprocessor transparency',
    value:
      'Published: corrected 14 August 2026. A list of processors with purpose and region is published at /subprocessors, and processing terms are at /dpa. Stating the correction rather than quietly reissuing the list: a review on 14 August found six recipients missing, including a transactional email provider that had been delisted nine days earlier on the false reasoning that no email package appeared in our dependencies: it calls the provider’s HTTP API directly, so the check could not have found it. The list is now built from egress rather than from the manifest. As of 2026-08-14.',
  },
  {
    label: 'DPDP (India): notice under s.5',
    value:
      'Published. An itemised notice at /privacy/india naming the fiduciary, each purpose, the recipients, retention, the cross-border position and every data-principal right, with what the product actually does for each. Drafted from the repository; NOT yet reviewed by Indian counsel, and it says so in its own source. As of 2026-08-14.',
  },
  {
    label: 'DPDP (India): consent under s.6',
    value:
      'Implemented. A per-purpose consent ledger in the database, append-only by database grant and by trigger, so a withdrawal can never overwrite the grant it withdraws. Boxes render unticked, an unticked box is recorded as a decision, and the largest anonymous intake refuses to store an address without an explicit consent row written first. Withdrawal is one click at /privacy/requests. As of 2026-08-14.',
  },
  {
    label: 'DPDP (India): data principal rights (ss.11–14)',
    value:
      'Partially implemented. Export and account deletion are self-serve; consent withdrawal is self-serve at /privacy/requests; access, correction, erasure without an account, and nomination are recorded as durable requests with a reference and worked manually. Nomination has no field in the product. The gaps are stated on /privacy/india rather than implied away. As of 2026-08-14.',
  },
  {
    label: 'DPDP (India): grievance redressal under s.13',
    value:
      'Published, as a role. A grievance route published in the site footer, on /privacy/india and in the terms, reachable without an account. It names a role rather than an individual because no named officer has been designated: designating one is an open founder decision, not an engineering task. As of 2026-08-14.',
  },
  {
    label: 'DPDP (India): verifiable parental consent under s.9',
    value:
      'Not implemented. Under this Act a child is anyone under 18 and verifiable parental consent is mandatory. The web surface has no age gate; the mobile age gate is self-declared and its minor-safe mode can be cleared by the child. This is the largest open gap in our DPDP position and we are listing it rather than letting you discover it. As of 2026-08-14.',
  },
  {
    label: 'DPDP (India): notice languages under s.6(4)',
    value:
      'Not provided. The Act entitles a data principal to the notice in any Eighth Schedule language. Only English is published. Translation is a commissioning decision that has not been made. As of 2026-08-14.',
  },
  {
    label: 'DPDP (India): Significant Data Fiduciary obligations',
    value:
      'Not applicable unless notified. Significant Data Fiduciary status is a Central Government notification, not a self-assessment. AGI has not been notified. If it ever is, a named India-based Data Protection Officer, a data protection impact assessment and an independent audit become mandatory, and none of the three exists today. As of 2026-08-14.',
  },
  {
    label: 'DPDP (India): data residency',
    value:
      'Not offered. All hosting is in the United States. There is no Indian region and no plan published for one, so using the service means personal data leaves India. As of 2026-08-14.',
  },
];

const POSTURE: { label: string; value: string }[] = [
  {
    label: 'Local mode isolation',
    value:
      'Implemented. Local chats run on your own hardware and are written to an encrypted database on your disk. No AGI infrastructure and no subprocessor is in the request path. As of 2026-08-05.',
  },
  {
    label: 'Device encryption at rest',
    value:
      'Implemented. SQLCipher is compiled into every desktop build, not an option. New installs key the database with 256 bits from the OS random source, held in the OS credential service and namespaced per build identity. As of 2026-08-05.',
  },
  {
    label: 'Secret storage',
    value:
      'Implemented. Provider keys are sealed with AES-256-GCM under purpose-separated PBKDF2-HMAC-SHA256 keys at 600,000 iterations. The optional master password uses Argon2id at OWASP parameters and cannot be recovered by us. As of 2026-08-05.',
  },
  {
    label: 'Transport security',
    value:
      'Implemented. HSTS with a two-year max-age, subdomains included, preload requested; frame denial, MIME sniffing off, and a restrictive permissions policy on every response. As of 2026-08-05.',
  },
  {
    label: 'Content Security Policy',
    value:
      "Implemented, with one documented exemption. Per-request nonce, no 'unsafe-inline' in script-src, object-src none, frame-ancestors none except owner-scoped PDF preview. Inline styles are still permitted; that exemption is listed as an open item on /security rather than omitted. As of 2026-08-05.",
  },
  {
    label: 'Artifact sandboxing',
    value:
      "Implemented. Model-generated artifacts render on a separate origin with no network egress (connect-src 'none') and frame-ancestors pinned to our hosts. The fallback path drops allow-same-origin rather than weakening the sandbox. As of 2026-08-05.",
  },
  {
    label: 'Database row-level isolation',
    value:
      'Partial: 114 of 200 database-backed hosted API route files. Counted against the 200 route files that reach the database; the other 94 hosted routes touch no database at all and are excluded from both sides rather than used to flatter the ratio. A route that reaches for the owner connection at all is counted against us, even where it also reads under policy. Where bound, queries run under a role that cannot bypass policy with the caller identity set per transaction, and both reads and writes are constrained. The remaining 86 connect as the database owner, which bypasses row-level security by design, and enforce ownership in application code only. The rules those routes must satisfy instead are on /security. As of 2026-09-06.',
  },
  {
    label: 'Authentication and CSRF',
    value:
      'Implemented. Six protected route groups are checked before render; admin routes require an explicit server-side role. CSRF tokens are HMAC-SHA256 with an enforced minimum secret length, constant-time comparison, a rotation window, and fail-closed behaviour when unconfigured. As of 2026-08-05.',
  },
  {
    label: 'Rate limiting',
    value:
      'Implemented. Per-endpoint limits backed by Redis, required at production runtime. Security-sensitive endpoints reject requests when the limiter is unreachable; a small number of business-critical paths are deliberately fail-open and marked so in code. As of 2026-08-05.',
  },
  {
    label: 'Egress and SSRF controls',
    value:
      'Implemented. Private, loopback, link-local, and reserved ranges are rejected before any allowlist is consulted, including IPv4-mapped IPv6 forms. Remote MCP URLs must be HTTPS, publicly resolvable, and free of embedded credentials. As of 2026-08-05.',
  },
  {
    label: 'Security event logging',
    value:
      'Implemented: seven event types. Failed authentication, rate-limit exceeded, failed authorization, suspicious activity, admin action, failed CSRF validation, and invalid signature, written by a single module. There is no hosted per-tool activity journal; the desktop keeps one locally. As of 2026-08-05.',
  },
  {
    label: 'Account erasure',
    value:
      'Implemented and scheduled. Enumerated table sweep, stored objects deleted before their catalogue rows, a completeness flag that refuses to report partial success, erasure ordered before identity deletion, and a daily job that runs it. As of 2026-08-05.',
  },
  {
    label: 'Release signing',
    value:
      'Implemented on macOS and Windows. The macOS workflow fails without Apple signing and notarization credentials and ships a notarized universal disk image. The Windows installer is signed through Azure Trusted Signing and the pipeline blocks if the signature does not verify. As of 2026-08-05.',
  },
  {
    label: 'Managed Cloud maturity',
    value:
      'Public alpha, open by default since 27 June 2026. Signed-in users can use managed compute now. It is not general availability, and /sla describes targets rather than commitments. Hosted code execution through E2B stays off unless an operator sets an explicit flag. As of 2026-08-05.',
  },
  {
    label: 'Production access governance',
    value:
      'Not implemented. Production database credentials exist and are held by the operator. There is no just-in-time access approval, no periodic access review, and no break-glass procedure. As of 2026-08-05.',
  },
  {
    label: 'Business continuity evidence',
    value:
      'Not published. No recovery point objective, no recovery time objective, and no restore test evidence has been published. Treat continuity as unproven. As of 2026-08-05.',
  },
];

const VERIFY = [
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
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-trust-title"
          eyebrow="Trust"
          title="Claims with dates, and the ones we cannot make."
          lede="A posture ledger, not a badge wall. Every row says what is true today, what artifact would prove it, and whether that artifact exists. Where it does not, the row says so. We hold no SOC 2 report, no ISO 27001 certificate, and no third-party penetration test, stated here rather than left out."
          ctas={[
            { href: '/security', label: 'Read the mechanisms' },
            { href: '#verify', label: 'Verify us yourself', variant: 'secondary' },
          ]}
        />

        <Section id="review" labelledBy="agi-trust-review-title" rule>
          <Stack gap="tight">
            <h2 className="agi-ds-h2" id="agi-trust-review-title">
              Last reviewed {LAST_REVIEWED}. Next review {NEXT_REVIEW}.
            </h2>
            <Prose size="sm">Managed Cloud is in public alpha.</Prose>
          </Stack>
        </Section>

        <Container>
          <div className="agi-ds-sticky-scene">
            <div className="agi-ds-sticky-pane">
              <PolicyContents sections={SECTIONS} />
            </div>
            <div className="agi-ds-sticky-flow">
              <Section id="compliance" labelledBy="agi-trust-compliance-title" rule ground="2">
                <Stack gap="loose">
                  <div>
                    <h2 className="agi-ds-h2" id="agi-trust-compliance-title">
                      What we hold, and what we do not.
                    </h2>
                    <Prose>
                      A certification claim is only as good as the document behind it, so each row
                      names the document. Several of these rows say the document does not exist.
                    </Prose>
                  </div>
                  <Ledger caption="Certifications and obligations" rows={COMPLIANCE} />
                </Stack>
              </Section>

              <Section id="posture" labelledBy="agi-trust-posture-title" rule>
                <Stack gap="loose">
                  <div>
                    <h2 className="agi-ds-h2" id="agi-trust-posture-title">
                      Control by control, dated.
                    </h2>
                    <Prose>
                      Mechanisms are explained on{' '}
                      <Link href="/security" className="agi-ds-link">
                        /security
                      </Link>
                      . This table is the summary a reviewer can scan, including the rows that say a
                      control is partial or absent.
                    </Prose>
                  </div>
                  <Ledger caption="Security posture" rows={POSTURE} />
                </Stack>
              </Section>

              <Section id="verify" labelledBy="agi-trust-verify-title" rule ground="2">
                <Stack gap="loose">
                  <div>
                    <h2 className="agi-ds-h2" id="agi-trust-verify-title">
                      Do not take our word for it.
                    </h2>
                    <Prose>
                      Most of what this page asserts is externally observable. If any of these
                      checks disagree with the tables above, the tables are wrong and we want to
                      know.
                    </Prose>
                  </div>
                  <NoteList items={VERIFY} />
                </Stack>
              </Section>

              <Section id="changes" labelledBy="agi-trust-changes-title" rule>
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-trust-changes-title">
                    When this page last moved.
                  </h2>
                  <Ledger
                    caption="Change record"
                    rows={[
                      {
                        label: '2026-09-06',
                        value:
                          'Re-measured after the operator route-economics endpoint shipped. It reads the model registry and the free-pool document and touches no database, so the routes excluded from both sides moved from 93 to 94. The row-level-isolation count stays at 114 of 200 and the owner-connection count at 86.',
                      },
                      {
                        label: '2026-09-06',
                        value:
                          'Re-measured after the plugin directory and connector routes shipped. The row-level-isolation count is now 114 of 200 database-backed routes and the owner-connection count is 86. The database-backed total moved from 201 to 200, and the routes excluded from both sides moved from 91 to 93.',
                      },
                      {
                        label: '2026-09-05',
                        value:
                          'Re-measured after more routes shipped the same day. The row-level-isolation count is now 114 of 201 database-backed routes and the owner-connection count is 87. The database-backed total rose from 198 to 201, and the routes excluded from both sides moved from 90 to 91.',
                      },
                      {
                        label: '2026-09-05',
                        value:
                          'Re-measured after the last batch of route handlers moved onto the caller connection. The row-level-isolation count is now 112 of 198 database-backed routes and the owner-connection count is 86. The database-backed total rose from 182 to 198 as routes shipped in the same period began reading the database, so the routes excluded from both sides moved from 106 to 90.',
                      },
                      {
                        label: '2026-09-05',
                        value:
                          'Re-measured after the map card shipped. Two new hosted routes serve map tiles and place photos and touch no database, so the routes excluded from both sides moved from 104 to 106. Other routes moved off the owner connection in the same period, so the row-level-isolation count is now 90 of 182 database-backed routes and the owner-connection count is 92. The database-backed total is unchanged.',
                      },
                      {
                        label: '2026-09-03',
                        value:
                          'Restored two cross-user reads, the projects list and a shared project lookup, that the row-level-security migration below had broken. Both now read through the owner connection instead of the caller-scoped one. That moves the row-level-isolation count from 66 of 161 database-backed routes to 64 of 161, and the owner-connection count from 95 to 97.',
                      },
                      {
                        label: '2026-09-03',
                        value:
                          'Migrated roughly 30 route handlers off the owner connection onto policy-scoped RLS clients, raising the row-level-isolation count from 39 of 154 database-backed routes to 66 of 161. The database-backed total moved too, since other routes shipped the same day; the count of routes touching no database is now 98.',
                      },
                      {
                        label: '2026-09-02',
                        value:
                          'Corrected the database row-level isolation row: the count of hosted routes that touch no database at all was undercounted by one. The measured routes that reach the database, and the split between policy-scoped and owner-connection routes, are unchanged.',
                      },
                      {
                        label: '2026-08-14',
                        value:
                          'Added the DPDP (India) surface: notice, consent, data-principal rights, grievance redressal, parental consent, notice languages, Significant Data Fiduciary status, and data residency, each rated against what the product does today. Corrected the GDPR/CCPA data-subject-rights row, which had cited 34 erasure-scoped tables against an actual 66; the count is now derived from code. Corrected the subprocessor-transparency row after a review found six live processors missing from the published list, including one delisted on a manifest check that could not see its direct HTTP calls.',
                      },
                      {
                        label: '2026-08-05',
                        value:
                          'Rewritten as a dated ledger. Removed a claim that SOC 2 evidence collection was underway: no such programme exists. Corrected the code-signing rows, which described signing as planned when both macOS notarization and Windows signing are implemented and enforced in the release pipeline. Replaced the general database-isolation claim with the actual route coverage. Added the unappointed EU Article 27 representative, absent production access governance, and absent continuity evidence as explicit rows.',
                      },
                      {
                        label: '2026-07',
                        value:
                          'Retention consolidated to a single enforced answer, and the subprocessor list corrected to include processors that were live but unlisted.',
                      },
                    ]}
                  />
                </Stack>
              </Section>

              <Section id="related" labelledBy="agi-trust-more-title" rule ground="2">
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-trust-more-title">
                    Go deeper on any of it.
                  </h2>
                  <ButtonRow>
                    <Button href="/security">Security mechanisms</Button>
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
            </div>
          </div>
        </Container>
      </main>
      <MarketingFooter />
    </div>
  );
}
