import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { MARKETING } from '../../lib/marketing-constants';

// All user-visible copy is declared here so a translator can find every string
// in one place. Future Hindi translation = one object swap.
const COPY = {
  // Hero
  heroEyebrow: 'iOS + Android — launching 2026-08-16',
  heroHeadline: 'AGI on your phone.',
  heroSubline: 'Free. Works in airplane mode.',
  heroLede:
    'Like ChatGPT, Claude, and Gemini — but it runs on your device. Your conversations never leave your phone.',
  heroBadgeAlt_ios: 'Download on the App Store',
  heroBadgeAlt_android: 'Get it on Google Play',
  heroChip_offline: 'Works offline',
  heroChip_ondevice: 'On-device',
  heroChip_dpdp: 'DPDP 2023 compliant',
  heroChip_free: 'Free at inference',
  heroWaitlistCta: 'Join the waitlist',
  heroWaitlistNote: 'Cloud features coming soon. Local AI is free, always.',

  // What's different
  diffEyebrow: 'What makes it different',
  diffCards: [
    {
      label: 'Local-only',
      headline: 'Your phone runs the AI.',
      body: 'No server call during inference. Works on a plane, in a basement, in a country with restricted internet. The model lives on your device.',
    },
    {
      label: 'Multi-model',
      headline: 'Apple FM. Gemini Nano. Qwen3.',
      body: `On iOS: Apple Foundation Models on Pro hardware, Qwen3-4B as a fallback. On Android: Gemini Nano on flagships, Gemma + LiteRT everywhere else. ${MARKETING.providers.display} providers coming with cloud.`,
    },
    {
      label: 'Privacy by architecture',
      headline: 'Privacy is the design, not the policy.',
      body: 'Conversations never transit a server. No training on your data. No sale of your data. Telemetry is off by default. We collect the minimum needed to fix bugs.',
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
    ['Apple Foundation Models', 'iPhone 15 Pro and later — on-chip, ~4K context'],
    ['Qwen3-4B (executorch)', 'iPhone 12 and later — on-device, universal fallback'],
  ],
  onDeviceAndroidRows: [
    ['Gemini Nano (AICore)', 'Pixel 9+, Galaxy S26+, OnePlus 15+ with 12 GB RAM'],
    ['Gemma + LiteRT', "All Android devices with 4 GB+ RAM — Google's own path"],
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
    { icon: '⚡', label: 'Skills', body: '150+ built-in skills across 23 categories.' },
    { icon: '❤️', label: 'HealthKit', body: 'iOS: weekly activity recap in plain language.' },
    { icon: '🇮🇳', label: 'Hindi', body: 'Validated against a 60-prompt native-speaker suite.' },
  ],

  // Privacy section
  privacyEyebrow: 'Privacy',
  privacyHeadline: 'Your data never leaves your device. Period.',
  privacyLede:
    'This is the architecture, not a policy that can change. The AI model runs on your handset. There is no server to send your conversations to.',
  privacyPoints: [
    {
      label: 'No inference call',
      body: 'During a conversation, AGI Mobile makes zero network calls for inference. The model runs locally.',
    },
    {
      label: 'No training',
      body: 'Your conversations are not used to train any AI model, by AGI Automation LLC or anyone else.',
    },
    {
      label: 'Telemetry off',
      body: 'Crash reporting strips strings over 40 characters before transmission. Analytics is opt-in. No session replay on AI screens.',
    },
    {
      label: 'DPDP 2023 (India)',
      body: 'Because inference is on-device, conversation data never crosses a border. DPDP cross-border transfer requirements do not apply to your conversations.',
    },
    {
      label: 'EU AI Act (Art. 50)',
      body: 'Built-in disclosure that responses are AI-generated. Conversation exports include machine-readable markers.',
    },
    {
      label: 'GDPR',
      body: 'Conversation inference data is never processed by us. Account data (email for waitlist) is stored with your consent and deletable on request.',
    },
  ],

  // Waitlist tease
  waitlistEyebrow: 'Cloud is coming',
  waitlistHeadline: 'More power on the way.',
  waitlistLede: `${MARKETING.providers.display} providers — Claude, GPT-5, Gemini cloud, and more — are coming to AGI Mobile. They are waitlist-gated while we get the local experience right. Local AI is free, always.`,
  waitlistCta: 'Join the cloud waitlist',

  // Footer section
  aboutCompany: 'AGI Automation LLC',
  aboutTagline: MARKETING.tagline,
} as const;

export const metadata: Metadata = {
  title: 'AGI Mobile — On-device AI for iOS and Android',
  description:
    'Mobile-first AI assistant focused on local privacy, offline-capable workflows, and explicit BYOK.',
  alternates: { canonical: 'https://agiworkforce.com/mobile' },
  openGraph: {
    title: 'AGI Mobile — On-device AI for iOS and Android',
    description:
      'Mobile-first AI assistant focused on local privacy, offline-capable workflows, and explicit BYOK.',
    type: 'website',
    url: 'https://agiworkforce.com/mobile',
    images: [{ url: '/mobile-preview.png', width: 1200, height: 630, alt: 'AGI Mobile' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Mobile — On-device AI for iOS and Android',
    description: 'Local privacy first. BYOK explicit. Managed compute waitlisted.',
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

// Placeholder app store badges (SVG text badges — no external image dep)
function AppStoreBadge() {
  return (
    <a
      href="https://apps.apple.com/app/agi/id6742817665"
      aria-label={COPY.heroBadgeAlt_ios}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 20px',
        background: 'var(--agi-ink)',
        color: 'var(--agi-bg)',
        borderRadius: 10,
        textDecoration: 'none',
        fontWeight: 600,
        fontSize: 14,
        letterSpacing: '-0.01em',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
      </svg>
      App Store
    </a>
  );
}

function PlayStoreBadge() {
  return (
    <a
      href="https://play.google.com/store/apps/details?id=com.agiworkforce.app"
      aria-label={COPY.heroBadgeAlt_android}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 20px',
        background: 'var(--agi-card)',
        border: '1px solid var(--agi-rule-strong)',
        color: 'var(--agi-ink)',
        borderRadius: 10,
        textDecoration: 'none',
        fontWeight: 600,
        fontSize: 14,
        letterSpacing: '-0.01em',
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="m3.18 23.76 11.34-11.35L3.18.24A2 2 0 0 0 2 2v20a2 2 0 0 0 1.18 1.76zM20.82 10.5l-3.3-1.85-3.54 3.54 3.54 3.55 3.31-1.86a2 2 0 0 0 0-3.38zM5.1 1.22l12.7 7.13-3.37 3.37L5.1 1.22zm0 21.56 9.33-10.5-3.37-3.38L5.1 22.78z" />
      </svg>
      Google Play
    </a>
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

          {/* App store badges */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginTop: 32,
              marginBottom: 20,
            }}
          >
            <AppStoreBadge />
            <PlayStoreBadge />
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
            <Link href="/contact" className="agi-cta-ghost">
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
                title: 'Chat — on-device, offline',
                desc: 'Conversation screen with streaming response from Apple Foundation Models. No network activity indicator visible.',
              },
              {
                title: 'Image Q&A — point and ask',
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
            <Link href="/contact" className="agi-cta-primary" style={{ display: 'inline-block' }}>
              {COPY.waitlistCta}
            </Link>
          </div>
        </section>

        {/* ---- 7. ABOUT FOOTER NOTE ---- */}
        <section className="agi-section">
          <div className="agi-colophon">
            <div className="agi-colophon-row">
              <span className="agi-colophon-key">Developer</span>
              <span className="agi-colophon-val">{COPY.aboutCompany} — Delaware, USA</span>
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
              <span className="agi-colophon-val">2026-08-16, simultaneously iOS and Android</span>
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
