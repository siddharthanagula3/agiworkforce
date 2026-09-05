import { buildMetadata } from '@/lib/seo/metadata';
import { Header } from '@shared/components/layout/Header';
import { DesktopWindow } from '@/features/marketing/components/DeviceMockups';
import {
  Button,
  ButtonRow,
  Eyebrow,
  Ledger,
  MarketingFooter,
  Prose,
  SurfaceStatus,
} from '@/features/marketing/components/system';
import { DESKTOP_LOCAL_RUNTIMES } from '@/lib/marketing-constants';
import { DesktopDownloadAvailability } from '../download/DesktopDownloadAvailability';

export const metadata = buildMetadata({
  title: 'AGI Desktop: the build with a process on your machine',
  description: `AGI Desktop is written in Rust and shipped as a Tauri 2 application, so it can do what a web page cannot: reach a local model server (${DESKTOP_LOCAL_RUNTIMES.label}), read the folders you allow, run tool commands inside an OS sandbox, and start MCP servers over stdio.`,
  path: '/desktop',
});

const WHY_NATIVE = [
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
] as const;

const SPEC_ROWS = [
  { label: 'Engine', value: 'Tauri 2 · Rust backend · React frontend' },
  { label: 'Ollama', value: 'http://localhost:11434' },
  { label: 'LM Studio', value: 'http://localhost:1234/v1' },
  { label: 'llama.cpp', value: 'http://localhost:8080/v1' },
  { label: 'vLLM', value: 'http://localhost:8000/v1' },
  { label: 'Shells', value: 'Zsh, Bash, Fish, Sh, PowerShell, Command Prompt, Git Bash, WSL' },
  { label: 'Sandbox', value: 'macOS Seatbelt, Linux bubblewrap' },
  { label: 'MCP transports', value: 'stdio, SSE, streamable HTTP' },
  { label: 'Provider keys', value: 'Encrypted with a key held by the OS credential store' },
  { label: 'Storage', value: 'SQLite on your own disk, encrypted at rest' },
] as const;

export default function DesktopPage() {
  return (
    <div data-design="agi" className="agi-ds-page">
      <Header />
      <main id="main-content">
        <section className="agi-lp-hero" aria-labelledby="agi-desktop-hero-title">
          <div className="agi-ds-container agi-lp-hero-grid">
            <div className="agi-lp-hero-copy">
              <Eyebrow>AGI Desktop</Eyebrow>
              <h1 className="agi-ds-h1" id="agi-desktop-hero-title">
                Some work cannot happen <em className="agi-ds-accent">in a browser tab.</em>
              </h1>
              <Prose size="lg">
                A web page cannot start a process on your computer, so it cannot run a shell, a
                sandboxed tool, an MCP server on disk, or a model on your own hardware. Desktop can,
                written in Rust and shipped as a Tauri 2 application.
              </Prose>
              <ButtonRow>
                <Button href="/download#desktop-downloads">Check installer availability</Button>
                <Button href="/local" variant="secondary">
                  How local mode works
                </Button>
              </ButtonRow>
            </div>
            <div className="agi-lp-hero-stage">
              <DesktopWindow />
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-desktop-status-title">
          <div className="agi-ds-container">
            <h2 className="agi-ds-h2" id="agi-desktop-status-title">
              Two binaries share the name Desktop today.
            </h2>
            <div className="agi-ds-stack" data-gap="loose" style={{ marginTop: '2rem' }}>
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
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-desktop-why-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Why a native app</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-desktop-why-title">
                Each of these needs a process running on your computer.
              </h2>
            </div>
            <div className="agi-ds-grid-2">
              {WHY_NATIVE.map((item) => (
                <div className="agi-ds-card" style={{ padding: '1.5rem' }} key={item.title}>
                  <Eyebrow>{item.meta}</Eyebrow>
                  <h3 className="agi-ds-h3">{item.title}</h3>
                  <Prose size="sm">{item.body}</Prose>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="agi-lp-section" aria-labelledby="agi-desktop-specs-title">
          <div className="agi-ds-container">
            <div className="agi-lp-heading">
              <Eyebrow>Specifications</Eyebrow>
              <h2 className="agi-ds-h2" id="agi-desktop-specs-title">
                The whole thing is ordinary local software.
              </h2>
            </div>
            <Ledger caption="Desktop specifications" rows={SPEC_ROWS} />
          </div>
        </section>

        <DesktopDownloadAvailability />

        <section className="agi-lp-close" aria-labelledby="agi-desktop-close-title">
          <div className="agi-ds-container">
            <div className="agi-lp-close-inner">
              <h2 className="agi-ds-h2" id="agi-desktop-close-title">
                The chats stay <em className="agi-ds-accent">in a database on your machine.</em>
              </h2>
              <Prose size="lg">
                Desktop keeps conversations, projects, and settings in a local SQLite database that
                is encrypted at rest, keyed from a per-install secret the operating system&rsquo;s
                own credential store holds. Installer verification and platform support live on the
                download page.
              </Prose>
              <ButtonRow>
                <Button href="/download#desktop-downloads">Check installer availability</Button>
                <Button href="/local" variant="secondary">
                  How local mode works
                </Button>
              </ButtonRow>
            </div>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
