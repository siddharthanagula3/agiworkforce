import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '../../components/layout/Header';
import { MarketingFooter } from '../../components/marketing/MarketingFooter';
import {
  CapabilityGrid,
  FinalCta,
  TrustTriptych,
} from '../../components/marketing/FlagshipSections';
import { LedgerSection } from '../../components/marketing/LandingSections';
import { ProductFrame } from '../../components/marketing/ProductFrame';
import { WaitlistTrigger } from '../../components/marketing/WaitlistModal';
import { DesktopDownloadAvailability } from '../download/DesktopDownloadAvailability';

export const metadata = buildMetadata({
  title: 'AGI Desktop | Runs on Your Machine',
  description:
    'The native AGI app, built in Rust. Download the signed Linux x64 AppImage. macOS and Windows installers are not yet published. Run local models with Ollama and LM Studio.',
  path: '/desktop',
});

export default function DesktopPage() {
  return (
    <div data-design="agi">
      <main className="agi-shell">
        <Header />

        <section className="agi-fl-hero" aria-labelledby="agi-fl-desktop-hero-title">
          <div className="agi-fl-hero-backdrop" aria-hidden="true" />
          <div className="agi-fl-hero-split">
            <div className="agi-fl-hero-copy">
              <p className="agi-fl-eyebrow">AGI Desktop</p>
              <h1 id="agi-fl-desktop-hero-title" className="agi-fl-h1">
                <span className="agi-fl-h1-line">Runs on</span>
                <span className="agi-fl-h1-line">
                  <em className="agi-fl-h1-em">your machine.</em>
                </span>
              </h1>
              <p className="agi-fl-lede">
                The native app, built in Rust. Point it at Ollama or LM Studio and work offline.
                Chats live in SQLite on your disk. Keys never leave the machine.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="#desktop-downloads" className="agi-fl-cta agi-fl-cta--primary">
                  Check installer availability
                </Link>
                <Link href="/local" className="agi-fl-cta agi-fl-cta--secondary">
                  Run AGI Locally
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
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <ProductFrame variant="desktop" title="AGI Workforce" badge="Local" />
            </div>
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Capabilities"
          title="Everything lives here."
          items={[
            {
              meta: 'Local',
              title: 'Local Models',
              body: 'Ollama and LM Studio on your own hardware. Offline. No account.',
              href: '/local',
            },
            {
              meta: 'BYOK',
              title: 'Your Own Keys',
              body: 'Keys encrypted on your machine. Traffic goes straight to your provider.',
              href: '/byok',
            },
            {
              meta: 'Connectors',
              title: 'MCP Connectors',
              body: 'Pick from the gallery or add your own server. stdio, SSE, or HTTP.',
              href: '/apps',
            },
            {
              meta: 'Artifacts',
              title: 'Artifact Workbench',
              body: 'Documents, code, and previews take shape beside the chat.',
              href: '/features/artifacts',
            },
            {
              meta: 'AGI Work',
              title: 'Scheduled Work',
              body: 'Schedule recurring runs. Dispatch tasks. Built in.',
              href: '/agi-work',
            },
            {
              meta: 'Chat',
              title: 'Transparent Answers',
              body: 'Web sources, thinking, and effort, visible on each reply.',
              href: '/features/ai-chat',
            },
          ]}
        />

        <TrustTriptych
          eyebrow="Trust modes"
          title="No silent switches."
          lede="Desktop is where Local and BYOK live. Nothing moves between routes without a label and your consent."
          cards={[
            {
              mode: 'Local',
              glyph: '◆',
              title: 'Yours alone.',
              body: 'Models on your hardware. Works offline.',
              points: [
                'Local chats never silently leave your device',
                'Chats stored in SQLite on your disk',
                'No account required',
              ],
              cta: { href: '/local', label: 'Run AGI Locally' },
            },
            {
              mode: 'BYOK',
              glyph: '◇',
              title: 'Your keys, your bill.',
              body: 'Bring provider keys on Desktop and CLI.',
              points: [
                'Keys encrypted on your machine',
                'Traffic goes straight to your provider',
                'Provider label on every route',
              ],
              cta: { href: '/byok', label: 'Set Up BYOK' },
            },
            {
              mode: 'AGI Cloud',
              glyph: '●',
              title: 'Public alpha.',
              body: 'Hosted capacity, open by default.',
              points: [
                'Public alpha — sign in and start, no waitlist',
                'Separate from Local by design',
                'Usage metered and transparent',
              ],
              cta: { href: '/get-started', label: 'Get Started' },
            },
          ]}
        />

        <DesktopDownloadAvailability />

        <LedgerSection
          eyebrow="Specifications"
          title="What's inside."
          rows={[
            { k: 'Engine', v: 'Tauri 2 · Rust backend · React frontend' },
            { k: 'Modes', v: 'Local · BYOK · Cloud (public alpha)' },
            { k: 'Local runtimes', v: 'Ollama · LM Studio' },
            { k: 'BYOK keys', v: 'Encrypted at rest, on your machine' },
            { k: 'Storage', v: 'SQLite, local to your machine' },
            { k: 'Computer use', v: 'Browser · files · terminal · screen, with explicit consent' },
            { k: 'MCP transports', v: 'stdio · SSE · streamable HTTP' },
            { k: 'Skills', v: 'Markdown + frontmatter' },
            { k: 'Published installer', v: 'Linux x64 AppImage · signed stable channel' },
            { k: 'macOS & Windows', v: 'Installers not published · no release date announced' },
          ]}
        />

        <FinalCta
          eyebrow="Linux x64"
          title="Install AGI Desktop on Linux."
          body="The download control appears only when the stable release API verifies a signed Linux x64 AppImage. macOS and Windows installers are not published."
          ctas={[
            { href: '#desktop-downloads', label: 'Check installer availability' },
            { href: '/byok', label: 'Set Up BYOK' },
            { label: 'Team & Enterprise access', waitlist: true },
          ]}
          stamp="Linux x64 · signed AppImage release channel"
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
