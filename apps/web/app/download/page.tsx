import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { DevBand, FinalCta, SurfaceIndex } from '@/features/marketing/components/FlagshipSections';
import { WaitlistTrigger } from '@/features/marketing/components/WaitlistModal';
import { PublicWaitlistForm } from '@/features/marketing/components/PublicWaitlistForm';
import { COMING_SOON_LABEL, SURFACE_STATUS } from '../../lib/marketing-constants';
import { DesktopDownloadAvailability } from './DesktopDownloadAvailability';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2Fchat';

export const metadata = buildMetadata({
  title: 'Download AGI | Desktop and Product Availability',
  description:
    'Download the signed AGI Desktop AppImage for Linux x64. macOS and Windows installers are not yet published. Check availability across Web, Mobile, CLI, Chrome, and VS Code.',
  path: '/download',
});

export default function DownloadPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-download-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Product availability</p>
          <h1 id="agi-download-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">AGI on</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">every surface.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            AGI Web is available in the browser. The Desktop stable release channel is limited to
            signed Linux x64 AppImages, with live availability verified below. macOS and Windows
            installers are not published. Other surfaces are individually labeled.
          </p>
          <div className="agi-fl-cta-row">
            <Link href="#desktop-downloads" className="agi-fl-cta agi-fl-cta--primary">
              View Desktop downloads
            </Link>
            <WaitlistTrigger
              label="Team & Enterprise access"
              source="website"
              className="agi-fl-cta agi-fl-cta--ghost"
            />
          </div>
          <ul className="agi-fl-mode-ribbon" aria-label="Trust modes">
            <li>Local · on-device</li>
            <li>BYOK · your keys</li>
            <li>Cloud · public alpha</li>
          </ul>

          <div className="agi-fl-hero-console" aria-hidden="true">
            <ProductFrame
              variant="desktop"
              title="AGI Desktop"
              badge="Local"
              className="agi-fl-hero-frame agi-fl-hero-frame--main"
            />
            <ProductFrame
              variant="terminal"
              title="agi · zsh"
              className="agi-fl-hero-frame agi-fl-hero-frame--terminal"
            />
            <ProductFrame
              variant="phone"
              title="AGI Mobile"
              className="agi-fl-hero-frame agi-fl-hero-frame--phone"
            />
          </div>
        </section>

        <SurfaceIndex
          eyebrow="Pick your surface"
          title="Six surfaces, individually labeled."
          lede="Availability is tracked per surface and platform. A working Web entry and verified Desktop installer are linked directly; unavailable products do not receive download controls."
          items={[
            {
              index: '01',
              name: 'AGI Web',
              tagline: 'No install. Start in the browser.',
              body: 'Hosted chat with projects, an artifact sidecar, web search, and shared conversations. Managed cloud is open in public alpha; your account and settings live here.',
              capabilities: [
                'Chat with projects & memory',
                'Artifact sidecar',
                'Web search',
                'Account & cloud sync',
              ],
              platforms: 'Any modern browser',
              status: SURFACE_STATUS.web,
              href: WEB_CHAT_ENTRY_HREF,
              frame: {
                variant: 'web',
                title: 'agiworkforce.com/chat',
                badge: 'Web',
                image: {
                  src: '/app-preview.png',
                  width: 1024,
                  height: 665,
                  alt: 'AGI Web composer with model and tool controls',
                },
              },
            },
            {
              index: '02',
              name: 'AGI Desktop',
              tagline: 'The local-private compute host.',
              body: 'A native app built in Rust. Runs local models, holds BYOK keys encrypted, powers files and connectors. Platform installers open from the Desktop page as release assets become available.',
              capabilities: [
                'Local models via Ollama & LM Studio',
                'BYOK keys, encrypted at rest',
                'MCP connectors & tool approvals',
                'Scheduled work with AGI Work',
              ],
              platforms: 'Linux x64 release channel · macOS and Windows not published',
              status: 'Check Linux release',
              href: '/desktop',
              frame: { variant: 'desktop', title: 'AGI Desktop', badge: 'Local' },
            },
            {
              index: '03',
              name: 'AGI Mobile',
              tagline: 'Private AI in your pocket.',
              body: 'On-device chat in Local Mode by default. Your conversations, memory, and files stay on the phone unless you explicitly choose otherwise. AGI managed cloud is in public alpha.',
              capabilities: [
                'On-device Local chat',
                'Local data stays local',
                'Projects & recents drawer',
                'Cloud · public alpha',
              ],
              platforms: 'iPhone · Android',
              status: SURFACE_STATUS.mobile,
              href: '/mobile',
              frame: { variant: 'phone', title: 'AGI Mobile' },
            },
            {
              index: '04',
              name: 'AGI CLI',
              tagline: 'An agent in your terminal.',
              body: 'The agi binary is a Rust-native developer agent: sessions you can resume and fork, code review, and sandboxed execution. It ships with the public release.',
              capabilities: [
                'Sessions, resume & fork',
                'Sandboxed execution',
                'Hooks, skills & MCP',
                'Offline with local models',
              ],
              platforms: 'macOS · Linux',
              status: SURFACE_STATUS.cli,
              href: '/cli',
              frame: { variant: 'terminal', title: 'agi · zsh', badge: 'sandboxed' },
            },
            {
              index: '05',
              name: 'AGI in Chrome',
              tagline: 'Your browser, with context.',
              body: 'A Manifest V3 side panel that captures page context on request. Hands real work to Desktop over a paired native-messaging bridge. Availability tracks the Desktop release.',
              capabilities: [
                'Side panel on any page',
                'Page context on request',
                'Paired Desktop bridge',
                'Scoped permissions',
              ],
              platforms: 'Chrome (MV3)',
              status: SURFACE_STATUS.chrome,
              href: '/chrome-extension',
              frame: { variant: 'browser', title: 'AGI · side panel', badge: 'scoped' },
            },
            {
              index: '06',
              name: 'AGI in VS Code',
              tagline: 'IDE-native assistance.',
              body: 'Chat with @agi inside your editor with workspace-scoped context. Review diffs before they land and run slash commands like /explain and /tests.',
              capabilities: [
                '@agi chat participant',
                'Workspace-scoped context',
                'Diff review',
                'Explicit handoffs',
              ],
              platforms: 'VS Code',
              status: SURFACE_STATUS.vscode,
              href: '/vscode-extension',
              frame: { variant: 'editor', title: 'AGI · VS Code', badge: '@agi' },
            },
          ]}
        />

        <DesktopDownloadAvailability />

        <section className="agi-fl-section" aria-labelledby="agi-download-notify-title">
          <p className="agi-fl-eyebrow">{COMING_SOON_LABEL}</p>
          <h2 id="agi-download-notify-title" className="agi-fl-h2">
            Get updates for unavailable surfaces.
          </h2>
          <p className="agi-fl-section-lede">
            macOS and Windows Desktop installers do not have published release dates. Mobile,
            Chrome, and VS Code availability is also tracked separately. Leave your email for
            product updates without treating an unavailable platform as downloadable.
          </p>
          <div className="agi-fl-launch-form">
            <PublicWaitlistForm
              source="other"
              ctaLabel="Get notified"
              successMessage="You're on the list. We'll email you as each AGI surface opens for public launch."
            />
          </div>
        </section>

        <DevBand
          eyebrow="For developers"
          title="Two developer surfaces, both coming soon."
          body="The AGI CLI ships as the agi binary and AGI in VS Code adds @agi chat, diff review, and slash commands to your editor. Both are in developer preview ahead of public launch."
          ctas={[
            { href: '/cli', label: 'See the CLI' },
            { href: '/vscode-extension', label: 'See the VS Code Extension' },
          ]}
        />

        <FinalCta
          eyebrow="Current availability"
          title="Use AGI now, or follow the next release."
          body="AGI Web is available now. The signed Linux x64 Desktop AppImage is offered only when the stable release API verifies it; unavailable platforms remain clearly labeled."
          ctas={[
            { href: WEB_CHAT_ENTRY_HREF, label: 'Use AGI Web' },
            { href: '#desktop-downloads', label: 'Desktop availability' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          stamp="Linux x64 · signed AppImage release channel"
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
