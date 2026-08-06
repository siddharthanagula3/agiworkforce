import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GOVERNING_LAW,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Data Processing Addendum',
  description:
    'The full DPA text, readable before you sign: role allocation per trust boundary, Annex I processing details, Annex II security measures with their limits, Annex III subprocessors, and the transfer mechanism.',
  path: '/dpa',
});

/*
 * DATA PROCESSING ADDENDUM — PUBLISHED IN FULL
 *
 * This page previously described a DPA instead of being one. A reviewer had to
 * email to learn the controller/processor split and could not read the annexes
 * before signing. Everything below is now on the page.
 *
 * TWO RULES FOR ANYONE EDITING THIS FILE
 *
 * 1. The role allocation is NOT flat. It differs per trust boundary, and the
 *    old flat clause ("you are the controller; we are the processor for any
 *    personal data you submit") was wrong in two of the three cases:
 *      - Local: nothing reaches AGI, so no processing by AGI occurs at all.
 *      - BYOK: the request goes from the customer's client to the provider on
 *        the customer's key, so the provider is the customer's processor, not
 *        AGI's sub-processor. /subprocessors already says exactly this.
 *      - Managed Cloud: AGI is the processor. This is the only case the old
 *        clause described correctly.
 *    Signing the flat clause would have AGI accepting processor obligations for
 *    data it never receives.
 *
 * 2. Annex II lists only measures this repository proves, and names the limits
 *    in the same table. Do not restore "encryption at rest, sandboxed tool
 *    execution, RLS-enforced access" as accomplished fact: encryption at rest is
 *    a vendor property nothing here configures, sandboxed execution is operator-
 *    gated and off by default (lib/e2b/gate.ts), and database RLS is enforced on
 *    the user-scoped sync paths rather than universally (db/neon/0037 states the
 *    caveat itself).
 */

const ANNEX_I: { k: string; v: string }[] = [
  {
    k: 'Subject matter',
    v: 'Provision of the AGI Managed Cloud service to the Customer under the Terms of Service and the Customer’s subscription.',
  },
  {
    k: 'Duration',
    v: 'For the term of the Customer’s subscription. On termination or an account deletion request, erasure is scheduled 24 hours out and then performed by a daily job — see section 09.',
  },
  {
    k: 'Nature and purpose',
    v: 'Storing and retrieving conversations, projects, files, memories, schedules and settings; transmitting prompt content to the model provider serving the model the Customer selects; executing code and processing files in a managed sandbox when the Customer invokes a tool and the operator has enabled sandbox execution; authentication, billing, rate limiting, abuse prevention and support.',
  },
  {
    k: 'Categories of data subjects',
    v: 'The Customer’s authorised users, and any individual whose personal data the Customer’s users choose to include in prompts, uploaded files or connected-account content.',
  },
  {
    k: 'Categories of personal data',
    v: 'Account identifiers (user id, email address, authentication metadata); billing identifiers held by the payment processor (AGI does not receive card numbers); conversation content including messages, tool calls, generated output and attached files; project and memory content; schedule definitions; connector grants and the third-party data those grants return; technical data such as IP address, device and browser metadata, and request logs.',
  },
  {
    k: 'Special categories',
    v: 'None are requested and none are required to use the service. The Customer must not submit special-category personal data under GDPR Art. 9, criminal-conviction data under Art. 10, payment card numbers, or records subject to HIPAA or comparable regimes. AGI is not configured for those regimes and makes no representation that it is.',
  },
  {
    k: 'Frequency',
    v: 'Continuous for the duration of the subscription, on Customer-initiated requests.',
  },
  {
    k: 'Processor',
    v: `${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}, ${NOTICE_ADDRESS}. Contact: ${CONTACT_EMAIL}.`,
  },
  {
    k: 'Controller',
    v: 'The Customer entity that accepts the Terms of Service, as identified in the countersigned copy.',
  },
];

const ANNEX_II: { k: string; v: string; limit: string }[] = [
  {
    k: 'Tenant scoping',
    v: 'Every server route that reads or writes Customer records resolves the authenticated user first and scopes the query to that user.',
    limit:
      'Application-layer scoping is the primary control. It is code, not a database guarantee.',
  },
  {
    k: 'Database row-level security',
    v: 'Postgres row-level security policies are defined on user-scoped tables, forced on the table and applied through a non-bypassing role, keyed to the authenticated subject.',
    limit:
      'RLS bites on the user-scoped sync paths that bind the request identity per connection. Routes that use the owner connection rely on application-layer scoping instead. This is a second layer of defence, not a universal one.',
  },
  {
    k: 'Authentication and session handling',
    v: 'Managed authentication with server-side route checks. Account status is read on every authenticated request and a suspended or banned account is refused; the check fails closed if the status cannot be read.',
    limit: 'Single sign-on and directory sync are not in scope of this addendum.',
  },
  {
    k: 'Request integrity',
    v: 'State-changing endpoints require a CSRF token bound to the session and perform ownership checks before acting on a record.',
    limit: 'The token is carried in a request header, not a cookie.',
  },
  {
    k: 'Rate limiting and abuse controls',
    v: 'Per-user and per-IP request ceilings on sensitive routes, with administrator actions to suspend or ban an account.',
    limit: 'There is no proactive content scanning of Customer conversations.',
  },
  {
    k: 'Audit logging',
    v: 'Security and account-lifecycle events are written to an append-only audit table hardened at the database level against update and delete.',
    limit:
      'This log covers security and account-lifecycle events. Customer-facing administrative audit export is not part of this addendum.',
  },
  {
    k: 'Encryption in transit',
    v: 'HTTPS on all deployed surfaces, with HSTS including subdomains and preload.',
    limit: 'None.',
  },
  {
    k: 'Encryption at rest',
    v: 'Storage is provided by the database and object-storage vendors listed in Annex III, which encrypt at rest as a property of their platforms.',
    limit:
      'This is a vendor property. AGI does not add an independent application-layer encryption scheme over stored Customer content, and holds no third-party report attesting to the vendors’ implementation.',
  },
  {
    k: 'Object storage access model',
    v: 'Uploaded and generated files are stored in Cloudflare R2 and served from a public base URL as permanent, unguessable object URLs.',
    limit:
      'Anyone who obtains such a URL can retrieve the object without authenticating. Customers who cannot accept that model should not upload the affected files. This is disclosed rather than described as an access control.',
  },
  {
    k: 'Sandboxed execution',
    v: 'Code execution runs in a managed third-party sandbox, isolated from AGI infrastructure.',
    limit:
      'Sandbox execution is gated behind an explicit operator flag and is off by default. When it is off, no code executes and no files are sent to the sandbox vendor.',
  },
  {
    k: 'Telemetry minimisation',
    v: 'Error monitoring is disabled unless the deployment is production with a DSN configured, sends no default personal data, and scrubs report content. Product analytics loads only after the visitor opts in, and the consent gate fails closed.',
    limit:
      'Error reports retain a stable user identifier so a crash can be correlated to a session. They are not anonymous.',
  },
  {
    k: 'Deletion',
    v: 'Account deletion is scheduled 24 hours out and then performed by a daily job that removes user-scoped rows and the associated stored objects, and deletes the identity at the authentication provider.',
    limit:
      'Vendor-side backup snapshots are governed by the vendors’ own retention configuration and are not separately purged by AGI. See section 09.',
  },
  {
    k: 'Personnel and change management',
    v: 'Changes pass repository guardrails, type checks, lint and focused tests, plus dependency and vulnerability scanning, before release.',
    limit:
      'AGI holds no SOC 2, ISO 27001 or comparable third-party attestation. See /trust for the dated compliance status.',
  },
];

export default function DpaPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Data Processing Addendum.</h1>
          <p className="agi-page-lede">
            The full text, published so you can read it before you ask for a signature.{' '}
            <strong>
              This addendum applies to AGI Managed Cloud. It does not apply to Local mode, where AGI
              processes nothing, and it does not make AGI a processor of your prompt content under
              BYOK, where you contract the model provider directly.
            </strong>{' '}
            Last updated: {POLICY_LAST_UPDATED.dpa}. Managed Cloud is in public alpha.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">01 &middot; Parties, scope, and precedence</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            This Data Processing Addendum (&ldquo;DPA&rdquo;) is entered into between {LEGAL_ENTITY}
            , {LEGAL_ENTITY_DESCRIPTOR} (&ldquo;AGI&rdquo;), and the customer entity that accepts
            the{' '}
            <Link href="/terms" style={{ color: 'var(--agi-ink)' }}>
              Terms of Service
            </Link>{' '}
            (&ldquo;Customer&rdquo;). It forms part of those terms and applies where AGI processes
            personal data on the Customer&rsquo;s behalf in connection with AGI Managed Cloud.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            In the event of a conflict, this DPA prevails over the Terms of Service on matters of
            data protection. A negotiated master services agreement or order form, once signed by
            both parties, prevails over both.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">02 &middot; Definitions</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            &ldquo;Applicable Data Protection Law&rdquo; means the EU General Data Protection
            Regulation 2016/679 (&ldquo;GDPR&rdquo;), the UK GDPR and Data Protection Act 2018, the
            Swiss Federal Act on Data Protection, and the California Consumer Privacy Act as amended
            (&ldquo;CCPA&rdquo;), each to the extent it applies. &ldquo;Controller&rdquo;,
            &ldquo;processor&rdquo;, &ldquo;data subject&rdquo;, &ldquo;personal data&rdquo; and
            &ldquo;processing&rdquo; carry the meanings given in the GDPR. &ldquo;Customer Personal
            Data&rdquo; means personal data contained in content the Customer or its users submit to
            Managed Cloud. &ldquo;Sub-processor&rdquo; means a third party engaged by AGI to process
            Customer Personal Data.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">03 &middot; Role allocation, by trust boundary</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI runs across three separate trust boundaries. The controller/processor relationship
            is not the same in all three, and stating one flat rule would be inaccurate for two of
            them.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Boundary</th>
                <th>What happens technically</th>
                <th>Role allocation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ width: '18%', verticalAlign: 'top' }}>Local</td>
                <td style={{ verticalAlign: 'top' }}>
                  Conversations run on the user&rsquo;s device against a local model runtime and are
                  stored on that device. Nothing is transmitted to AGI, and nothing is silently
                  routed to BYOK or Managed Cloud.
                </td>
                <td>
                  AGI processes no personal data. No controller/processor relationship arises and
                  this DPA has nothing to operate on. The Customer remains the controller of data on
                  its own devices.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>BYOK</td>
                <td style={{ verticalAlign: 'top' }}>
                  The request goes from the user&rsquo;s client directly to the model provider using
                  the Customer&rsquo;s own API key. AGI does not sit in that path.
                </td>
                <td>
                  The Customer is the controller and the model provider is the Customer&rsquo;s
                  processor, on the Customer&rsquo;s own contract with that provider. AGI is not a
                  processor of that prompt content and the provider is not an AGI sub-processor for
                  it. AGI remains processor for the account and settings data it stores.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Managed Cloud</td>
                <td style={{ verticalAlign: 'top' }}>
                  Requests route through AGI&rsquo;s gateway to the provider serving the selected
                  model. Conversations, files, projects, memories and schedules are stored by AGI.
                </td>
                <td>
                  The Customer is the controller and AGI is the processor. The model providers,
                  sandbox runtime and infrastructure vendors listed in Annex III are AGI&rsquo;s
                  sub-processors.
                </td>
              </tr>
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            AGI is an independent controller for a narrow set of its own data: account
            administration, billing records, security and audit logs, and service telemetry. It
            processes those for its own legitimate interests in running and securing the service, as
            described in the{' '}
            <Link href="/privacy" style={{ color: 'var(--agi-ink)' }}>
              privacy policy
            </Link>
            .
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">04 &middot; AGI&rsquo;s obligations as processor</p>
          <ul className="agi-reasons">
            <li className="agi-reason">
              <h3 className="agi-reason-h">Documented instructions</h3>
              <p className="agi-reason-p">
                AGI processes Customer Personal Data only on the Customer&rsquo;s documented
                instructions, which comprise the Terms of Service, this DPA, and the
                Customer&rsquo;s use of the service&rsquo;s features. AGI will tell the Customer if
                an instruction appears to infringe Applicable Data Protection Law. Where AGI is
                required by law to process beyond those instructions, it will inform the Customer
                first unless that law prohibits it.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">No training, no sale</h3>
              <p className="agi-reason-p">
                AGI does not train AGI-owned models on Customer Personal Data, does not sell it, and
                does not share it for cross-context behavioural advertising.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Confidentiality</h3>
              <p className="agi-reason-p">
                Personnel authorised to process Customer Personal Data are bound by confidentiality
                obligations, and access is limited to those who need it to operate or support the
                service.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Security</h3>
              <p className="agi-reason-p">
                AGI maintains the technical and organisational measures in Annex II. Because those
                measures include their own limits, the Customer should read Annex II before deciding
                what data to submit.
              </p>
            </li>
            <li className="agi-reason">
              <h3 className="agi-reason-h">Assistance</h3>
              <p className="agi-reason-p">
                AGI assists the Customer, taking into account the nature of processing and the
                information available to it, with data-subject requests, security obligations under
                Art. 32, breach notification under Arts. 33&ndash;34, and data protection impact
                assessments and prior consultation under Arts. 35&ndash;36.
              </p>
            </li>
          </ul>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">05 &middot; Sub-processors</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            The Customer gives general written authorisation for AGI to engage sub-processors. The
            current list, with each one&rsquo;s purpose and processing region, is published at{' '}
            <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
              /subprocessors
            </Link>{' '}
            and forms Annex III to this DPA. AGI imposes data protection obligations on each
            sub-processor no less protective than those in this DPA, and remains liable for their
            performance.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Change notice.</strong> AGI publishes additions and replacements on{' '}
            <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
              /subprocessors
            </Link>{' '}
            and records the change on{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            , which is the notice mechanism AGI can actually operate today &mdash; there is no
            transactional email system in the product, so this DPA does not promise emailed notice.
            The Customer may subscribe to the changelog feed to receive changes. A Customer may
            object to a new sub-processor on reasonable data protection grounds by writing to{' '}
            {CONTACT_EMAIL} within 30 days of publication; if AGI cannot offer a reasonable
            alternative, the Customer may terminate the affected subscription and receive a pro-rata
            refund of prepaid fees for the unused term.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">06 &middot; International transfers</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI hosts data in the United States. It does not currently offer European or United
            Kingdom data residency, so personal data of EU, UK and Swiss data subjects is
            transferred to and processed in the United States.
          </p>
          <table className="agi-ledger" style={{ marginTop: 16 }}>
            <tbody>
              <tr>
                <td style={{ width: '26%', verticalAlign: 'top' }}>EEA</td>
                <td>
                  The European Commission Standard Contractual Clauses (Decision 2021/914),{' '}
                  <strong>Module Two (controller to processor)</strong>, are incorporated by
                  reference. Clause 7 (docking) applies; Clause 9 option 2 (general written
                  authorisation) applies with the 30-day objection period in section 05; Clause 11
                  does not include the independent dispute resolution option; Clause 17 selects the
                  law of Ireland; Clause 18(b) selects the courts of Ireland. Annex I is section 07
                  of this page, Annex II is section 08, and Annex III is /subprocessors.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>United Kingdom</td>
                <td>
                  The UK International Data Transfer Addendum (version B1.0) to the SCCs applies.
                  Tables 1&ndash;3 are populated from sections 07 and 08 and /subprocessors; in
                  Table 4, neither party may end the Addendum as set out in Section 19.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Switzerland</td>
                <td>
                  The SCCs apply with the Swiss adaptations: references to the GDPR are read as
                  references to the FADP, the Federal Data Protection and Information Commissioner
                  is the competent authority, and the clauses also protect the data of legal
                  entities until the FADP no longer provides for it.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>California</td>
                <td>
                  AGI is a &ldquo;service provider&rdquo; under the CCPA. It processes personal
                  information only to perform the services, does not sell or share it, does not
                  retain, use or disclose it outside the direct business relationship or for any
                  purpose other than those specified, and does not combine it with personal
                  information from other sources except as the CCPA permits. AGI certifies that it
                  understands and will comply with these restrictions.
                </td>
              </tr>
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            AGI has not appointed a representative under GDPR Art. 27. The current position is
            stated at{' '}
            <Link href="/legal/eu-representative" style={{ color: 'var(--agi-ink)' }}>
              /legal/eu-representative
            </Link>{' '}
            rather than left implied here.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">07 &middot; Annex I &mdash; processing details</p>
          <table className="agi-ledger">
            <tbody>
              {ANNEX_I.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '26%', verticalAlign: 'top' }}>{row.k}</td>
                  <td>{row.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="agi-page-lede" style={{ marginTop: 16, fontSize: 14 }}>
            Competent supervisory authority for the purposes of the SCCs: the authority of the
            member state in which the Customer&rsquo;s EU representative is established, or where
            the Customer is not established in the EU, the authority of a member state in which the
            data subjects are located.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">
            08 &middot; Annex II &mdash; technical and organisational measures
          </p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Each measure is listed with its limit in the same row. A security annex that omits its
            own limits is not usable in a security review, and the limits here are the answers to
            the questions a reviewer would ask next.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Measure</th>
                <th>What is in place</th>
                <th>Limit</th>
              </tr>
            </thead>
            <tbody>
              {ANNEX_II.map((row) => (
                <tr key={row.k}>
                  <td style={{ width: '20%', verticalAlign: 'top' }}>{row.k}</td>
                  <td style={{ verticalAlign: 'top' }}>{row.v}</td>
                  <td style={{ width: '32%', color: 'var(--agi-ink-quiet)' }}>{row.limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">
            09 &middot; Deletion, return, and data-subject requests
          </p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            <strong>Export.</strong> An authenticated user can export their data from the account
            export endpoint at any time during the subscription, which satisfies the return limb of
            SCC Clause 8.5 and GDPR Art. 20.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Deletion.</strong> An account deletion request records a deletion timestamp and
            schedules erasure 24 hours later. A daily job then erases user-scoped records and the
            stored objects belonging to that account and deletes the identity at the authentication
            provider. Two limits are stated plainly because the product has them: no confirmation
            email is sent, since there is no transactional email system in the product; and there is
            no self-serve cancellation of a scheduled deletion, so a user who changes their mind
            within the 24-hour window must reach support.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Backups.</strong> Database and object-storage snapshots are governed by the
            vendors&rsquo; own retention configuration. AGI does not operate a separate process that
            reaches into vendor snapshots to remove individual records, and does not claim one.
            Restored data is re-subjected to the same erasure on the next scheduled run.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Data-subject requests.</strong> Where a data subject contacts AGI directly, AGI
            refers them to the Customer unless the Customer instructs otherwise, and assists the
            Customer in responding.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">10 &middot; Personal data breach</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI notifies the Customer without undue delay and in any event within 72 hours of
            becoming aware of a personal data breach affecting Customer Personal Data, using the
            account contact on file. The notification describes the nature of the breach, the
            categories and approximate number of data subjects and records affected so far as known,
            the likely consequences, the measures taken or proposed, and a contact point for further
            information. Where the full picture is not available within that window, AGI provides
            what it has and follows up in phases. Notification is not an admission of fault.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">11 &middot; Audit</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI makes available the information necessary to demonstrate compliance with this DPA.
            In practice that means written responses to a security questionnaire and the published
            material on{' '}
            <Link href="/security" style={{ color: 'var(--agi-ink)' }}>
              /security
            </Link>{' '}
            and{' '}
            <Link href="/trust" style={{ color: 'var(--agi-ink)' }}>
              /trust
            </Link>
            , once per twelve months on reasonable notice.{' '}
            <strong>
              AGI holds no SOC 2 report, ISO 27001 certificate, or other third-party attestation, so
              none can be provided in place of an audit.
            </strong>{' '}
            On-site inspection is available only where Applicable Data Protection Law requires it,
            at the Customer&rsquo;s expense, on 30 days&rsquo; notice, under confidentiality, and
            scoped so as not to compromise other customers&rsquo; data.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">12 &middot; Alpha status, liability, and term</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Managed Cloud is in public alpha. Its features, capacity and operational controls change
            as it develops, and no service level agreement applies during alpha &mdash; see{' '}
            <Link href="/sla" style={{ color: 'var(--agi-ink)' }}>
              /sla
            </Link>
            . This does not reduce AGI&rsquo;s obligations as processor under this DPA or under
            Applicable Data Protection Law, which are not conditioned on the release stage.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            Each party&rsquo;s liability under this DPA is subject to the limitations in the Terms
            of Service, except that nothing limits liability that cannot be limited under Applicable
            Data Protection Law, including a data subject&rsquo;s rights under the SCCs. This DPA
            takes effect when the Customer accepts the Terms of Service and continues for as long as
            AGI processes Customer Personal Data. It is governed by {GOVERNING_LAW}, except where
            the SCCs or the UK Addendum select a different governing law for the transfer
            obligations, in which case that selection prevails for those obligations.
          </p>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">13 &middot; Signature</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            This DPA is effective without signature once the Terms of Service are accepted. If your
            procurement process needs a countersigned copy, email{' '}
            <a href={contactMailto(CONTACT_SUBJECTS.dpa)} style={{ color: 'var(--agi-ink)' }}>
              {CONTACT_EMAIL}
            </a>{' '}
            with the subject line &ldquo;{CONTACT_SUBJECTS.dpa}&rdquo; and your entity&rsquo;s legal
            name, address and signatory. AGI returns a pre-signed copy of this text for you to
            counter-sign.
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <a href={contactMailto(CONTACT_SUBJECTS.dpa)} className="agi-cta-primary">
              Request a countersigned copy
            </a>
            <Link href="/subprocessors" className="agi-cta-ghost">
              Annex III &mdash; subprocessors &rarr;
            </Link>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy policy &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
