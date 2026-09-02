import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { MarketingFooter } from '@/features/marketing/components/MarketingFooter';
import {
  Eyebrow,
  Ledger,
  Prose,
  Section,
  Stack,
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { FactGrid, PageHero } from '@/features/marketing/components/pages/surfaces/shared';
import { DESKTOP_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import { DesktopDownloadAvailability } from '../download/DesktopDownloadAvailability';

export const metadata = buildMetadata({
  title: 'AGI Desktop: the build with a process on your machine',
  description: `AGI Desktop is written in Rust and shipped as a Tauri 2 application, so it can do what a web page cannot: reach a local model server (${DESKTOP_LOCAL_RUNTIMES.label}), read the folders you allow, run tool commands inside an OS sandbox, and start MCP servers over stdio.`,
  path: '/desktop',
});

export default function DesktopPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <PageHero
          id="agi-desktop-hero-title"
          eyebrow="AGI Desktop"
          title="Some work cannot happen in a browser tab."
          lede="A web page cannot start a process on your computer. That rules out a shell, a sandboxed run, an MCP server sitting on your disk, and a model answering from your own hardware. Desktop is the build with a process of its own, written in Rust and shipped as a Tauri 2 application."
          ctas={[
            { href: '/download#desktop-downloads', label: 'Check installer availability' },
            { href: '/local', label: 'How local mode works', variant: 'secondary' },
          ]}
        />

        <Section id="desktop-status" labelledBy="agi-desktop-status-title" rule>
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-desktop-status-title">
              Two binaries share the name Desktop today.
            </h2>
            <SurfaceStatus
              state="pending"
              name="AGI Desktop (Rust, local models and BYOK)"
              blockedOn="A Linux x86_64 build exists as a release artifact and is pending its signature check. Windows has no installer and no announced date."
            />
            <SurfaceStatus
              state="pending"
              name="AGI Cloud (macOS, cloud accounts only)"
              blockedOn="A separate Electron shell, not the app on this page. It holds no local models and accepts no provider key, and ships once a signed macOS build is published."
            />
          </Stack>
        </Section>

        <Section id="why-native" labelledBy="agi-desktop-why-title" rule ground="2">
          <Stack gap="loose">
            <div>
              <Eyebrow>Why a native app</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-desktop-why-title">
                Each of these needs a process running on your computer.
              </h2>
            </div>
            <FactGrid
              items={[
                {
                  meta: 'Local models',
                  title: 'Runtimes on your hardware',
                  body: `Desktop talks to ${DESKTOP_LOCAL_RUNTIMES.label} on the ports they already listen on, and it can pull or remove an Ollama model without leaving the app.`,
                },
                {
                  meta: 'Your files',
                  title: 'Allowed directories',
                  body: 'A path outside the folders you added stops the run and opens an approval naming the exact directory. Protected system paths are refused outright.',
                },
                {
                  meta: 'Execution',
                  title: 'An OS sandbox',
                  body: 'Tool commands run under macOS Seatbelt or Linux bubblewrap. When a run needs the network switched off and neither is present, Desktop refuses to execute at all.',
                },
                {
                  meta: 'Connectors',
                  title: 'MCP over stdio',
                  body: 'A connector can be a program on your own disk, launched by the app and spoken to over stdio. SSE and streamable HTTP servers attach the same way.',
                },
              ]}
            />
          </Stack>
        </Section>

        <Section id="specs" labelledBy="agi-desktop-specs-title" rule>
          <Stack gap="loose">
            <div>
              <Eyebrow>Specifications</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-desktop-specs-title">
                The whole thing is ordinary local software.
              </h2>
            </div>
            <Ledger
              caption="Desktop specifications"
              rows={[
                { label: 'Engine', value: 'Tauri 2 · Rust backend · React frontend' },
                { label: 'Ollama', value: 'http://localhost:11434' },
                { label: 'LM Studio', value: 'http://localhost:1234/v1' },
                { label: 'llama.cpp', value: 'http://localhost:8080/v1' },
                { label: 'vLLM', value: 'http://localhost:8000/v1' },
                {
                  label: 'Shells',
                  value: 'Zsh, Bash, Fish, Sh, PowerShell, Command Prompt, Git Bash, WSL',
                },
                { label: 'Sandbox', value: 'macOS Seatbelt, Linux bubblewrap' },
                { label: 'MCP transports', value: 'stdio, SSE, streamable HTTP' },
                {
                  label: 'Provider keys',
                  value: 'Encrypted with a key held by the OS credential store',
                },
                { label: 'Storage', value: 'SQLite on your own disk, encrypted at rest' },
              ]}
            />
          </Stack>
        </Section>

        <DesktopDownloadAvailability />

        <Section id="desktop-close" labelledBy="agi-desktop-close-title" rule ground="2">
          <Stack gap="loose">
            <h2 className="agi-ds-h2" id="agi-desktop-close-title">
              The chats stay in a database on your machine.
            </h2>
            <Prose>
              Desktop keeps conversations, projects, and settings in a local SQLite database that is
              encrypted at rest, keyed from a per-install secret the operating system&rsquo;s own
              credential store holds. Installer verification and platform support live on the
              download page.
            </Prose>
          </Stack>
        </Section>
      </main>
      <MarketingFooter />
    </div>
  );
}
