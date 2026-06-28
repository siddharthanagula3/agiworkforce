import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import { ProductFrame } from '../../components/marketing/ProductFrame';
import { DevBand, FinalCta, SurfaceIndex } from '../../components/marketing/FlagshipSections';
import { WaitlistTrigger } from '../../components/marketing/WaitlistModal';
import { LAUNCH } from '../../lib/marketing-constants';

const WEB_CHAT_ENTRY_HREF = '/login?redirectTo=%2Fchat';

export const metadata: Metadata = {
  title: 'Download AGI: Apps for Every Surface',
  description: `Get AGI on six surfaces: Web in the browser today, Desktop and CLI for Local and BYOK, Mobile with managed cloud (public alpha), plus Chrome and VS Code extensions. ${LAUNCH.publicLabel}.`,
  alternates: { canonical: 'https://agiworkforce.com/download' },
};

export default function DownloadPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-download-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <p className="agi-fl-eyebrow">Get AGI</p>
          <h1 id="agi-download-hero-title" className="agi-fl-h1">
            <span className="agi-fl-h1-line">Get AGI</span>
            <span className="agi-fl-h1-line">
              <em className="agi-fl-h1-em">everywhere you work.</em>
            </span>
          </h1>
          <p className="agi-fl-lede">
            AGI Web runs in your browser today. No install. Desktop and the CLI bring Local models
            and BYOK to your machine. Mobile starts in on-device Local Mode; managed cloud is public
            alpha. The Chrome and VS Code extensions meet you in the browser and the editor.
          </p>
          <div className="agi-fl-cta-row">
            <Link href={WEB_CHAT_ENTRY_HREF} className="agi-fl-cta agi-fl-cta--primary">
              Try AGI Web
            </Link>
            <Link href="/desktop" className="agi-fl-cta agi-fl-cta--secondary">
              See AGI Desktop
            </Link>
            <WaitlistTrigger
              label="Join Cloud Waitlist"
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
          title="Six surfaces, honestly labeled."
          lede="Each surface carries its real status: what runs in your browser today, what installs now, and what is in public alpha or developer preview. Nothing is marked available until it is."
          items={[
            {
              index: '01',
              name: 'AGI Web',
              tagline: 'No install. Start in the browser.',
              body: 'Hosted chat with projects, an artifact sidecar, web search, and shared conversations. Your account, waitlist status, and settings live here.',
              capabilities: [
                'Chat with projects & memory',
                'Artifact sidecar',
                'Web search',
                'Account & Cloud waitlist',
              ],
              platforms: 'Any modern browser',
              status: 'Available in browser',
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
              platforms: 'macOS · Windows · Linux',
              status: LAUNCH.publicLabel,
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
              status: 'Local + Cloud invite',
              href: '/mobile',
              frame: { variant: 'phone', title: 'AGI Mobile' },
            },
            {
              index: '04',
              name: 'AGI CLI',
              tagline: 'An agent in your terminal.',
              body: 'The agi binary is a Rust-native developer agent: sessions you can resume and fork, code review, and sandboxed execution. The CLI page carries the current install guide.',
              capabilities: [
                'Sessions, resume & fork',
                'Sandboxed execution',
                'Hooks, skills & MCP',
                'Offline with local models',
              ],
              platforms: 'macOS · Linux',
              status: 'Developer preview',
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
              status: 'Desktop-bridge scoped',
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
              status: 'Developer preview',
              href: '/vscode-extension',
              frame: { variant: 'editor', title: 'AGI · VS Code', badge: '@agi' },
            },
          ]}
        />

        <section className="agi-fl-section" aria-labelledby="agi-download-installers-title">
          <p className="agi-fl-eyebrow">Desktop installers</p>
          <h2 id="agi-download-installers-title" className="agi-fl-h2">
            Installers, as they become available.
          </h2>
          <p className="agi-fl-section-lede">
            AGI Desktop targets macOS, Windows, and Linux. Each platform&rsquo;s route opens from
            the Desktop page when release assets are available. No placeholder download links.
          </p>
          <table className="agi-ledger">
            <thead>
              <tr>
                <th>Platform</th>
                <th>What it installs</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>macOS</td>
                <td>Signed installer route opens when release assets are available</td>
                <td>
                  <Link href="/desktop" className="agi-cta-ghost">
                    Check Availability
                  </Link>
                </td>
              </tr>
              <tr>
                <td>Windows</td>
                <td>Installer route opens when release assets are available</td>
                <td>
                  <Link href="/desktop" className="agi-cta-ghost">
                    Check Availability
                  </Link>
                </td>
              </tr>
              <tr>
                <td>Linux</td>
                <td>AppImage or package route opens when release assets are available</td>
                <td>
                  <Link href="/desktop" className="agi-cta-ghost">
                    Check Availability
                  </Link>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <DevBand
          eyebrow="For developers"
          title="Install the developer surfaces."
          body="The AGI CLI ships as the agi binary in developer preview. The CLI page carries the current install guide and verified commands. The VS Code extension adds @agi chat, diff review, and slash commands to your editor."
          ctas={[
            { href: '/cli', label: 'Read the CLI Install Guide' },
            { href: '/vscode-extension', label: 'See the VS Code Extension' },
          ]}
        />

        <FinalCta
          eyebrow={LAUNCH.publicLabel}
          title="Pick a surface and go."
          body="Try AGI Web in the browser now. Follow the Desktop and CLI pages for Local and BYOK work as releases open. AGI managed cloud is in public alpha — open by default. The route your work takes stays visible on every surface."
          ctas={[
            { href: WEB_CHAT_ENTRY_HREF, label: 'Try AGI Web' },
            { href: '/desktop', label: 'See AGI Desktop' },
            { label: 'Join Cloud Waitlist', waitlist: true },
          ]}
          stamp={`Public launch · ${LAUNCH.date}`}
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
