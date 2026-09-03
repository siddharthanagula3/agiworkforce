import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PolicyContents } from '@shared/components/legal/PolicyContents';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import {
  Button,
  ButtonRow,
  Container,
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import {
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GOVERNING_LAW,
  GRIEVANCE_OFFICER_NAME,
  GRIEVANCE_RESPONSE_TARGET_DAYS,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Data Processing Addendum',
  description:
    'The full DPA text, readable before you sign: role allocation per trust boundary, Annex I processing details, Annex II security measures with their limits, Annex III subprocessors, Annex IV for India’s DPDP Act, and the transfer mechanism.',
  path: '/dpa',
});

const ANNEX_I: readonly LedgerRow[] = [
  {
    label: 'Subject matter',
    value:
      'Provision of the AGI Managed Cloud service to the Customer under the Terms of Service and the Customer’s subscription.',
  },
  {
    label: 'Duration',
    value:
      'For the term of the Customer’s subscription. On termination or an account deletion request, erasure is scheduled 24 hours out and then performed by a daily job, see section 09.',
  },
  {
    label: 'Nature and purpose',
    value:
      'Storing and retrieving conversations, projects, files, memories, schedules and settings; transmitting prompt content to the model provider serving the model the Customer selects; executing code and processing files in a managed sandbox when the Customer invokes a tool and the operator has enabled sandbox execution; authentication, billing, rate limiting, abuse prevention and support.',
  },
  {
    label: 'Categories of data subjects',
    value:
      'The Customer’s authorised users, and any individual whose personal data the Customer’s users choose to include in prompts, uploaded files or connected-account content.',
  },
  {
    label: 'Categories of personal data',
    value:
      'Account identifiers (user id, email address, authentication metadata); billing identifiers held by the payment processor (AGI does not receive card numbers); conversation content including messages, tool calls, generated output and attached files; project and memory content; schedule definitions; connector grants and the third-party data those grants return; technical data such as IP address, device and browser metadata, and request logs.',
  },
  {
    label: 'Special categories',
    value:
      'None are requested and none are required to use the service. The Customer must not submit special-category personal data under GDPR Art. 9, criminal-conviction data under Art. 10, payment card numbers, or records subject to HIPAA or comparable regimes. AGI is not configured for those regimes and makes no representation that it is.',
  },
  {
    label: 'Frequency',
    value: 'Continuous for the duration of the subscription, on Customer-initiated requests.',
  },
  {
    label: 'Processor',
    value: `${LEGAL_ENTITY}, ${LEGAL_ENTITY_DESCRIPTOR}, ${NOTICE_ADDRESS}. Contact: ${CONTACT_EMAIL}.`,
  },
  {
    label: 'Controller',
    value:
      'The Customer entity that accepts the Terms of Service, as identified in the countersigned copy.',
  },
];

const ANNEX_II: readonly LedgerRow[] = [
  {
    label: 'Tenant scoping',
    value: (
      <>
        <strong>In place:</strong> every server route that reads or writes Customer records resolves
        the authenticated user first and scopes the query to that user.
        <br />
        <strong>Limit:</strong> application-layer scoping is the primary control. It is code, not a
        database guarantee.
      </>
    ),
  },
  {
    label: 'Database row-level security',
    value: (
      <>
        <strong>In place:</strong> Postgres row-level security policies are defined on user-scoped
        tables, forced on the table and applied through a non-bypassing role, keyed to the
        authenticated subject.
        <br />
        <strong>Limit:</strong> RLS bites on the user-scoped sync paths that bind the request
        identity per connection. Routes that use the owner connection rely on application-layer
        scoping instead. This is a second layer of defence, not a universal one.
      </>
    ),
  },
  {
    label: 'Authentication and session handling',
    value: (
      <>
        <strong>In place:</strong> managed authentication with server-side route checks. Account
        status is read on every authenticated request and a suspended or banned account is refused;
        the check fails closed if the status cannot be read.
        <br />
        <strong>Limit:</strong> single sign-on and directory sync are not in scope of this addendum.
      </>
    ),
  },
  {
    label: 'Request integrity',
    value: (
      <>
        <strong>In place:</strong> state-changing endpoints require a CSRF token bound to the
        session and perform ownership checks before acting on a record.
        <br />
        <strong>Limit:</strong> the token is carried in a request header, not a cookie.
      </>
    ),
  },
  {
    label: 'Rate limiting and abuse controls',
    value: (
      <>
        <strong>In place:</strong> per-user and per-IP request ceilings on sensitive routes, with
        administrator actions to suspend or ban an account.
        <br />
        <strong>Limit:</strong> there is no proactive content scanning of Customer conversations.
      </>
    ),
  },
  {
    label: 'Audit logging',
    value: (
      <>
        <strong>In place:</strong> security and account-lifecycle events are written to an
        append-only audit table hardened at the database level against update and delete.
        <br />
        <strong>Limit:</strong> this log covers security and account-lifecycle events.
        Customer-facing administrative audit export is not part of this addendum.
      </>
    ),
  },
  {
    label: 'Encryption in transit',
    value: (
      <>
        <strong>In place:</strong> HTTPS on all deployed surfaces, with HSTS including subdomains
        and preload.
        <br />
        <strong>Limit:</strong> none.
      </>
    ),
  },
  {
    label: 'Encryption at rest',
    value: (
      <>
        <strong>In place:</strong> storage is provided by the database and object-storage vendors
        listed in Annex III, which encrypt at rest as a property of their platforms.
        <br />
        <strong>Limit:</strong> this is a vendor property. AGI does not add an independent
        application-layer encryption scheme over stored Customer content, and holds no third-party
        report attesting to the vendors&rsquo; implementation.
      </>
    ),
  },
  {
    label: 'Object storage access model',
    value: (
      <>
        <strong>In place:</strong> uploaded and generated files are catalogued in Neon and normally
        served through an authenticated same-origin file route scoped to the owning account and
        active workspace. Generated videos use a private R2 bucket. Images and other non-video files
        remain in a public R2 bucket.
        <br />
        <strong>Limit:</strong> a person who obtains the underlying public-bucket URL for an image
        or other non-video file can retrieve it without AGI authentication. Normal product responses
        do not return that raw URL, but this is not equivalent to private object storage. Customers
        who cannot accept that model should not upload affected files.
      </>
    ),
  },
  {
    label: 'Sandboxed execution',
    value: (
      <>
        <strong>In place:</strong> code execution runs in a managed third-party sandbox, isolated
        from AGI infrastructure.
        <br />
        <strong>Limit:</strong> sandbox execution is gated behind an explicit operator flag and is
        off by default. When it is off, no code executes and no files are sent to the sandbox
        vendor.
      </>
    ),
  },
  {
    label: 'Telemetry minimisation',
    value: (
      <>
        <strong>In place:</strong> error monitoring is disabled unless the deployment is production
        with a DSN configured, sends no default personal data, and scrubs report content. Product
        analytics loads only after the visitor opts in, and the consent gate fails closed.
        <br />
        <strong>Limit:</strong> error reports retain a stable user identifier so a crash can be
        correlated to a session. They are not anonymous.
      </>
    ),
  },
  {
    label: 'Deletion',
    value: (
      <>
        <strong>In place:</strong> account deletion is scheduled 24 hours out and then performed by
        a daily job that removes user-scoped rows and the associated stored objects, and deletes the
        identity at the authentication provider.
        <br />
        <strong>Limit:</strong> vendor-side backup snapshots are governed by the vendors&rsquo; own
        retention configuration and are not separately purged by AGI. See section 09.
      </>
    ),
  },
  {
    label: 'Financial-record retention',
    value: (
      <>
        <strong>In place:</strong> a daily job enforces a written schedule over billing rows. Books
        of account (the credit ledger and the organisation usage ledger) are kept for the statutory
        record-keeping period and then deleted, with the request-shaped metadata beside them emptied
        earlier. Metering events, completed settlement jobs, double-charge protection keys and
        payment-webhook receipts each carry their own shorter maximum age. The windows are published
        in section 05 of the privacy policy.
        <br />
        <strong>Limit:</strong> two rows carry no maximum age by design: the current plan row and
        the current credit balance, because ageing them out would cancel a live subscription or
        delete purchased credits. Both are erased with the account. Invoices and payment records
        held by the payment processor are governed by its retention, not AGI&rsquo;s.
      </>
    ),
  },
  {
    label: 'Personnel and change management',
    value: (
      <>
        <strong>In place:</strong> changes pass repository guardrails, type checks, lint and focused
        tests, plus dependency and vulnerability scanning, before release.
        <br />
        <strong>Limit:</strong> AGI holds no SOC 2, ISO 27001 or comparable third-party attestation.
        See /trust for the dated compliance status.
      </>
    ),
  },
];

const DPDP_TERMS: readonly LedgerRow[] = [
  {
    label: 'Controller',
    value: (
      <>
        <strong>DPDP Act term:</strong> Data Fiduciary
        <br />
        <strong>What changes:</strong> the same decision-making test. The Act places substantially
        all compliance duty here, including for processing carried out by an engaged Data Processor.
      </>
    ),
  },
  {
    label: 'Processor',
    value: (
      <>
        <strong>DPDP Act term:</strong> Data Processor
        <br />
        <strong>What changes:</strong> the Act&rsquo;s structural requirement is that the engagement
        is under a valid contract (s. 8(2)). This DPA is that contract for Managed Cloud. The Act
        gives a Data Processor no direct duty toward the Board.
      </>
    ),
  },
  {
    label: 'Data subject',
    value: (
      <>
        <strong>DPDP Act term:</strong> Data Principal
        <br />
        <strong>What changes:</strong> rights are exercised against the Data Fiduciary. For a child,
        the Data Principal includes the parent or lawful guardian.
      </>
    ),
  },
  {
    label: 'Personal data, processing',
    value: (
      <>
        <strong>DPDP Act term:</strong> the same words, digital only
        <br />
        <strong>What changes:</strong> the Act covers digital personal data and personal data
        digitised after collection. It has no special-category regime, so Annex I&rsquo;s bar on
        special-category data stands as a contractual term rather than a statutory echo.
      </>
    ),
  },
];

const DPDP_DUTIES: readonly LedgerRow[] = [
  {
    label: 'Role, by boundary',
    value:
      'Local: AGI processes nothing, so no Data Fiduciary or Data Processor relationship arises. BYOK: the Customer is the Data Fiduciary; AGI is its Data Processor for account and settings data only, and the model provider is engaged on the Customer’s own contract. Managed Cloud: the Customer is the Data Fiduciary for the content its users submit and AGI is its Data Processor, with the vendors in Annex III engaged by AGI under obligations no less protective than these. AGI is Data Fiduciary in its own right for account administration, billing, security and audit logs and service telemetry, and for its direct consumer users.',
  },
  {
    label: 'Notice and consent (ss. 5–6)',
    value:
      'Giving the itemised notice and obtaining consent by clear affirmative action, per purpose, is the Data Fiduciary’s duty: for enterprise use, the Customer’s duty toward its own users. AGI does not collect consent from the Customer’s users on the Customer’s behalf and is not registered as a Consent Manager under s. 6(7). AGI runs its own per-purpose consent record for the processing it is Data Fiduciary for.',
  },
  {
    label: 'Erasure on withdrawal or purpose end (s. 8(7))',
    value:
      'AGI erases on the Customer’s instruction and on account deletion, by the mechanism and on the timetable in section 09, and imposes the same obligation on its sub-processors. The vendor-snapshot limit stated in section 09 applies here unchanged; it is not restated as narrower than it is.',
  },
  {
    label: 'Data Principal rights (ss. 11–14)',
    value:
      'Access, correction, erasure, grievance redressal and nomination are exercised against the Data Fiduciary. Where a Data Principal contacts AGI about Customer data, AGI refers them to the Customer and assists in responding. Nomination has no field in the product; a nomination sent to the grievance contact is recorded against an account by hand.',
  },
  {
    label: 'Breach intimation (s. 8(6))',
    value:
      'Section 10 of this DPA. The duty to intimate the Board and every affected Data Principal sits on the Data Fiduciary: AGI notifies the Customer so the Customer can perform it, delivers the notice through AGI-controlled surfaces on the Customer’s written instruction, and performs it directly for the data AGI is Data Fiduciary for.',
  },
  {
    label: 'Transfer outside India (s. 16)',
    value:
      'Personal data is processed and stored in the United States, and AGI offers no Indian data residency. The Act permits transfer except to territories the Central Government restricts by notification; whether any notification affects the United States is a question of the live list on the date you read this, and this DPA does not answer it for you.',
  },
  {
    label: 'Significant Data Fiduciary (s. 10)',
    value:
      'AGI has not been notified as a Significant Data Fiduciary. It has not appointed an India-resident Data Protection Officer, and it does not run the independent data audits or data protection impact assessments the Act requires of one. If the Customer’s own position depends on those controls existing at its processor, they do not exist here today.',
  },
  {
    label: 'Children (s. 9)',
    value:
      'AGI performs no age verification and no verifiable parental consent. Accounts are for adults, and the Terms of Service permit 13- to 17-year-olds only under an account opened and supervised by a parent, guardian or school. This is named as a gap against the Act rather than implied away.',
  },
];

const BOUNDARY_LEDGER: readonly LedgerRow[] = [
  {
    label: 'Local',
    value: (
      <>
        <strong>What happens technically:</strong> conversations run on the user&rsquo;s device
        against a local model runtime and are stored on that device. Nothing is transmitted to AGI,
        and nothing is silently routed to BYOK or Managed Cloud.
        <br />
        <strong>Role allocation:</strong> AGI processes no personal data. No controller/processor
        relationship arises and this DPA has nothing to operate on. The Customer remains the
        controller of data on its own devices.
      </>
    ),
  },
  {
    label: 'BYOK',
    value: (
      <>
        <strong>What happens technically:</strong> the request goes from the user&rsquo;s client
        directly to the model provider using the Customer&rsquo;s own API key. AGI does not sit in
        that path.
        <br />
        <strong>Role allocation:</strong> the Customer is the controller and the model provider is
        the Customer&rsquo;s processor, on the Customer&rsquo;s own contract with that provider. AGI
        is not a processor of that prompt content and the provider is not an AGI sub-processor for
        it. AGI remains processor for the account and settings data it stores.
      </>
    ),
  },
  {
    label: 'Managed Cloud',
    value: (
      <>
        <strong>What happens technically:</strong> requests route through AGI&rsquo;s gateway to the
        provider serving the selected model. Conversations, files, projects, memories and schedules
        are stored by AGI.
        <br />
        <strong>Role allocation:</strong> the Customer is the controller and AGI is the processor.
        The model providers, sandbox runtime and infrastructure vendors listed in Annex III are
        AGI&rsquo;s sub-processors.
      </>
    ),
  },
];

const TRANSFER_LEDGER: readonly LedgerRow[] = [
  {
    label: 'EEA',
    value: (
      <>
        The European Commission Standard Contractual Clauses (Decision 2021/914),{' '}
        <strong>Module Two (controller to processor)</strong>, are incorporated by reference. Clause
        7 (docking) applies; Clause 9 option 2 (general written authorisation) applies with the
        30-day objection period in section 05; Clause 11 does not include the independent dispute
        resolution option; Clause 17 selects the law of Ireland; Clause 18(b) selects the courts of
        Ireland. Annex I is section 07 of this page, Annex II is section 08, and Annex III is
        /subprocessors.
      </>
    ),
  },
  {
    label: 'United Kingdom',
    value:
      'The UK International Data Transfer Addendum (version B1.0) to the SCCs applies. Tables 1–3 are populated from sections 07 and 08 and /subprocessors; in Table 4, neither party may end the Addendum as set out in Section 19.',
  },
  {
    label: 'Switzerland',
    value:
      'The SCCs apply with the Swiss adaptations: references to the GDPR are read as references to the FADP, the Federal Data Protection and Information Commissioner is the competent authority, and the clauses also protect the data of legal entities until the FADP no longer provides for it.',
  },
  {
    label: 'California',
    value:
      'AGI is a "service provider" under the CCPA. It processes personal information only to perform the services, does not sell or share it, does not retain, use or disclose it outside the direct business relationship or for any purpose other than those specified, and does not combine it with personal information from other sources except as the CCPA permits. AGI certifies that it understands and will comply with these restrictions.',
  },
];

const SECTIONS = [
  '01 · Parties, scope, and precedence',
  '02 · Definitions',
  '03 · Role allocation, by trust boundary',
  '04 · AGI’s obligations as processor',
  '05 · Sub-processors',
  '06 · International transfers',
  '07 · Annex I: processing details',
  '08 · Annex II: technical and organisational measures',
  '09 · Deletion, return, and data-subject requests',
  '10 · Personal data breach',
  '11 · Audit',
  '12 · Alpha status, liability, and term',
  '13 · Annex IV: India (DPDP Act, 2023)',
  '14 · Signature',
] as const;

export default function DpaPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-dpa-title"
          eyebrow="Legal"
          title="Data Processing Addendum."
          lede={
            <>
              The full text, published so you can read it before you ask for a signature.{' '}
              <strong>
                This addendum applies to AGI Managed Cloud. It does not apply to Local mode, where
                AGI processes nothing, and it does not make AGI a processor of your prompt content
                under BYOK, where you contract the model provider directly.
              </strong>{' '}
              Last updated: {POLICY_LAST_UPDATED.dpa}. Managed Cloud is in public alpha.
            </>
          }
          ctas={[]}
        />

        <Container>
          <div className="agi-ds-sticky-scene">
            <div className="agi-ds-sticky-pane">
              <PolicyContents
                sections={SECTIONS}
                intro="Annex II (section 08) states the limit of every security measure next to the measure. If you are reviewing this before signing, read that one first."
              />
            </div>
            <div className="agi-ds-sticky-flow">
              <Section id="s-01" labelledBy="agi-dpa-s01-title" rule>
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s01-title">
                    01 &middot; Parties, scope, and precedence
                  </h2>
                  <Prose>
                    This Data Processing Addendum (&ldquo;DPA&rdquo;) is entered into between{' '}
                    {LEGAL_ENTITY}, {LEGAL_ENTITY_DESCRIPTOR} (&ldquo;AGI&rdquo;), and the customer
                    entity that accepts the{' '}
                    <Link href="/terms" className="agi-ds-link">
                      Terms of Service
                    </Link>{' '}
                    (&ldquo;Customer&rdquo;). It forms part of those terms and applies where AGI
                    processes personal data on the Customer&rsquo;s behalf in connection with AGI
                    Managed Cloud.
                  </Prose>
                  <Prose>
                    In the event of a conflict, this DPA prevails over the Terms of Service on
                    matters of data protection. A negotiated master services agreement or order
                    form, once signed by both parties, prevails over both.
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-02" labelledBy="agi-dpa-s02-title" rule ground="2">
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s02-title">
                    02 &middot; Definitions
                  </h2>
                  <Prose>
                    &ldquo;Applicable Data Protection Law&rdquo; means the EU General Data
                    Protection Regulation 2016/679 (&ldquo;GDPR&rdquo;), the UK GDPR and Data
                    Protection Act 2018, the Swiss Federal Act on Data Protection, the California
                    Consumer Privacy Act as amended (&ldquo;CCPA&rdquo;), and India&rsquo;s Digital
                    Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;) together with the
                    rules made under it as and to the extent they are in force, each to the extent
                    it applies. &ldquo;Controller&rdquo;, &ldquo;processor&rdquo;, &ldquo;data
                    subject&rdquo;, &ldquo;personal data&rdquo; and &ldquo;processing&rdquo; carry
                    the meanings given in the GDPR. &ldquo;Customer Personal Data&rdquo; means
                    personal data contained in content the Customer or its users submit to Managed
                    Cloud. &ldquo;Sub-processor&rdquo; means a third party engaged by AGI to process
                    Customer Personal Data.
                  </Prose>
                  <Prose>
                    The DPDP Act does not use that vocabulary. Where it applies, &ldquo;Data
                    Fiduciary&rdquo; reads for controller, &ldquo;Data Processor&rdquo; for
                    processor and &ldquo;Data Principal&rdquo; for data subject, and the Act
                    allocates duties differently enough that a word swap is not a translation.{' '}
                    <strong>
                      Section 13 is the India annex and states the allocation in the Act&rsquo;s own
                      terms; where this DPA and that annex differ on processing subject to the DPDP
                      Act, the annex governs.
                    </strong>
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-03" labelledBy="agi-dpa-s03-title" rule>
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s03-title">
                    03 &middot; Role allocation, by trust boundary
                  </h2>
                  <Prose>
                    AGI runs across three separate trust boundaries. The controller/processor
                    relationship is not the same in all three, and stating one flat rule would be
                    inaccurate for two of them.
                  </Prose>
                  <Ledger caption="Role allocation by trust boundary" rows={BOUNDARY_LEDGER} />
                  <Prose size="sm">
                    Under the DPDP Act the same three rows read Data Fiduciary for controller and
                    Data Processor for processor, with one difference that matters: the Act puts
                    substantially all compliance duty on the Data Fiduciary, including for
                    processing carried out by its Data Processor, so a Customer subject to that Act
                    cannot discharge a duty by pointing at AGI. Section 13 sets that out row by row.
                  </Prose>
                  <Prose size="sm">
                    AGI is an independent controller for a narrow set of its own data: account
                    administration, billing records, security and audit logs, and service telemetry.
                    It processes those for its own legitimate interests in running and securing the
                    service, as described in the{' '}
                    <Link href="/privacy" className="agi-ds-link">
                      privacy policy
                    </Link>
                    .
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-04" labelledBy="agi-dpa-s04-title" rule ground="2">
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s04-title">
                    04 &middot; AGI&rsquo;s obligations as processor
                  </h2>
                  <Ledger
                    caption="AGI's obligations as processor"
                    rows={[
                      {
                        label: 'Documented instructions',
                        value:
                          'AGI processes Customer Personal Data only on the Customer’s documented instructions, which comprise the Terms of Service, this DPA, and the Customer’s use of the service’s features. AGI will tell the Customer if an instruction appears to infringe Applicable Data Protection Law. Where AGI is required by law to process beyond those instructions, it will inform the Customer first unless that law prohibits it.',
                      },
                      {
                        label: 'No training, no sale',
                        value:
                          'AGI does not train AGI-owned models on Customer Personal Data, does not sell it, and does not share it for cross-context behavioural advertising.',
                      },
                      {
                        label: 'Confidentiality',
                        value:
                          'Personnel authorised to process Customer Personal Data are bound by confidentiality obligations, and access is limited to those who need it to operate or support the service.',
                      },
                      {
                        label: 'Security',
                        value:
                          'AGI maintains the technical and organisational measures in Annex II. Because those measures include their own limits, the Customer should read Annex II before deciding what data to submit.',
                      },
                      {
                        label: 'Assistance',
                        value:
                          'AGI assists the Customer, taking into account the nature of processing and the information available to it, with data-subject requests, security obligations under Art. 32, breach notification under Arts. 33–34, and data protection impact assessments and prior consultation under Arts. 35–36.',
                      },
                    ]}
                  />
                </Stack>
              </Section>

              <Section id="s-05" labelledBy="agi-dpa-s05-title" rule>
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s05-title">
                    05 &middot; Sub-processors
                  </h2>
                  <Prose>
                    The Customer gives general written authorisation for AGI to engage
                    sub-processors. The current list, with each one&rsquo;s purpose and processing
                    region, is published at{' '}
                    <Link href="/subprocessors" className="agi-ds-link">
                      /subprocessors
                    </Link>{' '}
                    and forms Annex III to this DPA. AGI imposes data protection obligations on each
                    sub-processor no less protective than those in this DPA, and remains liable for
                    their performance.
                  </Prose>
                  <Prose>
                    <strong>Change notice.</strong> AGI publishes additions and replacements on{' '}
                    <Link href="/subprocessors" className="agi-ds-link">
                      /subprocessors
                    </Link>{' '}
                    and records the change on{' '}
                    <Link href="/changelog" className="agi-ds-link">
                      /changelog
                    </Link>
                    , which is the notice mechanism AGI can actually operate today: no mailing path
                    in the product can reach an arbitrary list of customers, so this DPA does not
                    promise emailed notice. The Customer may subscribe to the changelog feed to
                    receive changes. A Customer may object to a new sub-processor on reasonable data
                    protection grounds by writing to {CONTACT_EMAIL} within 30 days of publication;
                    if AGI cannot offer a reasonable alternative, the Customer may terminate the
                    affected subscription and receive a pro-rata refund of prepaid fees for the
                    unused term.
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-06" labelledBy="agi-dpa-s06-title" rule ground="2">
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s06-title">
                    06 &middot; International transfers
                  </h2>
                  <Prose>
                    AGI hosts data in the United States. It does not currently offer European or
                    United Kingdom data residency, so personal data of EU, UK and Swiss data
                    subjects is transferred to and processed in the United States.
                  </Prose>
                  <Ledger caption="Transfer mechanism by region" rows={TRANSFER_LEDGER} />
                  <Prose size="sm">
                    AGI has not appointed a representative under GDPR Art. 27. The current position
                    is stated at{' '}
                    <Link href="/legal/eu-representative" className="agi-ds-link">
                      /legal/eu-representative
                    </Link>{' '}
                    rather than left implied here.
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-07" labelledBy="agi-dpa-s07-title" rule>
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s07-title">
                    07 &middot; Annex I: processing details
                  </h2>
                  <Ledger caption="Annex I: processing details" rows={ANNEX_I} />
                  <Prose size="sm">
                    Competent supervisory authority for the purposes of the SCCs: the authority of
                    the member state in which the Customer&rsquo;s EU representative is established,
                    or where the Customer is not established in the EU, the authority of a member
                    state in which the data subjects are located.
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-08" labelledBy="agi-dpa-s08-title" rule ground="2">
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s08-title">
                    08 &middot; Annex II: technical and organisational measures
                  </h2>
                  <Prose>
                    Each measure is listed with its limit in the same row. A security annex that
                    omits its own limits is not usable in a security review, and the limits here are
                    the answers to the questions a reviewer would ask next.
                  </Prose>
                  <Ledger
                    caption="Annex II: technical and organisational measures"
                    rows={ANNEX_II}
                  />
                </Stack>
              </Section>

              <Section id="s-09" labelledBy="agi-dpa-s09-title" rule>
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s09-title">
                    09 &middot; Deletion, return, and data-subject requests
                  </h2>
                  <Prose>
                    <strong>Export.</strong> An authenticated user can export their data from the
                    account export endpoint at any time during the subscription, which satisfies the
                    return limb of SCC Clause 8.5 and GDPR Art. 20.
                  </Prose>
                  <Prose>
                    <strong>Deletion.</strong> An account deletion request records a deletion
                    timestamp and schedules erasure 24 hours later. A daily job then erases
                    user-scoped records and the stored objects belonging to that account and deletes
                    the identity at the authentication provider. No confirmation email is sent,
                    because the product has no account-lifecycle mailing path. Cancellation is
                    self-serve: a user who changes their mind can sign back in and cancel from
                    Settings &gt; Account any time within the 24-hour window.
                  </Prose>
                  <Prose>
                    <strong>Backups.</strong> Database and object-storage snapshots are governed by
                    the vendors&rsquo; own retention configuration. AGI does not operate a separate
                    process that reaches into vendor snapshots to remove individual records, and
                    does not claim one. Restored data is re-subjected to the same erasure on the
                    next scheduled run.
                  </Prose>
                  <Prose>
                    <strong>Data-subject requests.</strong> Where a data subject contacts AGI
                    directly, AGI refers them to the Customer unless the Customer instructs
                    otherwise, and assists the Customer in responding.
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-10" labelledBy="agi-dpa-s10-title" rule ground="2">
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s10-title">
                    10 &middot; Personal data breach
                  </h2>
                  <Prose>
                    AGI notifies the Customer without undue delay and in any event within 72 hours
                    of becoming aware of a personal data breach affecting Customer Personal Data,
                    using the account contact on file. The notification describes the nature of the
                    breach, the categories and approximate number of data subjects and records
                    affected so far as known, the likely consequences, the measures taken or
                    proposed, and a contact point for further information. Where the full picture is
                    not available within that window, AGI provides what it has and follows up in
                    phases. Notification is not an admission of fault.
                  </Prose>
                  <Prose>
                    <strong>Notification to the affected individuals.</strong> Where AGI is the
                    processor or Data Processor, the duty to notify individuals sits with the
                    Customer as controller or Data Fiduciary, and AGI does not notify the
                    Customer&rsquo;s users behind the Customer&rsquo;s back. Two commitments keep
                    that from being the place the obligation disappears. First, where the Customer
                    instructs AGI in writing to deliver the notice, AGI delivers it through the
                    surfaces AGI controls. Second, where AGI is itself the controller or Data
                    Fiduciary of the affected data (the account, billing, security-log and telemetry
                    records described in section 03, and its own direct users), AGI notifies each
                    affected individual directly, and where the DPDP Act applies also intimates the
                    Data Protection Board of India, without waiting for its investigation to
                    conclude and without sequencing the individual notice behind the regulator one.
                    The DPDP Act carries no low-risk exception and does not let a public notice
                    stand in for individual intimation where the individuals are identifiable.
                  </Prose>
                  <Prose>
                    <strong>How that notice is delivered, honestly.</strong> The product sends
                    support-escalation and scheduled-task email, and nothing in it can mail an
                    arbitrary list of affected users. A notice to individuals is therefore delivered
                    in-product on next sign-in and as a dated public notice at a stable URL, with
                    direct email only where an address is held and someone sends it. That is a limit
                    of the product today, published here so no incident response is planned around a
                    broadcast that does not exist.
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-11" labelledBy="agi-dpa-s11-title" rule>
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s11-title">
                    11 &middot; Audit
                  </h2>
                  <Prose>
                    AGI makes available the information necessary to demonstrate compliance with
                    this DPA. In practice that means written responses to a security questionnaire
                    and the published material on{' '}
                    <Link href="/security" className="agi-ds-link">
                      /security
                    </Link>{' '}
                    and{' '}
                    <Link href="/trust" className="agi-ds-link">
                      /trust
                    </Link>
                    , once per twelve months on reasonable notice.{' '}
                    <strong>
                      AGI holds no SOC 2 report, ISO 27001 certificate, or other third-party
                      attestation, so none can be provided in place of an audit.
                    </strong>{' '}
                    On-site inspection is available only where Applicable Data Protection Law
                    requires it, at the Customer&rsquo;s expense, on 30 days&rsquo; notice, under
                    confidentiality, and scoped so as not to compromise other customers&rsquo; data.
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-12" labelledBy="agi-dpa-s12-title" rule ground="2">
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s12-title">
                    12 &middot; Alpha status, liability, and term
                  </h2>
                  <Prose>
                    Managed Cloud is in public alpha. Its features, capacity and operational
                    controls change as it develops, and no service level agreement applies during
                    alpha. See{' '}
                    <Link href="/sla" className="agi-ds-link">
                      /sla
                    </Link>
                    . This does not reduce AGI&rsquo;s obligations as processor under this DPA or
                    under Applicable Data Protection Law, which are not conditioned on the release
                    stage.
                  </Prose>
                  <Prose>
                    Each party&rsquo;s liability under this DPA is subject to the limitations in the
                    Terms of Service, except that nothing limits liability that cannot be limited
                    under Applicable Data Protection Law, including a data subject&rsquo;s rights
                    under the SCCs. This DPA takes effect when the Customer accepts the Terms of
                    Service and continues for as long as AGI processes Customer Personal Data. It is
                    governed by {GOVERNING_LAW}, except where the SCCs or the UK Addendum select a
                    different governing law for the transfer obligations, in which case that
                    selection prevails for those obligations.
                  </Prose>
                </Stack>
              </Section>

              <Section id="s-13" labelledBy="agi-dpa-s13-title" rule>
                <div data-legal-review="pending-counsel">
                  <Stack gap="loose">
                    <h2 className="agi-ds-h2" id="agi-dpa-s13-title">
                      13 &middot; Annex IV: India (DPDP Act, 2023)
                    </h2>
                    <Prose>
                      This annex applies where AGI processes digital personal data in connection
                      with offering the service to Data Principals in India. It is written out
                      rather than folded into the GDPR text because the DPDP Act is not a
                      translation of the GDPR: it uses its own vocabulary, puts the consent and
                      breach-intimation duties in different places, and gives a Data Processor no
                      regulator-facing obligation to hand back to the Customer.{' '}
                      <strong>
                        This annex was drafted from the statute text and has not been reviewed by
                        Indian counsel. Counsel review is an open item, not a completed one, and
                        this page says so rather than letting a signature imply otherwise.
                      </strong>
                    </Prose>
                    <Ledger caption="GDPR to DPDP Act term mapping" rows={DPDP_TERMS} />
                    <Ledger caption="DPDP Act duties" rows={DPDP_DUTIES} />
                    <div className="agi-ds-card p-6">
                      <Stack gap="tight">
                        <h3 className="agi-ds-h3">{GRIEVANCE_OFFICER_NAME}</h3>
                        <Prose size="sm">
                          Grievance redressal under s. 13: email{' '}
                          <a
                            href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)}
                            className="agi-ds-link"
                          >
                            {CONTACT_EMAIL}
                          </a>{' '}
                          with the subject line &ldquo;{CONTACT_SUBJECTS.dpdpGrievance}&rdquo;, or
                          post to {LEGAL_ENTITY}, {NOTICE_ADDRESS}. We aim to respond within{' '}
                          {GRIEVANCE_RESPONSE_TARGET_DAYS} days, our commitment, not a statutory
                          deadline being quoted back to you. If our response does not resolve it, a
                          Data Principal may complain to the Data Protection Board of India.
                        </Prose>
                      </Stack>
                    </div>
                    <Prose size="sm">
                      The notice AGI gives its own Data Principals in India, including the consent
                      purposes and the retention schedule behind them, is at{' '}
                      <Link href={CANONICAL_POLICY_ROUTES.indiaPrivacy} className="agi-ds-link">
                        /privacy/india
                      </Link>
                      , and rights are exercised at{' '}
                      <Link href={CANONICAL_POLICY_ROUTES.dataRights} className="agi-ds-link">
                        /privacy/requests
                      </Link>
                      .
                    </Prose>
                  </Stack>
                </div>
              </Section>

              <Section id="s-14" labelledBy="agi-dpa-s14-title" rule ground="2">
                <Stack gap="loose">
                  <h2 className="agi-ds-h2" id="agi-dpa-s14-title">
                    14 &middot; Signature
                  </h2>
                  <Prose>
                    This DPA is effective without signature once the Terms of Service are accepted.
                    If your procurement process needs a countersigned copy, email{' '}
                    <a href={contactMailto(CONTACT_SUBJECTS.dpa)} className="agi-ds-link">
                      {CONTACT_EMAIL}
                    </a>{' '}
                    with the subject line &ldquo;{CONTACT_SUBJECTS.dpa}&rdquo; and your
                    entity&rsquo;s legal name, address and signatory. AGI returns a pre-signed copy
                    of this text for you to counter-sign.
                  </Prose>
                  <ButtonRow>
                    <Button href={contactMailto(CONTACT_SUBJECTS.dpa)} variant="primary">
                      Request a countersigned copy
                    </Button>
                    <Button href="/subprocessors" variant="secondary">
                      Annex III: subprocessors
                    </Button>
                    <Button href="/privacy" variant="secondary">
                      Privacy policy
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
