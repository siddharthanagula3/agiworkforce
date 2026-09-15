import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CapabilityGrid,
  FinalCta,
  TrustTriptych,
} from '@/features/marketing/components/SurfaceSections';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { WaitlistTrigger } from '@/features/marketing/components/WaitlistModal';
import { DesktopDownloadAvailability } from '../download/DesktopDownloadAvailability';
import { DESKTOP_LOCAL_RUNTIMES } from '@/lib/marketing-constants';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2F';

export const metadata = buildMetadata({
  title: 'AGI Desktop | Your account, on your Mac',
  description: `The AGI app for macOS: the web app in a window that stays open, plus the folders you approve, ${DESKTOP_LOCAL_RUNTIMES.label} models already running on the machine, computer use one step at a time, and a menu bar shortcut. Signed and notarized per architecture; check installer availability.`,
  path: '/desktop',
});

export default function DesktopPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell agi-surface">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-desktop-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">AGI Desktop</p>
              <h1 id="agi-fl-desktop-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">Your account,</span>{' '}
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">on your Mac.</em>
                </span>
              </h1>
              <p className="agi-fl-lede">
                The AGI app for macOS. Sign in once and the desktop app carries the web app in a
                window that stays open, then adds what a browser cannot reach: the folders you
                approve, models already running on this machine, the screen and the pointer when you
                allow a step, and a menu bar shortcut that is one keystroke away.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="#desktop-downloads" className="agi-fl-cta agi-fl-cta--primary">
                  Check installer availability
                </Link>
                <Link href={WEB_CHAT_ENTRY_HREF} className="agi-fl-cta agi-fl-cta--secondary">
                  Use AGI Web
                </Link>
                <WaitlistTrigger
                  label="Enterprise early access"
                  source="website"
                  className="agi-fl-cta agi-fl-cta--ghost"
                />
              </div>
              <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
                <li>Cloud · your AGI account</li>
                <li>Local · models on this Mac</li>
                <li>Consent · every device step asks</li>
              </ul>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <ProductFrame variant="desktop" title="AGI Workforce" badge="Cloud" />
            </div>
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Capabilities"
          title="What the window adds."
          items={[
            {
              meta: 'Files',
              title: 'Approved folders',
              body: 'Attach files from folders on this Mac that you approve once. Anything outside them asks.',
              href: '/features/tools',
            },
            {
              meta: 'Local',
              title: 'Models on this Mac',
              body: `${DESKTOP_LOCAL_RUNTIMES.label} models already running here answer on the device. A local thread never leaves it on its own.`,
              href: '/local',
            },
            {
              meta: 'Computer use',
              title: 'Screen and pointer',
              body: 'On macOS, with Screen Recording and Accessibility granted, the app can look at the screen and act on it, one approved step at a time.',
              href: '/features/agents',
            },
            {
              meta: 'Browser',
              title: 'Pairs with Chrome',
              body: 'The Chrome extension pairs with the desktop app over a local bridge you approve.',
              href: '/chrome-extension',
            },
            {
              meta: 'Quick Ask',
              title: 'Menu bar, one keystroke',
              body: 'A global shortcut opens a small composer anywhere. Screenshot to chat and dictation have shortcuts of their own.',
              href: '/features/ai-chat',
            },
            {
              meta: 'AGI Work',
              title: 'Scheduled work',
              body: 'Schedule recurring runs. A step that needs this machine waits for it here.',
              href: '/agi-work',
            },
          ]}
        />

        <TrustTriptych
          eyebrow="Trust modes"
          title="No silent switches."
          lede="Desktop is where your account meets your machine. Nothing crosses from one to the other without a label and your consent."
          cards={[
            {
              mode: 'AGI Cloud',
              glyph: '●',
              title: 'Your account, signed in once.',
              body: 'Chats, projects, memory and connectors are the ones you have on the web.',
              points: [
                'One account across web, desktop, mobile, CLI, VS Code and Chrome',
                'Sign-in opens the browser; tokens are encrypted with the system keychain',
                'Usage metered and transparent',
              ],
              cta: { href: '/get-started', label: 'Get Started' },
            },
            {
              mode: 'Local',
              glyph: '◆',
              title: 'Models on this Mac stay here.',
              body: `${DESKTOP_LOCAL_RUNTIMES.label} models already running answer on the device.`,
              points: [
                'A local thread never silently leaves the machine',
                'A local turn carries no attachments',
                'Leaving local mode is a labelled step you take',
              ],
              cta: { href: '/local', label: 'Run AGI Locally' },
            },
            {
              mode: 'Consent',
              glyph: '◇',
              title: 'Every device step asks.',
              body: 'Folders, programs, the screen and the pointer are granted one at a time.',
              points: [
                'Approved folders and programs, nothing else',
                'Computer use needs Screen Recording and Accessibility, granted in System Settings',
                'A step you did not approve does not run',
              ],
              cta: { href: '/trust', label: 'How trust works' },
            },
          ]}
        />

        <DesktopDownloadAvailability />

        <LedgerSection
          eyebrow="Specifications"
          title="What's inside."
          rows={[
            { k: 'Engine', v: 'Electron shell over the hosted app · native helpers in Swift' },
            { k: 'Platforms', v: 'macOS, Apple silicon and Intel · Windows not published' },
            {
              k: 'Account',
              v: 'Your AGI account · sign-in in the browser · tokens encrypted with the system keychain',
            },
            { k: 'Local runtimes', v: DESKTOP_LOCAL_RUNTIMES.compact },
            { k: 'Local access', v: 'Approved folders and programs · each grant is explicit' },
            {
              k: 'Computer use',
              v: 'macOS · screen capture and input · Screen Recording and Accessibility permissions',
            },
            { k: 'Browser', v: 'Pairs with the Chrome extension over a local bridge' },
            { k: 'Shortcuts', v: 'Quick Ask · screenshot to chat · dictation · launch at login' },
            {
              k: 'Signing',
              v: 'Developer ID signed · hardened runtime · notarized and stapled per architecture',
            },
            {
              k: 'Updates',
              v: 'The app checks the release API and offers the signed installer · nothing installs on its own',
            },
            { k: 'Windows', v: 'Installer not published · no release date announced' },
          ]}
        />

        <FinalCta
          eyebrow="macOS"
          title="Check AGI Desktop availability."
          body="A download control appears only once the release API verifies a signed build for your architecture, so this page reflects what is published rather than what is built. The macOS build is signed and notarized by the release job but not yet published, and Windows installers are not published."
          ctas={[
            { href: '#desktop-downloads', label: 'Check installer availability' },
            { href: WEB_CHAT_ENTRY_HREF, label: 'Use AGI Web' },
            { label: 'Enterprise early access', waitlist: true },
          ]}
          stamp="macOS · verification required before download"
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
