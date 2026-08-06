import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CapabilityGrid,
  FinalCta,
  TrustTriptych,
} from '@/features/marketing/components/FlagshipSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { Reveal } from '@/features/marketing/components/Reveal';
import { WaitlistTrigger } from '@/features/marketing/components/WaitlistModal';
import { LAUNCH } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Mobile | Private, Local-First AI for iPhone & Android',
  description:
    'AGI Mobile runs chat on your phone in Local Mode by default. Chats, memory, projects, and files stay on-device unless you choose otherwise. AGI managed cloud is in public alpha.',
  alternates: { canonical: 'https://agiworkforce.com/mobile' },
  openGraph: {
    title: 'AGI Mobile | Private, Local-First AI for iPhone & Android',
    description:
      'On-device Local chat by default. Your data stays on the phone unless you explicitly choose otherwise. AGI managed cloud is public alpha.',
    type: 'website',
    url: 'https://agiworkforce.com/mobile',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'AGI app preview' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Mobile | Private, Local-First AI for iPhone & Android',
    description: `Local Mode by default. AGI managed cloud is public alpha. ${LAUNCH.publicLabel}.`,
    images: ['/api/og'],
  },
};

/** Local-first feature stories, rendered as alternating copy/visual rows. */
const LOCAL_STORIES = [
  {
    name: 'Chat that runs on the phone',
    tagline: 'Local Mode is the default, not a setting.',
    body: 'Open the app and start talking. Inference runs on-device through AGI Standard. No account required. No network call during a Local chat.',
    capabilities: [
      'On-device Local chat',
      'Works offline',
      'AGI Standard runtime',
      'Clear model availability states',
    ],
    platforms: 'iPhone · Android',
    status: 'Local by default',
    frame: { title: 'AGI Mobile', badge: 'Local' },
  },
  {
    name: 'Your data stays on the phone',
    tagline: 'No silent routes. No surprise sync.',
    body: 'Chats, memory, projects, and files live on-device. Nothing moves to a server unless you choose it. When you do, the route is labeled before anything leaves.',
    capabilities: [
      'Chats & memory on-device',
      'Projects & files on-device',
      'Personalization on-device',
      'Explicit, labeled continuation',
    ],
    platforms: 'iPhone · Android',
    status: 'On-device by default',
    frame: { title: 'AGI Mobile', badge: 'On-device' },
  },
  {
    name: 'A complete workspace, not a companion app',
    tagline: 'The full AGI workspace. One hand.',
    body: 'Switch models from the picker. Organize work with the projects drawer. Tune memory, appearance, and safety from full settings. All without leaving Local Mode.',
    capabilities: [
      'Model picker',
      'Projects & recents drawer',
      'Full settings',
      'Memory & personalization controls',
    ],
    platforms: 'iPhone · Android',
    status: 'Local + Cloud (public alpha)',
    frame: { title: 'AGI Mobile', badge: 'Local' },
  },
] as const;

export default function MobilePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-mobile-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">AGI Mobile · iPhone &amp; Android</p>
              <h1 id="agi-mobile-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">Private AI,</span>
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">in your pocket.</em>
                </span>
              </h1>
              <p className="agi-fl-lede">
                Every chat starts in Local Mode. The model runs on your phone. Chats, memory, and
                files stay on-device unless you say otherwise. AGI Cloud is public alpha — opt-in,
                never by default.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
                  Get notified
                </Link>
                <WaitlistTrigger
                  label="Team & Enterprise access"
                  source="website"
                  className="agi-fl-cta agi-fl-cta--secondary"
                />
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="Mobile trust modes">
                <li>Local · on-device</li>
                <li>Cloud · public alpha</li>
              </ul>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <ProductFrame variant="phone" title="AGI Mobile" badge="Local" />
            </div>
          </div>
        </section>

        <section className="agi-fl-section" aria-labelledby="agi-mobile-local-title">
          <p className="agi-fl-eyebrow">Local-first</p>
          <h2 id="agi-mobile-local-title" className="agi-fl-h2">
            The phone is the computer.
          </h2>
          <p className="agi-fl-section-lede">
            Inference, memory, and your workspace live on the device. The cloud is an explicit,
            public-alpha option. Not the default route.
          </p>

          <ul className="agi-fl-surface-list">
            {LOCAL_STORIES.map((story) => (
              <Reveal as="li" key={story.name} className="agi-fl-surface-row">
                <div className="agi-fl-surface-copy">
                  <h3 className="agi-fl-surface-name">{story.name}</h3>
                  <p className="agi-fl-surface-tagline">{story.tagline}</p>
                  <p className="agi-fl-surface-body">{story.body}</p>
                  <ul className="agi-fl-surface-caps">
                    {story.capabilities.map((cap) => (
                      <li key={cap}>{cap}</li>
                    ))}
                  </ul>
                  <p className="agi-fl-surface-meta">
                    <span>{story.platforms}</span>
                    <span className="agi-fl-surface-status">{story.status}</span>
                  </p>
                </div>
                <div className="agi-fl-surface-visual">
                  <ProductFrame
                    variant="phone"
                    title={story.frame.title}
                    badge={story.frame.badge}
                  />
                </div>
              </Reveal>
            ))}
          </ul>
        </section>

        <TrustTriptych
          eyebrow="Trust boundary"
          title="Two modes. One hard line between them."
          lede="AGI Mobile keeps Local and AGI Cloud separate by design. A Local thread stays Local. Continuing one in the cloud is an explicit, labeled choice."
          cards={[
            {
              mode: 'Local',
              glyph: '◆',
              title: 'Yours alone, free forever.',
              body: 'On-device chat is the default on every install.',
              points: [
                'Conversations run on the phone',
                'Works offline',
                'No account required',
                'Free forever',
              ],
              cta: { href: '/local', label: 'See How Local Works' },
            },
            {
              mode: 'The boundary',
              glyph: '◇',
              title: 'Nothing moves without you.',
              body: 'Routes are visible, and changing one is always your call.',
              points: [
                'Local chats never silently route to the cloud',
                'Continuation requires explicit consent',
                'Telemetry separated from conversation content',
                'DPDP & GDPR disclosures, in progress',
              ],
              cta: { href: '/mobile/legal', label: 'Read the Mobile Privacy Policy' },
            },
            {
              mode: 'AGI Cloud',
              glyph: '●',
              title: 'Managed compute, public alpha.',
              body: 'Hosted capacity, open by default, with controls keeping pace.',
              points: [
                'Public alpha — sign in and start, no waitlist',
                'Synced chats and hosted models',
                'Separate from Local by design',
                'Usage metered and transparent',
              ],
              cta: { href: '/get-started', label: 'Get Started' },
            },
          ]}
        />

        <CapabilityGrid
          eyebrow="In the app"
          title="The full feature set. Your phone."
          items={[
            {
              meta: 'Chat',
              title: 'Local Chat',
              body: 'Fast on-device conversations with the AGI Standard runtime. Online or off.',
              href: '/features/ai-chat',
            },
            {
              meta: 'Models',
              title: 'Model Picker',
              body: 'Choose your model and see clear installed, downloadable, and locked states.',
              href: '/local',
            },
            {
              meta: 'Projects',
              title: 'Projects & Recents',
              body: 'A drawer that keeps work organized by topic and one tap away.',
              href: '/features/projects',
            },
            {
              meta: 'Memory',
              title: 'Memory',
              body: 'On-device memory and personalization you can inspect and control.',
              href: '/features/memory',
            },
            {
              meta: 'Artifacts',
              title: 'Artifacts',
              body: 'A gallery and preview for the documents and outputs you generate.',
              href: '/features/artifacts',
            },
            {
              meta: 'Settings',
              title: 'Full Settings',
              body: 'Appearance, data controls, app lock, and safety. All on the device.',
              href: '/security',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Take AGI with you."
          body="AGI Mobile launches on iPhone and Android. Local Mode is the default. AGI managed cloud is in public alpha — sign in to use it."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          stamp={`iPhone & Android · ${LAUNCH.shortLabel}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
