import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CapabilityGrid,
  FinalCta,
  TrustTriptych,
} from '@/features/marketing/components/SurfaceSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { Reveal } from '@/features/marketing/components/Reveal';
import { WaitlistTrigger } from '@/features/marketing/components/WaitlistModal';
import { LAUNCH, SURFACE_STATUS } from '../../lib/marketing-constants';

export const metadata: Metadata = {
  title: 'AGI Mobile Preview | Coming soon to iPhone & Android',
  description:
    'AGI Mobile is coming soon. The planned app is designed for on-device Local chat by default, with explicit managed-cloud continuation.',
  alternates: { canonical: 'https://agiworkforce.com/mobile' },
  openGraph: {
    title: 'AGI Mobile Preview | Coming soon to iPhone & Android',
    description:
      'AGI Mobile is not published. Preview the planned on-device Local experience and explicit cloud boundary.',
    type: 'website',
    url: 'https://agiworkforce.com/mobile',
    images: [{ url: '/api/og', width: 1200, height: 630, alt: 'AGI app preview' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AGI Mobile Preview | Coming soon to iPhone & Android',
    description: `The app is not published. Local Mode is the planned default. ${LAUNCH.publicLabel}.`,
    images: ['/api/og'],
  },
};

const LOCAL_STORIES = [
  {
    name: 'Chat that runs on the phone',
    tagline: 'Planned default: Local Mode, not a setting.',
    body: 'The planned app opens directly into Local chat, with on-device inference through AGI Standard and no account required.',
    capabilities: [
      'Planned on-device Local chat',
      'Planned offline operation',
      'Planned AGI Standard runtime',
      'Planned model availability states',
    ],
    platforms: 'iPhone · Android',
    status: 'Planned: Local by default',
    frame: { title: 'AGI Mobile', badge: 'Local' },
  },
  {
    name: 'Your data stays on the phone',
    tagline: 'No silent routes. No surprise sync.',
    body: 'The planned app keeps chats, memory, projects, and files on-device. Nothing is designed to move to a server unless you choose it; the route is labeled before anything leaves.',
    capabilities: [
      'Planned chats & memory on-device',
      'Planned projects & files on-device',
      'Planned personalization on-device',
      'Planned explicit, labeled continuation',
    ],
    platforms: 'iPhone · Android',
    status: 'Planned: on-device by default',
    frame: { title: 'AGI Mobile', badge: 'On-device' },
  },
  {
    name: 'A complete workspace, not a companion app',
    tagline: 'The full AGI workspace. One hand.',
    body: 'The planned app includes a model picker, projects drawer, and settings for memory, appearance, and safety without leaving Local Mode.',
    capabilities: [
      'Planned model picker',
      'Planned projects & recents drawer',
      'Planned full settings',
      'Planned memory & personalization controls',
    ],
    platforms: 'iPhone · Android',
    status: 'Planned Local + Cloud',
    frame: { title: 'AGI Mobile', badge: 'Local' },
  },
] as const;

export default function MobilePage() {
  return (
    <div data-design="agi">
      <main className="agi-shell agi-surface">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-mobile-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              {/*
                Every other unreleased surface page states its availability in
                the hero eyebrow (`/cli`, `/chrome-extension`,
                `/vscode-extension` all read "· coming soon"). This one did not:
                it opened with "AGI Mobile · iPhone & Android" and a "Get
                notified" CTA, so the only place the page admitted the app is
                unpublished was the header nav dropdown, while the hero named
                two platforms you cannot install on. Mobile has ZERO `v-mobile-*`
                release tags.

                The status is read from `SURFACE_STATUS.mobile` rather than
                typed, so the day mobile ships this line changes with the
                registry instead of becoming the stale claim CRIT-007 was
                opened for.
              */}
              <p className="agi-fl-eyebrow">
                AGI Mobile · iPhone &amp; Android · {SURFACE_STATUS.mobile}
              </p>
              <h1 id="agi-mobile-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">Private AI,</span>{' '}
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">in your pocket.</em>
                </span>
              </h1>
              <p className="agi-fl-lede">
                AGI Mobile is not published. The planned app starts each chat in Local Mode, keeps
                chats, memory, and files on-device, and makes managed-cloud continuation an explicit
                choice.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="/download" className="agi-fl-cta agi-fl-cta--primary">
                  Get notified
                </Link>
                <WaitlistTrigger
                  label="Discuss Enterprise access"
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
            The planned runtime keeps inference, memory, and your workspace on the device. Managed
            cloud is designed as an explicit continuation, not the default route.
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
          lede="The planned AGI Mobile design keeps Local and AGI Cloud separate. The app is not published, and these are previewed boundaries rather than current availability."
          cards={[
            {
              mode: 'Local',
              glyph: '◆',
              title: 'Yours alone, free forever.',
              body: 'On-device chat is planned as the default when the app is published.',
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
                'Public alpha: sign in and start, no waitlist',
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
          title="The planned feature set. Your phone."
          items={[
            {
              meta: 'Chat',
              title: 'Local Chat',
              body: 'Planned on-device conversations with the AGI Standard runtime, online or off.',
              href: '/features/ai-chat',
            },
            {
              meta: 'Models',
              title: 'Model Picker',
              body: 'The planned picker shows installed, downloadable, and locked model states.',
              href: '/local',
            },
            {
              meta: 'Projects',
              title: 'Projects & Recents',
              body: 'The planned drawer keeps work organized by topic and one tap away.',
              href: '/features/projects',
            },
            {
              meta: 'Memory',
              title: 'Memory',
              body: 'Planned on-device memory and personalization you can inspect and control.',
              href: '/features/memory',
            },
            {
              meta: 'Artifacts',
              title: 'Artifacts',
              body: 'A planned gallery and preview for generated documents and outputs.',
              href: '/features/artifacts',
            },
            {
              meta: 'Settings',
              title: 'Full Settings',
              body: 'Planned appearance, data controls, app lock, and safety settings on-device.',
              href: '/security',
            },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Get notified when Mobile ships."
          body="AGI Mobile is not published. The planned iPhone and Android app uses Local Mode by default and offers an explicit managed-cloud continuation."
          ctas={[
            { href: '/download', label: 'Get notified' },
            { label: 'Discuss Enterprise access', waitlist: true },
          ]}
          stamp={`iPhone & Android · ${LAUNCH.shortLabel}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
