import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../../components/layout/Header';
import { MarketingFooter } from '../../../components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: 'Mobile Legal · Privacy Policy and Terms of Service',
  description:
    'Privacy policy and terms of service for AGI Mobile (iOS and Android), including Local and Cloud invite modes.',
  alternates: { canonical: 'https://agiworkforce.com/mobile/legal' },
};

const EFFECTIVE_DATE = '2026-07-12';
const COMPANY = 'AGI Automation LLC';
const COMPANY_STATE = 'a United States limited liability company';
const SUPPORT_EMAIL = 'support@agiworkforce.com';
const PRIVACY_EMAIL = 'privacy@agiworkforce.com';

export default function MobileLegalPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-page-hero">
          <p className="agi-section-eyebrow">Mobile · legal</p>
          <h1 className="agi-page-h1">Privacy policy and terms of service.</h1>
          <p className="agi-page-lede">
            Effective {EFFECTIVE_DATE}. Applies to AGI Mobile on iOS and Android.{' '}
            <strong>
              Local mode runs on your device. Cloud mode uses explicit labels and a separate trust
              boundary.
            </strong>
          </p>
          <div className="agi-cta-row" style={{ marginTop: 16 }}>
            <a href="#privacy" className="agi-cta-ghost">
              Privacy policy
            </a>
            <a href="#terms" className="agi-cta-ghost">
              Terms of service
            </a>
          </div>
        </section>

        {/* ---- PRIVACY POLICY ---- */}
        <section className="agi-section" id="privacy">
          <p className="agi-section-eyebrow">01 · Privacy policy</p>
          <h2 className="agi-section-h2">How AGI Mobile handles your data.</h2>
          <p style={{ color: 'var(--agi-ink-2)', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
            {COMPANY} ({COMPANY_STATE}) operates AGI Mobile. This policy describes what data the app
            collects, how it is processed, and your rights as a user. Where applicable, this policy
            references compliance with India&rsquo;s Digital Personal Data Protection Act 2023 (DPDP
            Act), the EU AI Act (Regulation EU 2024/1689), and the EU General Data Protection
            Regulation (GDPR).
          </p>

          <div className="agi-callout" style={{ marginBottom: 32 }}>
            <h3 className="agi-callout-h">
              <span className="agi-callout-amber">Core fact.</span> Mobile has Local and
              public-alpha Cloud modes.
            </h3>
            <p className="agi-callout-p">
              In Local mode, the AI model runs on your device or a local model route and is not
              silently routed to AGI Cloud. Cloud mode is invite-gated and visibly labeled.
            </p>
          </div>

          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Data category</th>
                <th>What we collect</th>
                <th>Where it goes</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Conversation content</td>
                <td>Text, images, voice input, documents you share in chat</td>
                <td>
                  Local mode stores and processes on device. Cloud is invite-gated and
                  subscription-backed.
                </td>
                <td>To run the AI assistant in the mode you selected.</td>
              </tr>
              <tr>
                <td>Crash reports</td>
                <td>
                  Stack traces, app version, device model, OS version, and diagnostic metadata.
                  Conversation content should not be included.
                </td>
                <td>Crash monitoring provider.</td>
                <td>To diagnose and fix bugs.</td>
              </tr>
              <tr>
                <td>Usage analytics</td>
                <td>
                  Feature usage events, if analytics are enabled. Text input and conversation
                  content should not be collected.
                </td>
                <td>Analytics provider.</td>
                <td>To understand which features are valuable when the user allows analytics.</td>
              </tr>
              <tr>
                <td>Account data</td>
                <td>
                  Email address and authentication token, if you create an account for the cloud
                  waitlist.
                </td>
                <td>Managed database. US region. Encrypted at rest.</td>
                <td>To manage your waitlist position for cloud features.</td>
              </tr>
              <tr>
                <td>HealthKit data (iOS only)</td>
                <td>
                  Step count, sleep, activity summary for the current week, if you grant HealthKit
                  permission.
                </td>
                <td>Processed on-device only. Never transmitted.</td>
                <td>To generate your weekly health recap on iOS.</td>
              </tr>
              <tr>
                <td>Biometric data</td>
                <td>
                  Face ID / fingerprint authentication result (pass or fail). The biometric template
                  never leaves the Secure Enclave.
                </td>
                <td>Secure Enclave only. Never transmitted.</td>
                <td>To protect access to the app.</td>
              </tr>
            </tbody>
          </table>

          <h3
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              marginTop: 40,
              marginBottom: 16,
            }}
          >
            AGI-owned models are not trained on customer conversations.
          </h3>
          <p style={{ color: 'var(--agi-ink-2)', fontSize: 15, lineHeight: 1.7 }}>
            {COMPANY} does not use your AGI Mobile conversation content to train AGI-owned models.
            We do not sell your conversation content.
          </p>

          <h3
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              marginTop: 32,
              marginBottom: 16,
            }}
          >
            DPDP Act 2023 (India)
          </h3>
          <p style={{ color: 'var(--agi-ink-2)', fontSize: 15, lineHeight: 1.7 }}>
            In Local mode, conversation inference runs on-device and is not processed by {COMPANY}{' '}
            for inference. Cloud mode may involve AGI processing according to the user-selected
            mode. Account data is processed with your consent for authentication, invite, and
            support workflows. You may request deletion at any time by emailing{' '}
            <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: 'var(--agi-amber)' }}>
              {PRIVACY_EMAIL}
            </a>
            .
          </p>

          <h3
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              marginTop: 32,
              marginBottom: 16,
            }}
          >
            GDPR (European Union / European Economic Area)
          </h3>
          <p style={{ color: 'var(--agi-ink-2)', fontSize: 15, lineHeight: 1.7 }}>
            Local-mode conversation inference is on-device. Cloud mode may involve AGI acting under
            the relevant controller/processor relationship and terms. Account data processed in
            connection with invite and authentication workflows falls under Art. 6(1)(b) GDPR
            (performance of a contract). You have the right of access, rectification, erasure,
            restriction, data portability, and objection. Exercise these rights by emailing{' '}
            <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: 'var(--agi-amber)' }}>
              {PRIVACY_EMAIL}
            </a>
            . An EU representative per Art. 27 GDPR will be appointed before the 2026-07-12 launch
            date; contact details will be published at{' '}
            <Link href="/legal/eu-representative" style={{ color: 'var(--agi-amber)' }}>
              agiworkforce.com/legal/eu-representative
            </Link>
            .
          </p>

          <h3
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              marginTop: 32,
              marginBottom: 16,
            }}
          >
            EU AI Act disclosures
          </h3>
          <p style={{ color: 'var(--agi-ink-2)', fontSize: 15, lineHeight: 1.7 }}>
            AGI Mobile is a general-purpose AI assistant. In compliance with Art. 50(1) of
            Regulation (EU) 2024/1689, the app discloses clearly within the conversation interface
            that responses are AI-generated. Conversation exports include a machine-readable marker
            and a human-readable disclosure block per Art. 50(2). AGI Mobile does not engage in
            practices prohibited under Art. 5, including subliminal manipulation, biometric
            categorisation, or social scoring.
          </p>

          <h3
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              marginTop: 32,
              marginBottom: 16,
            }}
          >
            Data retention
          </h3>
          <p style={{ color: 'var(--agi-ink-2)', fontSize: 15, lineHeight: 1.7 }}>
            Conversation data is stored locally on your device and is deleted when you uninstall the
            app or delete it from within the app. Diagnostic, analytics, and account retention
            periods are governed by the active production configuration and user deletion controls.
          </p>

          <h3
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              marginTop: 32,
              marginBottom: 16,
            }}
          >
            Children
          </h3>
          <p style={{ color: 'var(--agi-ink-2)', fontSize: 15, lineHeight: 1.7 }}>
            AGI Mobile is rated 4+ on the App Store and Teen on Google Play. We do not knowingly
            collect personal data from children under 13 (US), under 16 (EU), or under 18 (India).
            If you believe a child has provided personal data, contact{' '}
            <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: 'var(--agi-amber)' }}>
              {PRIVACY_EMAIL}
            </a>
            .
          </p>

          <h3
            style={{
              fontSize: 17,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              marginTop: 32,
              marginBottom: 16,
            }}
          >
            Contact
          </h3>
          <p style={{ color: 'var(--agi-ink-2)', fontSize: 15, lineHeight: 1.7 }}>
            Privacy questions:{' '}
            <a href={`mailto:${PRIVACY_EMAIL}`} style={{ color: 'var(--agi-amber)' }}>
              {PRIVACY_EMAIL}
            </a>
            . General support:{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--agi-amber)' }}>
              {SUPPORT_EMAIL}
            </a>
            . Mailing address: {COMPANY}, 1309 Coffeen Avenue STE 1200, Sheridan, Wyoming 82801,
            USA.
          </p>
        </section>

        {/* ---- TERMS OF SERVICE ---- */}
        <section className="agi-section" id="terms">
          <p className="agi-section-eyebrow">02 · Terms of service</p>
          <h2 className="agi-section-h2">Terms governing use of AGI Mobile.</h2>
          <p style={{ color: 'var(--agi-ink-2)', fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
            These terms are a legal agreement between you and {COMPANY} ({COMPANY_STATE}).
            &ldquo;App&rdquo; means AGI Mobile on iOS and Android. By installing or using the App,
            you agree to these terms. Effective date: {EFFECTIVE_DATE}.
          </p>

          <div className="agi-colophon">
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">License</span>
              <span className="agi-colophon-val">
                AGI Automation LLC grants you a limited, non-exclusive, non-transferable, revocable
                license to use the App for your personal or internal business purposes. This license
                does not transfer ownership. You may not copy, reverse-engineer, sublicense, or
                distribute the App.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Acceptable use</span>
              <span className="agi-colophon-val">
                You may not use the App to generate content that violates applicable law, promotes
                violence or hatred, or infringes third-party rights. You are responsible for all
                content you submit to the App and for your use of AI-generated output.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">AI output</span>
              <span className="agi-colophon-val">
                AI-generated content may be inaccurate, incomplete, or unsuitable for your use case.
                AGI Automation LLC does not warrant the accuracy of AI output. Do not rely on AI
                output for medical, legal, financial, or safety-critical decisions without
                independent verification.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">In-app purchases</span>
              <span className="agi-colophon-val">
                The App is free to download and use. Future in-app purchases for cloud features will
                be processed via Apple App Store or Google Play billing. All purchases are subject
                to the relevant store&rsquo;s refund policy. Subscription purchases are governed by
                StoreKit (iOS) or Google Play Billing (Android).
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Intellectual property</span>
              <span className="agi-colophon-val">
                The App and all associated content are proprietary to {COMPANY}. You own the content
                you create using the App. You grant {COMPANY} no license to your content.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Third-party models</span>
              <span className="agi-colophon-val">
                The App may use system local runtimes, downloadable local models, or invite-gated
                Cloud providers depending on the mode and device. Use of third-party models is
                subject to the respective provider&rsquo;s terms. AGI Automation LLC is not
                responsible for the output of third-party models.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Disclaimers</span>
              <span className="agi-colophon-val">
                The App is provided &ldquo;as is&rdquo; without warranty of any kind, express or
                implied. To the maximum extent permitted by law, {COMPANY} disclaims all warranties
                including merchantability, fitness for a particular purpose, and non-infringement.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Limitation of liability</span>
              <span className="agi-colophon-val">
                To the maximum extent permitted by law, {COMPANY}&rsquo;s liability to you for any
                claim arising from these terms or your use of the App is limited to the amount you
                paid to {COMPANY} in the 12 months preceding the claim, or USD 100, whichever is
                greater.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Governing law</span>
              <span className="agi-colophon-val">
                These terms are governed by the laws of the State of Texas, USA, without regard to
                conflict-of-law principles. Disputes shall be resolved in the state or federal
                courts of Texas, except where mandatory consumer protection laws in your
                jurisdiction require otherwise.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Changes</span>
              <span className="agi-colophon-val">
                {COMPANY} may update these terms. Material changes will be communicated via an
                in-app notice at least 14 days before taking effect. Continued use after the
                effective date constitutes acceptance.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Termination</span>
              <span className="agi-colophon-val">
                You may stop using the App at any time by uninstalling it. {COMPANY} may suspend or
                terminate your access for violation of these terms.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Contact</span>
              <span className="agi-colophon-val">
                Legal queries:{' '}
                <a href="mailto:legal@agiworkforce.com" style={{ color: 'var(--agi-amber)' }}>
                  legal@agiworkforce.com
                </a>
                . Support:{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--agi-amber)' }}>
                  {SUPPORT_EMAIL}
                </a>
                .
              </span>
            </div>
          </div>
        </section>

        <section className="agi-section">
          <p className="agi-section-eyebrow">Related documents</p>
          <table className="agi-ledger">
            <tbody>
              <tr>
                <td>
                  <Link href="/privacy" style={{ color: 'var(--agi-ink)', fontWeight: 600 }}>
                    Full privacy policy
                  </Link>
                </td>
                <td>Platform-wide privacy policy covering all surfaces.</td>
              </tr>
              <tr>
                <td>
                  <Link href="/terms" style={{ color: 'var(--agi-ink)', fontWeight: 600 }}>
                    Full terms of service
                  </Link>
                </td>
                <td>Platform-wide terms covering all surfaces.</td>
              </tr>
              <tr>
                <td>
                  <Link href="/dpa" style={{ color: 'var(--agi-ink)', fontWeight: 600 }}>
                    Data processing agreement
                  </Link>
                </td>
                <td>For business customers handling EU/UK personal data.</td>
              </tr>
              <tr>
                <td>
                  <Link href="/security" style={{ color: 'var(--agi-ink)', fontWeight: 600 }}>
                    Security
                  </Link>
                </td>
                <td>Encryption, sandboxing, and audit trail details.</td>
              </tr>
              <tr>
                <td>
                  <Link href="/mobile" style={{ color: 'var(--agi-ink)', fontWeight: 600 }}>
                    AGI Mobile
                  </Link>
                </td>
                <td>Product page with App Store and Google Play links.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
