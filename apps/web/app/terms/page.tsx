import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { PolicyContents } from '@shared/components/legal/PolicyContents';
import {
  ARBITRATION_FORUM,
  CANONICAL_POLICY_ROUTES,
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  GOVERNING_LAW,
  GRIEVANCE_OFFICER_NAME,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  VENUE,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Terms of service',
  description:
    'Terms of service for AGI · eligibility, licence, your content, AI output, Managed Cloud alpha status, payment and auto-renewal, suspension, liability, and dispute resolution.',
  path: '/terms',
});

const SECTIONS = [
  '01 · Who these terms are with',
  '02 · Eligibility and age',
  '03 · Licence',
  '04 · Your account',
  '05 · Your content, and what we may do with it',
  '06 · Managed Cloud is in public alpha',
  '07 · Acceptable use',
  '08 · AI output: no reliance',
  '09 · Third-party services and connectors',
  '10 · Payment, taxes, and auto-renewal',
  '11 · Suspension',
  '12 · Termination and what happens to your data',
  '13 · Export control and sanctions',
  '14 · Intellectual property complaints',
  '15 · Warranty disclaimer and limitation of liability',
  '16 · Indemnification',
  '17 · Governing law, arbitration, and disputes',
  '18 · General',
  '19 · Data protection',
  '20 · Contact',
] as const;

export default function TermsPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />
        <section className="agi-page-hero">
          <h1 className="agi-page-h1">Terms of service.</h1>
          <p className="agi-page-lede">
            These terms govern your use of AGI.{' '}
            <strong>
              By installing the software or creating an account you accept them. Managed Cloud is in
              public alpha; section 06 says what that means for what you can rely on.
            </strong>{' '}
            Last updated: {POLICY_LAST_UPDATED.terms}.
          </p>
        </section>

        <PolicyContents
          sections={SECTIONS}
          intro="Sections 15 and 17 limit our liability and require arbitration. They are the ones to read before you accept, so they are named here rather than left to be found."
        />

        <section className="agi-section" id="s-01">
          <p className="agi-section-eyebrow">01 · Who these terms are with</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            These terms are an agreement between you (and, where you accept on behalf of an
            organisation, that organisation) and {LEGAL_ENTITY}, {LEGAL_ENTITY_DESCRIPTOR}. They
            incorporate the{' '}
            <Link href="/acceptable-use" style={{ color: 'var(--agi-ink)' }}>
              acceptable use policy
            </Link>
            , the{' '}
            <Link href="/privacy" style={{ color: 'var(--agi-ink)' }}>
              privacy policy
            </Link>
            , and &mdash; where AGI processes personal data on your behalf &mdash; the{' '}
            <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
              data processing addendum
            </Link>
            .
          </p>
        </section>

        <section className="agi-section" id="s-02">
          <p className="agi-section-eyebrow">02 · Eligibility and age</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            You must be at least 18 years old and able to form a binding contract to open an account
            in your own name. Users aged 13 to 17 may use AGI only through an account opened and
            supervised by a parent, guardian or their school, who accepts these terms on their
            behalf and is responsible for their use. AGI is not offered to children under 13, and in
            jurisdictions setting a higher digital-consent age &mdash; including the European Union
            and the United Kingdom, where it may be 16, and India, where processing children&rsquo;s
            data requires verifiable parental consent &mdash; that higher threshold applies instead.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            If you accept these terms for an organisation, you represent that you are authorised to
            bind it. You must not use AGI if you are barred from doing so under the laws of your
            country or the United States.
          </p>
        </section>

        <section className="agi-section" id="s-03">
          <p className="agi-section-eyebrow">03 · Licence</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            {LEGAL_ENTITY} grants you a non-exclusive, non-transferable, revocable licence to
            install and use AGI on devices you own or control, and to access the hosted service,
            subject to these terms. The software and the service are proprietary; you may not
            redistribute, sublicense, decompile, or reverse-engineer them except as applicable law
            expressly permits. All rights not granted are reserved.
          </p>
        </section>

        <section className="agi-section" id="s-04">
          <p className="agi-section-eyebrow">04 · Your account</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            You are responsible for keeping your account credentials and your master password
            secure, and for the activity that occurs through your account. We cannot recover the
            master password used to encrypt your local key vault &mdash; see the{' '}
            <Link href="/byok" style={{ color: 'var(--agi-ink)' }}>
              BYOK posture
            </Link>
            . Tell us promptly if you believe your account has been compromised.
          </p>
        </section>

        <section className="agi-section" id="s-05">
          <p className="agi-section-eyebrow">05 · Your content, and what we may do with it</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            <strong>You own your content.</strong> Prompts, files, projects, code and other material
            you submit remain yours, as does the output generated for you, to the extent it is
            capable of ownership. You grant {LEGAL_ENTITY} a worldwide, non-exclusive, royalty-free
            licence to host, store, transmit, display and process that content{' '}
            <em>solely to operate the service for you</em> &mdash; including transmitting prompt
            content to the model provider serving the model you select. That licence ends when the
            content is deleted, subject to the deletion mechanics in section 12.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            We do not train AGI-owned models on your content. You are responsible for having the
            rights to what you submit and for not submitting content you are contractually or
            legally barred from disclosing.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Managed Cloud providers.</strong> To provide inference, we send prompts and
            attached content to the provider serving the model you select and receive its response;
            for routed models, the request passes through OpenRouter. Those third parties handle
            that content under their applicable terms and data-use policies. Our statement that AGI
            does not train AGI-owned models is not a promise about a third party&rsquo;s handling.
            The current provider list is published at{' '}
            <Link href="/subprocessors" style={{ color: 'var(--agi-ink)' }}>
              /subprocessors
            </Link>
            .
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Feedback.</strong> If you send us suggestions or feedback, we may use them
            without restriction or obligation to you. You are not required to send feedback.
          </p>
        </section>

        <section className="agi-section" id="s-06">
          <p className="agi-section-eyebrow">06 · Managed Cloud is in public alpha</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI Managed Cloud is offered as a <strong>public alpha</strong>. It is open by default,
            but it may change, break, lose features, or be discontinued, and capacity and model
            availability may vary. No service level agreement applies to it during alpha; the
            targets published at{' '}
            <Link href="/sla" style={{ color: 'var(--agi-ink)' }}>
              /sla
            </Link>{' '}
            are stated intentions for general availability, not commitments you can enforce today.
            Do not build a production dependency on Managed Cloud without accepting that. Local and
            BYOK modes run on your own device and your own provider account respectively, and are
            not affected by this section.
          </p>
        </section>

        <section className="agi-section" id="s-07">
          <p className="agi-section-eyebrow">07 · Acceptable use</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI can execute code, act on accounts you connect, and run unattended on a schedule. The{' '}
            <Link href="/acceptable-use" style={{ color: 'var(--agi-ink)' }}>
              acceptable use policy
            </Link>{' '}
            sets out what you must not do with those capabilities, what your obligations are when
            the agent acts on your behalf, and what we do about violations. It is part of these
            terms and breaching it is a breach of this agreement.
          </p>
        </section>

        <section className="agi-section" id="s-08">
          <p className="agi-section-eyebrow">08 · AI output: no reliance</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            AGI produces output using machine-learning models. That output{' '}
            <strong>can be inaccurate, incomplete, outdated, or entirely fabricated</strong>,
            including code, citations, figures, and statements about the world. It is not
            professional advice. Do not rely on it for legal, medical, financial, safety-critical,
            or other consequential decisions without independent verification by a qualified human.
            Similar prompts may produce different output for different users, and output is not
            guaranteed to be unique to you. You are responsible for reviewing output before you act
            on it or ship it.
          </p>
        </section>

        <section className="agi-section" id="s-09">
          <p className="agi-section-eyebrow">09 · Third-party services and connectors</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            When you connect a third-party account, you authorise AGI to act with the permissions
            you grant. Your use of that third party remains governed by your agreement with them,
            and they may suspend or revoke your access independently of us. We are not responsible
            for a third-party service&rsquo;s availability, accuracy, security, or changes to its
            interfaces.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>BYOK.</strong> When you bring your own API key for a provider such as Anthropic,
            OpenAI or Google, your use of that provider is governed by <em>their</em> terms, not
            ours. Provider billing and data handling are between you and them; AGI does not process
            those payments and does not sit in the request path.
          </p>
        </section>

        <section className="agi-section" id="s-10">
          <p className="agi-section-eyebrow">10 · Payment, taxes, and auto-renewal</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Paid subscriptions are billed in advance through Stripe, our payment processor, or the
            applicable app store, at the price and billing period shown at{' '}
            <Link href="/pricing" style={{ color: 'var(--agi-ink)' }}>
              /pricing
            </Link>{' '}
            or in your order form when you subscribe. <strong>Auto-renewal:</strong> subscriptions
            renew automatically at the end of each billing period until you cancel. Cancelling stops
            the next renewal; access continues through the period you have paid for, and the current
            period is not automatically refunded. Refund terms are at{' '}
            <Link href="/refund-policy" style={{ color: 'var(--agi-ink)' }}>
              /refund-policy
            </Link>
            .
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            Prices exclude taxes unless stated otherwise; you are responsible for applicable sales,
            use, VAT, GST and similar taxes, excluding taxes on our income. We may change pricing
            with 30 days&rsquo; notice posted on{' '}
            <Link href="/pricing" style={{ color: 'var(--agi-ink)' }}>
              /pricing
            </Link>{' '}
            and{' '}
            <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
              /changelog
            </Link>
            ; an existing annual subscription keeps its price through the end of its current term.
            Purchases made through an app store are also subject to that store&rsquo;s terms, and
            refunds for them are handled by the store.
          </p>
        </section>

        <section className="agi-section" id="s-11">
          <p className="agi-section-eyebrow">11 · Suspension</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            We may suspend or restrict your access where you breach the acceptable use policy, where
            payment fails and is not cured, where we are legally required to, or where continued
            access presents a security risk to other customers or to the service. We give notice
            where it is reasonable to do so, and we act with the narrowest measure that addresses
            the problem. Suspended accounts may appeal &mdash; the route is in section 05 of the{' '}
            <Link href="/acceptable-use" style={{ color: 'var(--agi-ink)' }}>
              acceptable use policy
            </Link>
            .
          </p>
        </section>

        <section className="agi-section" id="s-12">
          <p className="agi-section-eyebrow">12 · Termination and what happens to your data</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            You may terminate at any time by cancelling your subscription and deleting your account.
            We may terminate for material breach of these terms, with notice where reasonable.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            You can export your data at any time while your account is active. An account deletion
            request schedules permanent erasure 24 hours later; a daily job then removes your
            user-scoped records and stored files and deletes your identity at our authentication
            provider. No confirmation email is sent, because the product has no account-lifecycle
            mailing path, but cancellation is self-serve: sign back in and cancel from Settings &gt;
            Account any time within the 24-hour window. Sections that by their nature survive
            &mdash; licence restrictions, your content representations, intellectual property,
            disclaimers, limitation of liability, indemnification, governing law and disputes
            &mdash; survive termination.
          </p>
        </section>

        <section className="agi-section" id="s-13">
          <p className="agi-section-eyebrow">13 · Export control and sanctions</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            You must comply with United States export control and economic sanctions laws. You may
            not use AGI, or permit anyone to use it, if you are located in an embargoed territory,
            are a person on a restricted-party list, or would be exporting the software or service
            to such a territory or person. You must not use AGI in connection with any prohibited
            end use, including weapons of mass destruction.
          </p>
        </section>

        <section className="agi-section" id="s-14">
          <p className="agi-section-eyebrow">14 · Intellectual property complaints</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            If you believe content on our service infringes your copyright or other intellectual
            property rights, email{' '}
            <a
              href={contactMailto(CONTACT_SUBJECTS.ipComplaint)}
              style={{ color: 'var(--agi-ink)' }}
            >
              {CONTACT_EMAIL}
            </a>{' '}
            with the subject line &ldquo;{CONTACT_SUBJECTS.ipComplaint}&rdquo;. Include
            identification of the work, the material you say infringes it and where it is, your
            contact details, a statement of good-faith belief that the use is unauthorised, a
            statement that your notice is accurate and that you are authorised to act, and your
            signature. We respond to complete notices, may remove the material, and may terminate
            repeat infringers. You may submit a counter-notice by the same route.
          </p>
        </section>

        <section className="agi-section" id="s-15">
          <p className="agi-section-eyebrow">
            15 · Warranty disclaimer and limitation of liability
          </p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            {/*
              Set in capitals deliberately. A disclaimer of implied warranties must
              be CONSPICUOUS to be effective (UCC 2-316 and its state analogues),
              and lowercase body text buried mid-paragraph is the standard example
              of what fails that test. This is the one place in the document where
              shouting is the legally correct choice.
            */}
            <strong>Warranty disclaimer:</strong> AGI IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
            AVAILABLE&rdquo; WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. WE DISCLAIM ALL
            IMPLIED WARRANTIES INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
            NON-INFRINGEMENT, AND ANY WARRANTY ARISING FROM COURSE OF DEALING OR TRADE USAGE, TO THE
            MAXIMUM EXTENT PERMITTED BY LAW. We do not warrant that the service will be
            uninterrupted, secure, or error-free, or that output will be accurate.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Limitation of liability:</strong> to the fullest extent permitted by law, our
            aggregate liability arising out of or relating to these terms or your use of AGI is
            limited to the fees you paid us in the 12 months preceding the claim, or 100 USD,
            whichever is greater. We are not liable for loss of profits, revenue, data, goodwill, or
            for indirect, incidental, special, consequential, or punitive damages, even if advised
            of the possibility. Nothing here excludes liability that cannot lawfully be excluded,
            including for death or personal injury caused by negligence, fraud, or fraudulent
            misrepresentation; where your jurisdiction does not allow certain exclusions, they do
            not apply to you.
          </p>
        </section>

        <section className="agi-section" id="s-16">
          <p className="agi-section-eyebrow">16 · Indemnification</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            You agree to indemnify, defend, and hold harmless {LEGAL_ENTITY}, its officers,
            employees, and agents from any claims, damages, or expenses (including reasonable
            attorneys&rsquo; fees) arising from (a) your use or misuse of AGI, (b) content you
            submit through the service, (c) your violation of these terms, the acceptable use
            policy, or applicable law, or (d) your infringement of any third-party right. We may
            assume the exclusive defence of any matter for which you owe us indemnification, and you
            will cooperate with it.
          </p>
        </section>

        <section className="agi-section" id="s-17">
          <p className="agi-section-eyebrow">17 · Governing law, arbitration, and disputes</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            These terms are governed by the laws of {GOVERNING_LAW}, without regard to
            conflict-of-laws principles, except that the{' '}
            <Link href="/dpa" style={{ color: 'var(--agi-ink)' }}>
              data processing addendum
            </Link>{' '}
            may select a different governing law for cross-border transfer obligations, and that
            selection prevails for those obligations.
          </p>
          <p className="agi-page-lede" style={{ marginTop: 16 }}>
            <strong>Arbitration:</strong> any dispute arising out of or relating to these terms or
            your use of AGI will be resolved by binding individual arbitration administered by{' '}
            {ARBITRATION_FORUM}, seated in {VENUE}. You waive any right to a jury trial or to
            participate in a class action. You may opt out of arbitration within 30 days of first
            accepting these terms by emailing{' '}
            <a
              href={contactMailto(CONTACT_SUBJECTS.arbitrationOptOut)}
              style={{ color: 'var(--agi-ink)' }}
            >
              {CONTACT_EMAIL}
            </a>{' '}
            with the subject line &ldquo;{CONTACT_SUBJECTS.arbitrationOptOut}&rdquo;; opting out
            does not affect any other part of these terms. If arbitration is unavailable or the
            waiver is held unenforceable, disputes will be resolved in the state or federal courts
            located in {VENUE}, and both parties consent to that jurisdiction. Nothing prevents
            either party from seeking injunctive relief for infringement or misuse of intellectual
            property, or from bringing an individual claim in small-claims court.
          </p>
        </section>

        <section className="agi-section" id="s-18">
          <p className="agi-section-eyebrow">18 · General</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td style={{ width: '26%', verticalAlign: 'top' }}>Order of precedence</td>
                <td>
                  A master services agreement or order form signed by both parties prevails over
                  these terms for the customer it covers. Otherwise these terms prevail, except that
                  the DPA prevails on data protection matters. Terms in a purchase order or vendor
                  portal that we have not signed have no effect.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Changes</td>
                <td>
                  We may update these terms. The current version is always at this URL with a
                  revision date, and material changes are recorded on{' '}
                  <Link href="/changelog" style={{ color: 'var(--agi-ink)' }}>
                    /changelog
                  </Link>
                  . No mailing path in this product can reach an arbitrary list of customers, so we
                  do not promise emailed notice. Continued use after a revision means you accept it;
                  if you do not, stop using the service and cancel.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Notices</td>
                <td>
                  Notices to you are given in the product or posted at this URL. Notices to us must
                  be sent to {CONTACT_EMAIL} and, where a signed agreement requires written notice,
                  also to {LEGAL_ENTITY}, {NOTICE_ADDRESS}.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Assignment</td>
                <td>
                  You may not assign these terms without our written consent. We may assign them to
                  an affiliate or in connection with a merger, acquisition, or sale of assets.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Force majeure</td>
                <td>
                  Neither party is liable for failure to perform caused by events beyond its
                  reasonable control, excluding payment obligations.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Severability and waiver</td>
                <td>
                  If a provision is unenforceable, it is limited to the minimum extent necessary and
                  the rest remains in force. Failure to enforce a provision is not a waiver of it.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Entire agreement</td>
                <td>
                  These terms, together with the acceptable use policy, privacy policy and DPA, are
                  the entire agreement between us about AGI and supersede prior discussions. Neither
                  party relies on any statement not set out in them.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>No third-party beneficiaries</td>
                <td>Nobody other than the parties may enforce these terms.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-section" id="s-19">
          <p className="agi-section-eyebrow">19 · Data protection</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            Our processing of personal data is governed by the{' '}
            <Link href={CANONICAL_POLICY_ROUTES.privacy} style={{ color: 'var(--agi-ink)' }}>
              privacy policy
            </Link>
            , which forms part of these terms. Where you contract with us as a business customer and
            we process personal data on your behalf, the{' '}
            <Link href={CANONICAL_POLICY_ROUTES.dpa} style={{ color: 'var(--agi-ink)' }}>
              DPA
            </Link>{' '}
            applies and prevails over these terms on data protection matters.
          </p>
          <table className="agi-ledger" style={{ marginTop: 16 }}>
            <tbody>
              <tr>
                <td style={{ width: '26%', verticalAlign: 'top' }}>Data principals in India</td>
                <td>
                  If India&rsquo;s Digital Personal Data Protection Act, 2023 applies to our
                  processing of your personal data, the notice at{' '}
                  <Link
                    href={CANONICAL_POLICY_ROUTES.indiaPrivacy}
                    style={{ color: 'var(--agi-ink)' }}
                  >
                    /privacy/india
                  </Link>{' '}
                  governs your rights, and it prevails over the general privacy policy where the two
                  differ. It states plainly which of those rights are self-serve today and which are
                  not.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Consent, and withdrawing it</td>
                <td>
                  Where we rely on your consent, we ask for it per purpose, we record the decision
                  against the revision of the notice you were shown, and you can withdraw any of it
                  at{' '}
                  <Link
                    href={CANONICAL_POLICY_ROUTES.dataRights}
                    style={{ color: 'var(--agi-ink)' }}
                  >
                    /privacy/requests
                  </Link>
                  . Withdrawing an optional consent never costs you access to anything you did not
                  withdraw. Withdrawal applies going forward and does not undo processing that
                  already lawfully happened.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Data you submit about other people</td>
                <td>
                  If you invite a colleague, provision users from your directory, or upload content
                  containing someone else&rsquo;s personal data, you confirm you are entitled to
                  give it to us for that purpose &mdash; including having given any notice or
                  obtained any consent their law requires. We do not contact those individuals to
                  obtain it on your behalf, and nothing in the product does so today.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Security and breach</td>
                <td>
                  We maintain security safeguards described at{' '}
                  <Link href={CANONICAL_POLICY_ROUTES.security} style={{ color: 'var(--agi-ink)' }}>
                    /security
                  </Link>
                  , and we operate a written incident procedure with a 72-hour clock for regulator
                  notification where a law requires one. No safeguard is a guarantee, and we do not
                  claim one.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Where your data is processed</td>
                <td>
                  In the United States. We do not offer data residency in India or in the EU/UK, so
                  using the service means your personal data is transferred there. If residency is a
                  requirement for you, we do not meet it.
                </td>
              </tr>
              <tr>
                <td style={{ verticalAlign: 'top' }}>Complaints</td>
                <td>
                  Raise a data protection complaint with the {GRIEVANCE_OFFICER_NAME} by emailing{' '}
                  <a
                    href={contactMailto(CONTACT_SUBJECTS.dpdpGrievance)}
                    style={{ color: 'var(--agi-ink)' }}
                  >
                    {CONTACT_EMAIL}
                  </a>{' '}
                  with the subject line &ldquo;{CONTACT_SUBJECTS.dpdpGrievance}&rdquo;. This route
                  is available to you regardless of the dispute-resolution and arbitration terms
                  above, which do not apply to it.
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="agi-section" id="s-20">
          <p className="agi-section-eyebrow">20 · Contact</p>
          <p className="agi-page-lede" style={{ marginTop: 0 }}>
            {LEGAL_ENTITY}, {NOTICE_ADDRESS}. Email{' '}
            <a href={contactMailto()} style={{ color: 'var(--agi-ink)' }}>
              {CONTACT_EMAIL}
            </a>{' '}
            with any question about these terms.
          </p>
          <div className="agi-cta-row" style={{ marginTop: 28 }}>
            <Link href="/acceptable-use" className="agi-cta-ghost">
              Acceptable use &rarr;
            </Link>
            <Link href="/privacy" className="agi-cta-ghost">
              Privacy &rarr;
            </Link>
            <Link href={CANONICAL_POLICY_ROUTES.indiaPrivacy} className="agi-cta-ghost">
              India &mdash; DPDP notice &rarr;
            </Link>
            <Link href="/dpa" className="agi-cta-ghost">
              DPA &rarr;
            </Link>
            <Link href="/refund-policy" className="agi-cta-ghost">
              Refunds &rarr;
            </Link>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
