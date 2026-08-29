import { buildMetadata } from '@/lib/seo/metadata';
import Link from 'next/link';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  CapabilityGrid,
  DevBand,
  FinalCta,
} from '@/features/marketing/components/FlagshipSections';
import { LedgerSection } from '@/features/marketing/components/LandingSections';
import { ProductFrame } from '@/features/marketing/components/ProductFrame';
import { DESKTOP_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import { DesktopDownloadAvailability } from '../download/DesktopDownloadAvailability';

export const metadata = buildMetadata({
  title: 'AGI Desktop | The Build With a Process on Your Machine',
  description: `AGI Desktop is written in Rust and shipped as a Tauri 2 application, so it can do what a web page cannot: reach a local model server (${DESKTOP_LOCAL_RUNTIMES.label}), read the folders you allow, run tool commands inside an OS sandbox, and start MCP servers over stdio.`,
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
                <span className="agi-fl-h1-line">
                  Some work <em className="agi-fl-h1-em">cannot</em>
                </span>{' '}
                <span className="agi-fl-h1-line">happen in a tab.</span>
              </h1>
              <p className="agi-fl-lede">
                A web page cannot start a process on your computer. That rules out a shell, a
                sandboxed run, an MCP server sitting on your disk, and a model answering from your
                own hardware. Desktop is the build with a process of its own, written in Rust and
                shipped as a Tauri 2 application.
              </p>
              <div className="agi-fl-cta-row">
                <Link href="/download#desktop-downloads" className="agi-fl-cta agi-fl-cta--primary">
                  See installer availability
                </Link>
                <Link href="/local" className="agi-fl-cta agi-fl-cta--secondary">
                  How Local mode works
                </Link>
              </div>
            </div>
            <div className="agi-fl-hero-visual agi-fl-hero-frame--main" aria-hidden="true">
              <ProductFrame variant="desktop" title="AGI Desktop" badge="Local" routeMode="local" />
            </div>
          </div>
        </section>

        <CapabilityGrid
          eyebrow="Why a native app"
          title="Each of these needs a process running on your computer."
          items={[
            {
              meta: 'Local models',
              title: 'Runtimes on your hardware',
              body: `Desktop talks to ${DESKTOP_LOCAL_RUNTIMES.label} on the ports they already listen on, and it can pull or remove an Ollama model without leaving the app.`,
              href: '/local',
            },
            {
              meta: 'Your files',
              title: 'Allowed Directories',
              body: 'A path outside the folders you added stops the run and opens an approval naming the exact directory. Protected system paths are refused outright.',
              href: '/features/tools',
            },
            {
              meta: 'Execution',
              title: 'An OS sandbox',
              body: 'Tool commands run under macOS Seatbelt or Linux bubblewrap. When a run needs the network switched off and neither is present, Desktop refuses to execute at all.',
              href: '/features/agents',
            },
            {
              meta: 'Connectors',
              title: 'MCP over stdio',
              body: 'A connector can be a program on your own disk, launched by the app and spoken to over stdio. SSE and streamable HTTP servers attach the same way.',
              href: '/features/plugins',
            },
          ]}
        />

        <DevBand
          eyebrow="Folder access"
          title="The first path outside your list stops the run."
          body="Desktop resolves every local path a tool asks for before that tool runs. Paths already inside your Allowed Directories go straight through. A path outside them raises this, naming the exact directory and the capability being asked for, and a protected system path is refused without a prompt at all."
          ctas={[{ href: '/features/tools', label: 'How the other tool gates work' }]}
          visual={
            <div className="agi-chat">
              <div className="agi-chat-header">
                <span className="agi-chat-model">file_read · read</span>
                <span className="agi-chat-meta">High risk · reversible</span>
              </div>
              <div className="agi-chat-body">
                <div className="agi-msg">
                  <p className="agi-msg-role">you</p>
                  <p className="agi-msg-text">
                    Read the specs in ~/work/handbook and summarize what changed.
                  </p>
                </div>
                <div className="agi-msg agi-msg-quiet">
                  <p className="agi-msg-role">Allow file read to access new folders</p>
                  <p className="agi-msg-text">
                    The agent requested local paths that are outside your current Allowed
                    Directories.
                  </p>
                </div>
                <div className="agi-msg agi-msg-quiet">
                  <p className="agi-msg-role">directories</p>
                  <p className="agi-msg-text">~/work/handbook</p>
                </div>
                <div className="agi-msg">
                  <p className="agi-msg-role">undo</p>
                  <p className="agi-msg-text">
                    Persistent folders can be removed in Settings → Allowed Directories.
                  </p>
                </div>
              </div>
            </div>
          }
        />

        <LedgerSection
          eyebrow="Specifications"
          title="The whole thing is ordinary local software."
          rows={[
            { k: 'Engine', v: 'Tauri 2 · Rust backend · React frontend' },
            { k: 'Ollama', v: 'http://localhost:11434' },
            { k: 'LM Studio', v: 'http://localhost:1234/v1' },
            { k: 'llama.cpp', v: 'http://localhost:8080/v1' },
            { k: 'vLLM', v: 'http://localhost:8000/v1' },
            {
              k: 'Shells',
              v: 'Zsh · Bash · Fish · Sh · PowerShell · Command Prompt · Git Bash · WSL',
            },
            { k: 'Sandbox', v: 'macOS Seatbelt · Linux bubblewrap' },
            { k: 'MCP transports', v: 'stdio · SSE · streamable HTTP' },
            { k: 'Provider keys', v: 'Encrypted with a key held by the OS credential store' },
            { k: 'Storage', v: 'SQLite on your own disk, encrypted at rest' },
          ]}
        />

        <DesktopDownloadAvailability />

        <FinalCta
          eyebrow="On your disk"
          title="The chats stay in a database on your machine."
          body="Desktop keeps conversations, projects, and settings in a local SQLite database that is encrypted at rest, keyed from a per-install secret the operating system's own credential store holds."
          ctas={[{ href: '/security', label: 'How the database is keyed' }]}
          stamp="Installer verification and platform support live on the download page"
        />

        <MarketingFooter />
      </main>
    </div>
  );
}
