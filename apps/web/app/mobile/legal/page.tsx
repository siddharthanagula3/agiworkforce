import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Ledger,
  Prose,
  Section,
  Stack,
  type LedgerRow,
} from '@/features/marketing/components/system';
import { PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { COMING_SOON_LABEL, SURFACE_STATUS } from '@/lib/marketing-constants';
import {
  CONTACT_EMAIL,
  CONTACT_SUBJECTS,
  LEGAL_ENTITY,
  LEGAL_ENTITY_DESCRIPTOR,
  NOTICE_ADDRESS,
  POLICY_LAST_UPDATED,
  contactMailto,
} from '@/lib/legal-constants';

export const metadata = buildMetadata({
  title: 'Mobile legal: privacy policy and terms of service',
  description:
    'Privacy policy and terms of service for AGI Mobile (iOS and Android), including Local and public-alpha Cloud modes.',
  path: '/mobile/legal',
});

const MOBILE_UNRELEASED = SURFACE_STATUS.mobile === COMING_SOON_LABEL;

const EFFECTIVE_DATE = POLICY_LAST_UPDATED.mobile;
const COMPANY = LEGAL_ENTITY;
const COMPANY_STATE = LEGAL_ENTITY_DESCRIPTOR;

const DATA_CATEGORIES: readonly LedgerRow[] = [
  {
    label: 'Conversation content',
    value: (
      <>
        Text, images, voice input, documents you share in chat. Local mode stores and processes on
        device. Cloud is open in public alpha and subscription-backed. Collected to run the AI
        assistant in the mode you selected.
      </>
    ),
  },
  {
    label: 'Account data',
    value: (
      <>
        Email address and authentication token, if you create an account or join the Team &amp;
        Enterprise early-access list. Held in a managed database, US region, encrypted at rest.
        Collected to run your account and manage early-access interest for higher-capacity plans.
      </>
    ),
  },
  {
    label: 'Biometric data',
    value: (
      <>
        Face ID / fingerprint authentication result (pass or fail). The biometric template never
        leaves the Secure Enclave and is never transmitted. Collected to protect access to the app.
      </>
    ),
  },
];

const TERMS: readonly LedgerRow[] = [
  {
    label: 'License',
    value:
      'AGI Automation LLC grants you a limited, non-exclusive, non-transferable, revocable license to use the App for your personal or internal business purposes. This license does not transfer ownership. You may not copy, reverse-engineer, sublicense, or distribute the App.',
  },
  {
    label: 'Acceptable use',
    value:
      'You may not use the App to generate content that violates applicable law, promotes violence or hatred, or infringes third-party rights. You are responsible for all content you submit to the App and for your use of AI-generated output.',
  },
  {
    label: 'AI output',
    value:
      'AI-generated content may be inaccurate, incomplete, or unsuitable for your use case. AGI Automation LLC does not warrant the accuracy of AI output. Do not rely on AI output for medical, legal, financial, or safety-critical decisions without independent verification.',
  },
  {
    label: 'In-app purchases',
    value: (
      <>
        {MOBILE_UNRELEASED
          ? 'The App carries no purchase price. It is not published to the App Store or Google Play yet, so there is nothing to install today. '
          : 'The App is free to download and use. '}
        Future in-app purchases for cloud features will be processed via Apple App Store or Google
        Play billing. All purchases are subject to the relevant store&rsquo;s refund policy.
        Subscription purchases are governed by StoreKit (iOS) or Google Play Billing (Android).
      </>
    ),
  },
  {
    label: 'Intellectual property',
    value: (
      <>
        The App and all associated content are proprietary to {COMPANY}. You own the content you
        create using the App. You grant {COMPANY} no license to your content.
      </>
    ),
  },
  {
    label: 'Third-party models',
    value:
      "The App may use system local runtimes, downloadable local models, or public-alpha Cloud providers depending on the mode and device. Use of third-party models is subject to the respective provider's terms. AGI Automation LLC is not responsible for the output of third-party models.",
  },
  {
    label: 'Siri and Shortcuts',
    value: (
      <>
        The App supports Siri voice phrases, Spotlight actions, and the Shortcuts app (for example,
        &ldquo;Ask AGI&hellip;&rdquo;, &ldquo;Summarize with AGI&rdquo;). When you invoke the App
        this way, the spoken phrase is processed by Apple for speech recognition and may be used by
        Apple to improve its products, per Apple&rsquo;s own privacy practices. Any text, image, or
        audio you provide through a Siri/Shortcuts action is sent to {COMPANY} only to the extent
        necessary to carry out that request and improve the App&rsquo;s responsiveness to it, never
        for advertising or for training third-party models.
      </>
    ),
  },
  {
    label: 'Disclaimers',
    value: (
      <>
        The App is provided &ldquo;as is&rdquo; without warranty of any kind, express or implied. To
        the maximum extent permitted by law, {COMPANY} disclaims all warranties including
        merchantability, fitness for a particular purpose, and non-infringement.
      </>
    ),
  },
  {
    label: 'Limitation of liability',
    value: (
      <>
        To the maximum extent permitted by law, {COMPANY}&rsquo;s liability to you for any claim
        arising from these terms or your use of the App is limited to the amount you paid to{' '}
        {COMPANY} in the 12 months preceding the claim, or USD 100, whichever is greater.
      </>
    ),
  },
  {
    label: 'Governing law',
    value:
      'These terms are governed by the laws of the State of Texas, USA, without regard to conflict-of-law principles. Disputes shall be resolved in the state or federal courts of Texas, except where mandatory consumer protection laws in your jurisdiction require otherwise.',
  },
  {
    label: 'Changes',
    value: (
      <>
        {COMPANY} may update these terms. The current revision date is published at the top of this
        page. We do not promise an email or in-app notice until that delivery path exists. Continued
        use after a posted effective date constitutes acceptance to the extent permitted by law.
      </>
    ),
  },
  {
    label: 'Termination',
    value: (
      <>
        You may stop using the App at any time by uninstalling it. {COMPANY} may suspend or
        terminate your access for violation of these terms.
      </>
    ),
  },
  {
    label: 'Contact',
    value: (
      <>
        Legal queries:{' '}
        <a href={contactMailto('Mobile legal')} className="agi-ds-link">
          {CONTACT_EMAIL}
        </a>
        . Support:{' '}
        <a href={contactMailto()} className="agi-ds-link">
          {CONTACT_EMAIL}
        </a>
        .
      </>
    ),
  },
];

const RELATED: readonly LedgerRow[] = [
  {
    label: 'Full privacy policy',
    value: (
      <>
        <Link href="/privacy" className="agi-ds-link">
          /privacy
        </Link>{' '}
        &middot; platform-wide privacy policy covering all surfaces.
      </>
    ),
  },
  {
    label: 'Full terms of service',
    value: (
      <>
        <Link href="/terms" className="agi-ds-link">
          /terms
        </Link>{' '}
        &middot; platform-wide terms covering all surfaces.
      </>
    ),
  },
  {
    label: 'Data processing agreement',
    value: (
      <>
        <Link href="/dpa" className="agi-ds-link">
          /dpa
        </Link>{' '}
        &middot; for business customers handling EU/UK personal data.
      </>
    ),
  },
  {
    label: 'Security',
    value: (
      <>
        <Link href="/security" className="agi-ds-link">
          /security
        </Link>{' '}
        &middot; encryption, sandboxing, and audit trail details.
      </>
    ),
  },
  {
    label: 'AGI Mobile',
    value: (
      <>
        <Link href="/mobile" className="agi-ds-link">
          /mobile
        </Link>{' '}
        &middot; product page and release-notification sign-up.
      </>
    ),
  },
];

export default function MobileLegalPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-mobile-legal-title"
          eyebrow="Mobile · legal"
          title="Privacy policy and terms of service."
          lede={
            <>
              Effective {EFFECTIVE_DATE}. Applies to AGI Mobile on iOS and Android.{' '}
              <strong>
                Local mode runs on your device. Cloud mode uses explicit labels and a separate trust
                boundary.
              </strong>
            </>
          }
          ctas={[
            { href: '#privacy', label: 'Privacy policy' },
            { href: '#terms', label: 'Terms of service', variant: 'secondary' },
          ]}
        />

        <Section id="privacy" labelledBy="agi-mobile-legal-privacy-title" rule>
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-mobile-legal-privacy-title">
                01 &middot; Privacy policy.
              </h2>
              <Prose>
                {COMPANY} ({COMPANY_STATE}) operates AGI Mobile. This policy describes what data the
                app collects, how it is processed, and your rights as a user. Where applicable, this
                policy references compliance with India&rsquo;s Digital Personal Data Protection Act
                2023 (DPDP Act), the EU AI Act (Regulation EU 2024/1689), and the EU General Data
                Protection Regulation (GDPR).
              </Prose>
            </div>

            <Stack gap="tight">
              <h3 className="agi-ds-h3">
                Core fact: mobile has local and public-alpha cloud modes.
              </h3>
              <Prose size="sm">
                In Local mode, the AI model runs on your device or a local model route and is not
                silently routed to AGI Cloud. Cloud mode is open in public alpha and visibly
                labeled.
              </Prose>
            </Stack>

            <Ledger caption="Data categories" rows={DATA_CATEGORIES} />

            <Prose size="sm">
              <strong>
                What this app does not collect, stated because the table above used to say
                otherwise.
              </strong>{' '}
              AGI Mobile ships <strong>no crash-reporting SDK and no analytics SDK</strong>. Until
              2026-08-14 this page declared both, along with health data. There is no
              crash-monitoring provider and no analytics provider in the app: a local event queue
              exists in the code, but nothing writes to it and nothing sends it, so no usage event
              is produced and none leaves your device. <strong>HealthKit is not used at all</strong>
              . The feature was removed from the app, the iOS privacy manifest carries no HealthKit
              declaration, and a test enforces that. If a future build adds any of these, this table
              gains a row in the same change.
            </Prose>

            <Stack gap="tight">
              <h3 className="agi-ds-h3">
                AGI-owned models are not trained on customer conversations.
              </h3>
              <Prose size="sm">
                {COMPANY} does not use your AGI Mobile conversation content to train AGI-owned
                models. We do not sell your conversation content.
              </Prose>
            </Stack>

            <Stack gap="tight">
              <h3 className="agi-ds-h3">DPDP Act 2023 (India).</h3>
              <Prose size="sm">
                In Local mode, conversation inference runs on-device and is not processed by{' '}
                {COMPANY} for inference. Cloud mode may involve AGI processing according to the
                user-selected mode. Account data is processed with your consent for authentication,
                invite, and support workflows. You may request deletion at any time by emailing{' '}
                <a href={contactMailto(CONTACT_SUBJECTS.privacy)} className="agi-ds-link">
                  {CONTACT_EMAIL}
                </a>
                .
              </Prose>
            </Stack>

            <Stack gap="tight">
              <h3 className="agi-ds-h3">GDPR (European Union / European Economic Area).</h3>
              <Prose size="sm">
                Local-mode conversation inference is on-device. Cloud mode may involve AGI acting
                under the relevant controller/processor relationship and terms. Account data
                processed in connection with invite and authentication workflows falls under Art.
                6(1)(b) GDPR (performance of a contract). You have the right of access,
                rectification, erasure, restriction, data portability, and objection. Exercise these
                rights by emailing{' '}
                <a href={contactMailto(CONTACT_SUBJECTS.privacy)} className="agi-ds-link">
                  {CONTACT_EMAIL}
                </a>
                . AGI Automation LLC has not yet designated an EU representative under Art. 27 GDPR.
                Until it does, address privacy requests to AGI Automation LLC directly; the
                representative&rsquo;s details will be published at{' '}
                <Link href="/legal/eu-representative" className="agi-ds-link">
                  agiworkforce.com/legal/eu-representative
                </Link>
                .
              </Prose>
            </Stack>

            <Stack gap="tight">
              <h3 className="agi-ds-h3">EU AI Act disclosures.</h3>
              <Prose size="sm">
                AGI Mobile is a general-purpose AI assistant. In compliance with Art. 50(1) of
                Regulation (EU) 2024/1689, the app discloses clearly within the conversation
                interface that responses are AI-generated. Conversation exports include a
                machine-readable marker and a human-readable disclosure block per Art. 50(2). AGI
                Mobile does not engage in practices prohibited under Art. 5, including subliminal
                manipulation; biometric categorisation to infer protected or sensitive attributes;
                real-time remote biometric identification in public spaces; social scoring; emotion
                inference in workplace or educational settings; or predictive policing based solely
                on automated profiling.
              </Prose>
            </Stack>

            <Stack gap="tight">
              <h3 className="agi-ds-h3">Data retention.</h3>
              <Prose size="sm">
                Conversation data is stored locally on your device and is deleted when you uninstall
                the app or delete it from within the app. Diagnostic, analytics, and account
                retention periods are governed by the active production configuration and user
                deletion controls.
              </Prose>
            </Stack>

            <Stack gap="tight">
              <h3 className="agi-ds-h3">Children.</h3>
              <Prose size="sm">
                AGI Mobile is not intended for children. We do not knowingly collect personal data
                from children under 13 (US), under 16 (EU), or under 18 (India). If you believe a
                child has provided personal data, contact{' '}
                <a href={contactMailto(CONTACT_SUBJECTS.privacy)} className="agi-ds-link">
                  {CONTACT_EMAIL}
                </a>
                .
              </Prose>
            </Stack>

            <Stack gap="tight">
              <h3 className="agi-ds-h3">Contact.</h3>
              <Prose size="sm">
                Privacy questions:{' '}
                <a href={contactMailto(CONTACT_SUBJECTS.privacy)} className="agi-ds-link">
                  {CONTACT_EMAIL}
                </a>
                . General support:{' '}
                <a href={contactMailto()} className="agi-ds-link">
                  {CONTACT_EMAIL}
                </a>
                . Mailing address: {COMPANY}, {NOTICE_ADDRESS}.
              </Prose>
            </Stack>
          </Stack>
        </Section>

        <Section id="terms" labelledBy="agi-mobile-legal-terms-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <h2 className="agi-ds-h2" id="agi-mobile-legal-terms-title">
                02 &middot; Terms of service.
              </h2>
              <Prose>
                These terms are a legal agreement between you and {COMPANY} ({COMPANY_STATE}).
                &ldquo;App&rdquo; means AGI Mobile on iOS and Android. By installing or using the
                App, you agree to these terms. Effective date: {EFFECTIVE_DATE}.
              </Prose>
            </div>
            <Ledger caption="Terms of service" rows={TERMS} />
          </Stack>
        </Section>

        <Section id="related" labelledBy="agi-mobile-legal-related-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-mobile-legal-related-title">
              Related documents.
            </h2>
            <Ledger caption="Related documents" rows={RELATED} />
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
