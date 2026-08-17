import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
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
  title: 'Mobile Legal · Privacy Policy and Terms of Service',
  description:
    'Privacy policy and terms of service for AGI Mobile (iOS and Android), including Local and public-alpha Cloud modes.',
  path: '/mobile/legal',
});

/**
 * Legal copy is the last place a distribution claim should outrun the product.
 * The in-app-purchase clause below used to open "The App is free to download
 * and use." — a present-tense availability statement for an app with ZERO
 * `v-mobile-*` release tags and no App Store or Google Play listing. That is
 * the CRIT-007 class of claim (store availability asserted without a listing),
 * stated in the document a store reviewer reads first.
 *
 * So the clause branches on the same release-state registry `/download` and the
 * home hero already read. When mobile ships, flipping `SURFACE_STATUS.mobile`
 * off `COMING_SOON_LABEL` restores the download wording everywhere at once
 * instead of leaving this page behind.
 */
const MOBILE_UNRELEASED = SURFACE_STATUS.mobile === COMING_SOON_LABEL;

const EFFECTIVE_DATE = POLICY_LAST_UPDATED.mobile;
const COMPANY = LEGAL_ENTITY;
const COMPANY_STATE = LEGAL_ENTITY_DESCRIPTOR;

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
              silently routed to AGI Cloud. Cloud mode is open in public alpha and visibly labeled.
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
                  Local mode stores and processes on device. Cloud is open in public alpha and
                  subscription-backed.
                </td>
                <td>To run the AI assistant in the mode you selected.</td>
              </tr>
              {/*
                REMOVED 2026-08-14 — "Crash reports … Crash monitoring provider"
                and "Usage analytics … Analytics provider".
                Neither provider exists in this app. apps/mobile/package.json
                declares no crash SDK and no analytics SDK — no Sentry, no
                Crashlytics, no PostHog, Amplitude or Mixpanel. A telemetry queue
                exists at apps/mobile/storage/telemetry.ts, but nothing calls
                `enqueueTelemetryEvent` and nothing sends the queue, so no event
                is produced and none leaves the device.
                Declaring a recipient that receives nothing is the same class of
                defect as omitting one that does: it makes the table unreliable,
                and on a mobile legal page it is also an app-store declaration.
                The absence is stated below the table instead.
              */}
              <tr>
                <td>Account data</td>
                <td>
                  Email address and authentication token, if you create an account or join the Team
                  &amp; Enterprise early-access list.
                </td>
                <td>Managed database. US region. Encrypted at rest.</td>
                <td>
                  To run your account and manage early-access interest for higher-capacity plans.
                </td>
              </tr>
              {/*
                REMOVED 2026-08-14 — "HealthKit data (iOS only) — Step count,
                sleep, activity summary".
                HealthKit was taken out of the app in 93ca123df, and
                apps/mobile/__tests__/ios-store-submission-config.test.ts:60-63
                asserts the iOS privacy manifest carries no HealthKit claim. This
                page was still declaring collection of health data the app cannot
                collect and has no entitlement for — the worst direction to be
                wrong in on a sensitive category, and directly contradicted by
                the app's own test.
              */}
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

          <p
            style={{
              marginTop: 24,
              fontSize: 14,
              lineHeight: 1.7,
              color: 'var(--agi-ink-quiet)',
            }}
          >
            <strong style={{ color: 'var(--agi-ink)' }}>
              What this app does not collect, stated because the table above used to say otherwise.
            </strong>{' '}
            AGI Mobile ships <strong>no crash-reporting SDK and no analytics SDK</strong>. Until
            2026-08-14 this page declared both, along with health data. There is no crash-monitoring
            provider and no analytics provider in the app: a local event queue exists in the code,
            but nothing writes to it and nothing sends it, so no usage event is produced and none
            leaves your device. <strong>HealthKit is not used at all</strong> &mdash; the feature
            was removed from the app, the iOS privacy manifest carries no HealthKit declaration, and
            a test enforces that. If a future build adds any of these, this table gains a row in the
            same change.
          </p>

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
            <a href={contactMailto(CONTACT_SUBJECTS.privacy)} style={{ color: 'var(--agi-amber)' }}>
              {CONTACT_EMAIL}
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
            <a href={contactMailto(CONTACT_SUBJECTS.privacy)} style={{ color: 'var(--agi-amber)' }}>
              {CONTACT_EMAIL}
            </a>
            . AGI Automation LLC has not yet designated an EU representative under Art. 27 GDPR.
            Until it does, address privacy requests to AGI Automation LLC directly; the
            representative&rsquo;s details will be published at{' '}
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
            practices prohibited under Art. 5, including subliminal manipulation; biometric
            categorisation to infer protected or sensitive attributes; real-time remote biometric
            identification in public spaces; social scoring; emotion inference in workplace or
            educational settings; or predictive policing based solely on automated profiling.
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
            AGI Mobile is not intended for children. We do not knowingly collect personal data from
            children under 13 (US), under 16 (EU), or under 18 (India). If you believe a child has
            provided personal data, contact{' '}
            <a href={contactMailto(CONTACT_SUBJECTS.privacy)} style={{ color: 'var(--agi-amber)' }}>
              {CONTACT_EMAIL}
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
            <a href={contactMailto(CONTACT_SUBJECTS.privacy)} style={{ color: 'var(--agi-amber)' }}>
              {CONTACT_EMAIL}
            </a>
            . General support:{' '}
            <a href={contactMailto()} style={{ color: 'var(--agi-amber)' }}>
              {CONTACT_EMAIL}
            </a>
            . Mailing address: {COMPANY}, {NOTICE_ADDRESS}.
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
                {MOBILE_UNRELEASED
                  ? 'The App carries no purchase price. It is not published to the App Store or Google Play yet, so there is nothing to install today. '
                  : 'The App is free to download and use. '}
                Future in-app purchases for cloud features will be processed via Apple App Store or
                Google Play billing. All purchases are subject to the relevant store&rsquo;s refund
                policy. Subscription purchases are governed by StoreKit (iOS) or Google Play Billing
                (Android).
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
                The App may use system local runtimes, downloadable local models, or public-alpha
                Cloud providers depending on the mode and device. Use of third-party models is
                subject to the respective provider&rsquo;s terms. AGI Automation LLC is not
                responsible for the output of third-party models.
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Siri &amp; Shortcuts</span>
              <span className="agi-colophon-val">
                The App supports Siri voice phrases, Spotlight actions, and the Shortcuts app (e.g.
                &ldquo;Ask AGI&hellip;&rdquo;, &ldquo;Summarize with AGI&rdquo;). When you invoke
                the App this way, the spoken phrase is processed by Apple for speech recognition and
                may be used by Apple to improve its products, per Apple&rsquo;s own privacy
                practices. Any text, image, or audio you provide through a Siri/Shortcuts action is
                sent to
                {COMPANY} only to the extent necessary to carry out that request and improve the
                App&rsquo;s responsiveness to it — never for advertising or for training third-party
                models.
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
                {COMPANY} may update these terms. The current revision date is published at the top
                of this page. We do not promise an email or in-app notice until that delivery path
                exists. Continued use after a posted effective date constitutes acceptance to the
                extent permitted by law.
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
                <a href={contactMailto('Mobile legal')} style={{ color: 'var(--agi-amber)' }}>
                  {CONTACT_EMAIL}
                </a>
                . Support:{' '}
                <a href={contactMailto()} style={{ color: 'var(--agi-amber)' }}>
                  {CONTACT_EMAIL}
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
                <td>Product page and release-notification sign-up.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
