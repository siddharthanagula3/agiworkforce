import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { LAUNCH, MARKETING, POSITIONING } from '../../lib/marketing-constants';

// All user-visible copy is declared here so a translator can find every string
// in one place. Future Hindi translation = one object swap.
const COPY = {
  // Hero
  heroEyebrow: `iOS + Android, launching ${LAUNCH.isoDate}`,
  heroHeadline: 'AGI on your phone.',
  heroSubline: 'Free Local. Cloud by invite.',
  heroLede:
    'A ChatGPT and Claude-style mobile assistant where users can run small on-device local models or unlock AGI Cloud with an invite code.',
  heroChip_offline: 'Works offline',
  heroChip_ondevice: 'Local mode',
  heroChip_dpdp: 'Designed for DPDP 2023',
  heroChip_free: 'Free Local',
  heroWaitlistCta: LAUNCH.ctaLabel,
  heroWaitlistNote: POSITIONING.trustBoundary,

  // What's different
  diffEyebrow: 'What makes it different',
  diffCards: [
    {
      label: 'Local-only',
      headline: 'Your phone runs the AI.',
      body: 'In Local mode there is no model-provider call during inference. Works on a plane, in a basement, or anywhere network access is unreliable.',
    },
    {
      label: 'Mobile Cloud',
      headline: 'Hosted models wait for an invite.',
      body: 'Mobile Cloud requires invite access and subscription-backed account state. BYOK belongs to Desktop and developer surfaces, not Mobile v1.',
    },
    {
      label: 'Cloud invite',
      headline: 'Managed power when users ask for it.',
      body: 'Cloud is invite-only for hosted sync, managed tools, and higher-capacity workflows. Local chats do not silently move to BYOK or Cloud.',
    },
  ],

  // On-device AI section
  onDeviceEyebrow: 'Your phone already has AI',
  onDeviceHeadline: 'We gave it a front door.',
  onDeviceLede:
    'Modern phones ship with AI inference chips. Apple built one into the A17 Pro. Google built one into Tensor G4. AGI Mobile uses what is already there.',
  onDeviceIosLabel: 'On iPhone',
  onDeviceAndroidLabel: 'On Android',
  onDeviceIosRows: [
    ['Apple Foundation Models', 'iPhone 15 Pro and later, on-chip, ~4K context'],
    ['Qwen3-4B (executorch)', 'iPhone 12 and later, on-device, universal fallback'],
  ],
  onDeviceAndroidRows: [
    ['Gemini Nano (AICore)', 'Pixel 9+, Galaxy S26+, OnePlus 15+ with 12 GB RAM'],
    ['Gemma + LiteRT', "All Android devices with 4 GB+ RAM. Google's own path."],
    ['Qwen3-4B (universal)', 'Mid-range: Redmi Note 13, Vivo Y200, and similar'],
  ],
  onDeviceNote:
    'On Android, fewer than 5% of EU devices in active use qualify for Gemini Nano. AGI works on the other 95% via Gemma and Qwen3-4B.',

  // Feature grid
  featureEyebrow: 'Features in v1',
  featureHeadline: 'A full AI assistant. On your phone.',
  features: [
    { icon: '💬', label: 'Chat', body: 'Text conversation with persistent memory and context.' },
    { icon: '📷', label: 'Image Q&A', body: 'Take a photo. Ask anything about what you see.' },
    { icon: '🎙', label: 'Voice', body: 'Speak your question. Read the answer.' },
    { icon: '📄', label: 'OCR + Scan', body: 'Point at a document or sign. Extract and ask.' },
    { icon: '🌐', label: 'Translate', body: '60+ language pairs, on-device, no internet needed.' },
    { icon: '🧠', label: 'Memory', body: 'Remembers facts you tell it across conversations.' },
    { icon: '📁', label: 'Projects', body: 'Topic workspaces. Keep context separate.' },
    {
      icon: '⚡',
      label: 'Skills',
      body: `${MARKETING.skills.display} built-in skills across ${MARKETING.categories.display} categories.`,
    },
    { icon: '❤️', label: 'HealthKit', body: 'iOS: weekly activity recap in plain language.' },
    { icon: '🇮🇳', label: 'Hindi', body: 'Validated against a 60-prompt native-speaker suite.' },
  ],

  // Privacy section
  privacyEyebrow: 'Privacy',
  privacyHeadline: 'Two mobile modes. Clear trust boundaries.',
  privacyLede:
    'AGI Mobile does not blur Local and Cloud. Local stays on-device. Cloud requires an invite, subscription-backed account state, and an explicit provider label.',
  privacyPoints: [
    {
      label: 'Local mode',
      body: 'Local conversations run on the device using supported on-device or local model routes. They are not silently sent to AGI Cloud.',
    },
    {
      label: 'No Mobile BYOK',
      body: 'Mobile v1 does not accept provider keys. Use Desktop or developer surfaces for BYOK-local workflows.',
    },
    {
      label: 'Cloud mode',
      body: 'Managed Cloud is invite-gated for hosted sync and managed compute. It is separate from Local by design.',
    },
    {
      label: 'No silent route changes',
      body: 'Moving Local context into Cloud requires an explicit continuation, context selection, visible provider label, and user consent.',
    },
    {
      label: 'Telemetry controls',
      body: 'Crash reports and analytics are separated from conversation content. AI screens avoid session replay, and analytics defaults should remain user-controlled.',
    },
    {
      label: 'Compliance path',
      body: 'Mobile is designed around DPDP, GDPR, and EU AI Act disclosures. Formal verification remains part of launch readiness before public release.',
    },
  ],

  // Waitlist tease
  waitlistEyebrow: 'Cloud by invite',
  waitlistHeadline: 'Managed compute after demand is proven.',
  waitlistLede: `${MARKETING.providers.display} providers, synced chats, hosted tools, and managed compute become available with invite codes. Free Local creates the mobile demand signal first.`,
  waitlistCta: 'Request Cloud invite',

  // Footer section
  aboutCompany: 'AGI Automation LLC',
  aboutTagline: MARKETING.tagline,
} as const;

export const metadata: Metadata = {
  title: 'AGI Mobile: On-device AI for iOS and Android',
  description: `${POSITIONING.wedge} AGI Mobile launches July 12, 2026 for iOS and Android.`,
  alternates: { canonical: 'https://agiworkforce.com/mobile' },
  openGraph: {
    title: 'AGI Mobile: On-device AI for iOS and Android',
    description: `${POSITIONING.wedge} AGI Mobile launches July 12, 2026 for iOS and Android.`,
    type: 'website',
    url: 'https://agiworkforce.com/mobile',
    images: [{ url: '/mobile-preview.png', width: 1200, height: 630, alt: 'AGI Mobile' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Mobile: On-device AI for iOS and Android',
    description: `${POSITIONING.wedge} ${LAUNCH.publicLabel}.`,
    images: ['/mobile-preview.png'],
  },
};

// Trust chip component (inline — no new files needed for a simple chip)
function TrustChip({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '5px 12px',
        borderRadius: 100,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule-strong)',
        color: 'var(--agi-ink-2)',
      }}
    >
      {label}
    </span>
  );
}

export default function MobilePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        {/* ---- 1. HERO ---- */}
        <section className="agi-hero" style={{ paddingBottom: 64 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--agi-amber)',
              marginBottom: 16,
            }}
          >
            {COPY.heroEyebrow}
          </p>
          <h1 className="agi-h1">
            <span className="agi-h1-line">{COPY.heroHeadline}</span>
            <span className="agi-h1-line agi-h1-line--quiet">{COPY.heroSubline}</span>
          </h1>
          <p className="agi-lede">{COPY.heroLede}</p>

          {/* Launch notice */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '12px 20px',
              background: 'var(--agi-card)',
              border: '1px solid var(--agi-rule-strong)',
              borderRadius: 10,
              marginTop: 32,
              marginBottom: 20,
            }}
          >
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--agi-ink)',
                letterSpacing: '-0.01em',
              }}
            >
              {LAUNCH.publicLabel} · iOS and Android
            </span>
          </div>

          {/* Trust chips */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 32,
            }}
            role="list"
            aria-label="Trust indicators"
          >
            <div role="listitem">
              <TrustChip label={COPY.heroChip_offline} />
            </div>
            <div role="listitem">
              <TrustChip label={COPY.heroChip_ondevice} />
            </div>
            <div role="listitem">
              <TrustChip label={COPY.heroChip_dpdp} />
            </div>
            <div role="listitem">
              <TrustChip label={COPY.heroChip_free} />
            </div>
          </div>

          {/* Waitlist sub-CTA */}
          <div className="agi-cta-row">
            <Link href="/download" className="agi-cta-ghost">
              {COPY.heroWaitlistCta} →
            </Link>
          </div>
          <p
            style={{
              fontSize: 13,
              color: 'var(--agi-ink-quiet)',
              marginTop: 10,
              letterSpacing: '0.01em',
            }}
          >
            {COPY.heroWaitlistNote}
          </p>
        </section>

        {/* ---- 1b. SCREENSHOTS ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">How it looks</p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}
          >
            {/* Phone mockup placeholders */}
            {[
              {
                title: 'Chat: on-device, offline',
                desc: 'Conversation screen with streaming response from Apple Foundation Models. No network activity indicator visible.',
              },
              {
                title: 'Image Q&A: point and ask',
                desc: 'Camera feed with AGI overlay. User pointed at a handwritten recipe. AI extracted ingredients and suggested substitutions.',
              },
              {
                title: 'Voice mode',
                desc: 'Voice input active. Waveform animation shows live transcription. Response reads back in the selected voice.',
              },
            ].map((shot) => (
              <div
                key={shot.title}
                style={{
                  background: 'var(--agi-card)',
                  border: '1px solid var(--agi-rule-strong)',
                  borderRadius: 16,
                  overflow: 'hidden',
                }}
              >
                {/* Phone status bar mock */}
                <div
                  style={{
                    background: 'var(--agi-bg-3)',
                    borderBottom: '1px solid var(--agi-rule)',
                    padding: '8px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 10,
                    color: 'var(--agi-ink-quiet)',
                    fontFamily: 'var(--mono)',
                  }}
                >
                  <span>9:41 AM</span>
                  <span>{shot.title}</span>
                  <span>100%</span>
                </div>
                <div
                  style={{
                    padding: '28px 16px',
                    minHeight: 160,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background:
                      'linear-gradient(135deg, var(--agi-card) 0%, var(--agi-amber-soft) 100%)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      color: 'var(--agi-amber)',
                      margin: 0,
                    }}
                  >
                    Screenshot
                  </p>
                  <p
                    style={{
                      fontSize: 13,
                      color: 'var(--agi-ink-2)',
                      textAlign: 'center',
                      maxWidth: 240,
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {shot.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- 2. WHAT'S DIFFERENT (3 cards) ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">{COPY.diffEyebrow}</p>
          <ul className="agi-reasons" aria-label="Differentiators">
            {COPY.diffCards.map((card) => (
              <li key={card.label} className="agi-reason">
                <div className="agi-callout" style={{ height: '100%' }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: 'var(--agi-amber)',
                      margin: '0 0 8px',
                    }}
                  >
                    {card.label}
                  </p>
                  <h3 className="agi-callout-h">{card.headline}</h3>
                  <p className="agi-callout-p">{card.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- 3. ON-DEVICE AI EXPLANATION ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">{COPY.onDeviceEyebrow}</p>
          <h2 className="agi-section-h2">{COPY.onDeviceHeadline}</h2>
          <p
            style={{
              color: 'var(--agi-ink-2)',
              fontSize: 15,
              lineHeight: 1.7,
              maxWidth: 620,
              marginBottom: 40,
            }}
          >
            {COPY.onDeviceLede}
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 20,
            }}
          >
            {/* iOS */}
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--agi-amber)',
                  marginBottom: 12,
                }}
              >
                {COPY.onDeviceIosLabel}
              </p>
              <table className="agi-ledger">
                <tbody>
                  {COPY.onDeviceIosRows.map(([model, note]) => (
                    <tr key={model}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{model}</td>
                      <td style={{ color: 'var(--agi-ink-2)', fontSize: 13 }}>{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Android */}
            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--agi-amber)',
                  marginBottom: 12,
                }}
              >
                {COPY.onDeviceAndroidLabel}
              </p>
              <table className="agi-ledger">
                <tbody>
                  {COPY.onDeviceAndroidRows.map(([model, note]) => (
                    <tr key={model}>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{model}</td>
                      <td style={{ color: 'var(--agi-ink-2)', fontSize: 13 }}>{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className="agi-callout"
            style={{ marginTop: 24, borderColor: 'var(--agi-amber)', borderWidth: 1 }}
          >
            <p className="agi-callout-p">{COPY.onDeviceNote}</p>
          </div>
        </section>

        {/* ---- 4. FEATURE GRID ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">{COPY.featureEyebrow}</p>
          <h2 className="agi-section-h2">{COPY.featureHeadline}</h2>
          <ul className="agi-perks-grid" style={{ marginTop: 32 }} aria-label="Feature list">
            {COPY.features.map((f) => (
              <li key={f.label} className="agi-perk-card">
                <span aria-hidden="true" style={{ fontSize: 22, lineHeight: 1, marginBottom: 4 }}>
                  {f.icon}
                </span>
                <p className="agi-perk-title">{f.label}</p>
                <p className="agi-perk-description">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---- 5. PRIVACY SECTION ---- */}
        <section className="agi-section">
          <p className="agi-section-eyebrow">{COPY.privacyEyebrow}</p>
          <h2 className="agi-section-h2">{COPY.privacyHeadline}</h2>
          <p
            style={{
              color: 'var(--agi-ink-2)',
              fontSize: 15,
              lineHeight: 1.7,
              maxWidth: 620,
              marginBottom: 40,
            }}
          >
            {COPY.privacyLede}
          </p>
          <ul className="agi-reasons" aria-label="Privacy facts">
            {COPY.privacyPoints.map((pt) => (
              <li key={pt.label} className="agi-reason">
                <h3 className="agi-reason-h">{pt.label}</h3>
                <p className="agi-reason-p">{pt.body}</p>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 32 }}>
            <Link
              href="/mobile/legal"
              className="agi-cta-ghost"
              style={{ display: 'inline-block' }}
            >
              Read the mobile privacy policy →
            </Link>
          </div>
        </section>

        {/* ---- 6. CLOUD WAITLIST TEASE ---- */}
        <section className="agi-section">
          <div className="agi-callout">
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--agi-amber)',
                marginBottom: 10,
              }}
            >
              {COPY.waitlistEyebrow}
            </p>
            <h2 className="agi-callout-h">{COPY.waitlistHeadline}</h2>
            <p className="agi-callout-p" style={{ marginBottom: 24 }}>
              {COPY.waitlistLede}
            </p>
            <Link href="/waitlist" className="agi-cta-primary" style={{ display: 'inline-block' }}>
              {COPY.waitlistCta}
            </Link>
          </div>
        </section>

        {/* ---- 7. ABOUT FOOTER NOTE ---- */}
        <section className="agi-section">
          <div className="agi-colophon">
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Developer</span>
              <span className="agi-colophon-val">{COPY.aboutCompany}, Delaware, USA</span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Platform</span>
              <span className="agi-colophon-val">iOS 17+ and Android 14+</span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Bundle ID (iOS)</span>
              <span className="agi-colophon-val">com.agiworkforce.app</span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Package (Android)</span>
              <span className="agi-colophon-val">com.agiworkforce.app</span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Framework</span>
              <span className="agi-colophon-val">Expo 53 + React Native 0.83.6</span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Launch date</span>
              <span className="agi-colophon-val">
                {LAUNCH.isoDate}, simultaneously iOS and Android
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Support</span>
              <span className="agi-colophon-val">
                <a href="mailto:support@agiworkforce.com" style={{ color: 'var(--agi-amber)' }}>
                  support@agiworkforce.com
                </a>
              </span>
            </div>
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Legal</span>
              <span className="agi-colophon-val">
                <Link href="/mobile/legal" style={{ color: 'var(--agi-amber)' }}>
                  Privacy policy and Terms of service
                </Link>
              </span>
            </div>
          </div>
        </section>

        <MarketingFooter />
      </main>
    </div>
  );
}
