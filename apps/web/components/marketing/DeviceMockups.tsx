/**
 * DeviceMockups · the one exact-size device system for marketing pages.
 *
 * Every illustrated device on the site renders from this file. Each device
 * type has ONE canonical design-space geometry (below, in design px) and
 * scales ONLY proportionally with its container — it never reflows,
 * stretches, or changes shape. Wide slots render the device at exactly its
 * design size; narrow slots render a smaller but identically-shaped copy.
 *
 * Shared chrome DNA across all window types: 44u title bar, 10u traffic
 * lights, mono title, uppercase amber badge pill. The scale unit `--u`
 * (one design pixel) is derived in CSS from the container width; geometry
 * numbers live only in DEVICE_GEOMETRY and flow to CSS via custom props.
 *
 * Strings mirror the shipped product UI (product screenshots 2026-06-11;
 * live web composer). Update them only to match the app.
 */
import Image from 'next/image';
import type { CSSProperties } from 'react';

export type DeviceType = 'desktop' | 'web' | 'chrome' | 'editor' | 'terminal' | 'panel' | 'phone';

/** Canonical design-space size per device type, in design px. */
export const DEVICE_GEOMETRY: Record<DeviceType, { width: number; height: number }> = {
  /** macOS-style app window, 3:2. */
  desktop: { width: 720, height: 480 },
  /** Browser window with the AGI Web chat, 16:10. */
  web: { width: 720, height: 450 },
  /** Full Chrome window (tabs + address bar) with the AGI side panel, 3:2. */
  chrome: { width: 720, height: 480 },
  /** VS Code window with the @agi panel, 16:10. */
  editor: { width: 720, height: 450 },
  /** macOS-style terminal window, 16:10. */
  terminal: { width: 640, height: 400 },
  /** Standalone browser side panel, portrait 10:13. */
  panel: { width: 400, height: 520 },
  /** Phone, 19.5:9. */
  phone: { width: 270, height: 585 },
};

export interface DeviceWindowProps {
  title?: string;
  badge?: string;
  className?: string;
}

function deviceStyle(type: DeviceType): CSSProperties {
  const { width, height } = DEVICE_GEOMETRY[type];
  return { '--dev-w': width, '--dev-h': height } as CSSProperties;
}

function DeviceRoot({
  type,
  label,
  className,
  children,
}: {
  type: DeviceType;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { width, height } = DEVICE_GEOMETRY[type];
  return (
    <figure
      className={['agi-dev', `agi-dev--${type}`, className].filter(Boolean).join(' ')}
      style={deviceStyle(type)}
      data-device={type}
      data-geometry={`${width}x${height}`}
      aria-label={label}
    >
      <div className="agi-dev-shell">{children}</div>
    </figure>
  );
}

function WindowBar({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="agi-dev-bar" aria-hidden="true">
      <span className="agi-dev-lights">
        <i />
        <i />
        <i />
      </span>
      <span className="agi-dev-title">{title}</span>
      {badge ? <span className="agi-dev-badge">{badge}</span> : null}
    </div>
  );
}

/** Page-context strip shared by the Chrome side panel and the panel card. */
function PageContextStrip() {
  return (
    <div className="agi-dev-pagestrip">
      <span className="agi-dev-pagestrip-icon">📄</span>
      <span className="agi-dev-pagestrip-text">
        <span className="agi-dev-pagestrip-title">Q3 Strategy Doc</span>
        <span className="agi-dev-pagestrip-meta">docs.google.com · 4,200 words selected</span>
      </span>
      <span className="agi-dev-pagestrip-badge">Context</span>
    </div>
  );
}

/** Side-panel composer shared by the Chrome side panel and the panel card. */
function PanelComposer() {
  return (
    <div className="agi-dev-panelcomposer">
      <span className="agi-dev-panelcomposer-row">
        <span className="agi-dev-panelcomposer-icon">📄</span>
        <span className="agi-dev-panelcomposer-ghost">
          <span className="agi-dev-type">Ask about this page…</span>
        </span>
        <span className="agi-dev-send">➤</span>
      </span>
      <span className="agi-dev-panelcomposer-foot">
        <span>Paired · Desktop bridge</span>
        <span>Local ∨</span>
      </span>
    </div>
  );
}

/* ─────────────────────── Desktop app window ─────────────────────── */

export function DesktopWindow({
  title = 'AGI Workforce',
  badge = 'Local',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot type="desktop" label={`${title} desktop app interface`} className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-desk" aria-hidden="true">
        <div className="agi-desk-side">
          <p className="agi-desk-brand">AGI</p>
          <p className="agi-desk-new">+ New chat</p>
          <p className="agi-desk-item">
            ⌕ Search <span className="agi-desk-kbd">⌘K</span>
          </p>
          <p className="agi-desk-item">▤ Projects</p>
          <p className="agi-desk-item">◇ Artifacts</p>
          <p className="agi-desk-item">↻ Scheduled</p>
          <p className="agi-desk-item">
            ⌁ Dispatch <span className="agi-desk-beta">Beta</span>
          </p>
          <p className="agi-desk-group">Recents</p>
          <p className="agi-desk-recent">Quarterly notes</p>
          <p className="agi-desk-recent">Rust build fix</p>
          <p className="agi-desk-foot">→ Sign in · Cloud sync</p>
        </div>
        <div className="agi-desk-main">
          <span className="agi-desk-mode">Local Mode</span>
          <p className="agi-desk-greet">What can I help with, Local?</p>
          <div className="agi-dev-composer">
            <span className="agi-dev-ghost">How can I help you today?</span>
            <span className="agi-dev-modelchip">Select model ▾</span>
          </div>
          <p className="agi-desk-hint">AI can make mistakes. Verify important information.</p>
        </div>
      </div>
    </DeviceRoot>
  );
}

/* ──────────────────── Browser window · AGI Web ──────────────────── */

export function WebWindow({
  title = 'agiworkforce.com/chat',
  badge = 'Web',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot type="web" label="The AGI Web chat interface" className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-web" aria-hidden="true">
        <div className="agi-web-rail">
          <span>›</span>
          <span>+</span>
          <span>⌕</span>
        </div>
        <div className="agi-web-canvas">
          <p className="agi-web-greet">How can I help?</p>
          <div className="agi-web-chips">
            <span>Web</span>
            <span>Academic</span>
            <span>Code</span>
            <span>Writing</span>
            <span>Deep Research</span>
            <span className="agi-web-chip--on">All</span>
          </div>
          <div className="agi-web-composer">
            <div className="agi-web-composer-main">
              <span className="agi-web-icon">⊕</span>
              <span className="agi-web-icon">🎙</span>
              <span className="agi-web-prompt">
                <span className="agi-dev-type">Ask me anything…</span>
                <span className="agi-dev-caret" />
              </span>
              <span className="agi-web-count">0 / 10000</span>
              <span className="agi-web-model">
                Auto (Best Value) <span className="agi-web-model-chevron">▾</span>
              </span>
              <span className="agi-dev-send agi-dev-send--lg">➤</span>
            </div>
            <div className="agi-web-composer-foot">
              <span>Enter to send · Shift+Enter for newline</span>
              <span className="agi-web-meter">
                <span className="agi-web-meter-bar" />0 / 128,000
              </span>
            </div>
          </div>
        </div>
      </div>
    </DeviceRoot>
  );
}

/* ─────────────── Full Chrome window with side panel ─────────────── */

export function ChromeWindow({ badge = 'Chrome', className }: DeviceWindowProps) {
  return (
    <DeviceRoot type="chrome" label="AGI Chrome extension interface" className={className}>
      <div className="agi-dev-bar agi-cr-tabbar" aria-hidden="true">
        <span className="agi-dev-lights">
          <i />
          <i />
          <i />
        </span>
        <span className="agi-cr-tabs">
          <span className="agi-cr-tab agi-cr-tab--on">
            <span className="agi-cr-tab-icon">📄</span>
            <span className="agi-cr-tab-label">Q3 Strategy · Google Docs</span>
          </span>
          <span className="agi-cr-tab">
            <span className="agi-cr-tab-icon">✦</span>
            <span className="agi-cr-tab-label">New Tab</span>
          </span>
          <span className="agi-cr-tab-add">+</span>
        </span>
        <span className="agi-dev-badge">{badge}</span>
      </div>
      <div className="agi-cr-addressbar" aria-hidden="true">
        <span className="agi-cr-nav">‹</span>
        <span className="agi-cr-nav">›</span>
        <span className="agi-cr-nav">↺</span>
        <span className="agi-cr-url">
          <span className="agi-cr-lock">🔒</span>
          docs.google.com/document/d/1xQ3Strategy…
        </span>
        <span className="agi-cr-ext">AGI</span>
      </div>
      <div className="agi-dev-body agi-cr-viewport" aria-hidden="true">
        <div className="agi-cr-page">
          <div className="agi-cr-doc-head">
            <span className="agi-cr-doc-icon">📄</span>
            <span className="agi-cr-doc-title">Q3 Strategy Document</span>
          </div>
          <div className="agi-cr-doc">
            <span className="agi-cr-line agi-cr-line--h1" />
            <span className="agi-cr-line" style={{ width: '94%' }} />
            <span className="agi-cr-line" style={{ width: '88%' }} />
            <span className="agi-cr-line" style={{ width: '97%' }} />
            <span className="agi-cr-line" style={{ width: '82%' }} />
            <span className="agi-cr-line" style={{ width: '91%' }} />
            <span className="agi-cr-gap" />
            <span className="agi-cr-line agi-cr-line--h2" />
            <span className="agi-cr-line" style={{ width: '89%' }} />
            <span className="agi-cr-line" style={{ width: '76%' }} />
            <span className="agi-cr-line agi-cr-line--sel" style={{ width: '93%' }} />
            <span className="agi-cr-line agi-cr-line--sel" style={{ width: '85%' }} />
            <span className="agi-cr-line agi-cr-line--sel" style={{ width: '91%' }} />
            <span className="agi-cr-line agi-cr-line--sel" style={{ width: '79%' }} />
            <span className="agi-cr-gap" />
            <span className="agi-cr-line agi-cr-line--h2" />
            <span className="agi-cr-line" style={{ width: '92%' }} />
            <span className="agi-cr-line" style={{ width: '86%' }} />
            <span className="agi-cr-line" style={{ width: '78%' }} />
          </div>
        </div>
        <div className="agi-cr-panel">
          <div className="agi-cr-panel-head">
            <span className="agi-cr-panel-logo">AGI</span>
            <span className="agi-cr-panel-mode">◆ Local</span>
          </div>
          <PageContextStrip />
          <div className="agi-cr-chat">
            <p className="agi-cr-msg agi-cr-msg--user">Summarise the key risks from this doc</p>
            <div className="agi-cr-msg agi-cr-msg--agi">
              <span className="agi-cr-agi-name">AGI</span>
              <p>
                Three risks stand out: market timing, dependency on a single cloud provider, and
                regulatory uncertainty in the EU…
              </p>
              <p className="agi-cr-msg-fade">Paired with AGI Desktop · Local mode</p>
            </div>
          </div>
          <PanelComposer />
        </div>
      </div>
    </DeviceRoot>
  );
}

/* ──────────────── Standalone side-panel card ─────────────── */

export function SidePanelCard({
  title = 'AGI · side panel',
  badge = 'Scoped',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot type="panel" label={`${title} interface`} className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-pn" aria-hidden="true">
        <PageContextStrip />
        <div className="agi-pn-main">
          <div className="agi-pn-chips">
            <span className="agi-pn-chip--on">This page</span>
            <span>/tldr</span>
            <span>/extract</span>
          </div>
          <p className="agi-pn-msg">Summarize this page</p>
          <p className="agi-pn-line agi-pn-line--ok">✓ Context captured · sent to Desktop</p>
          <p className="agi-pn-line agi-pn-line--dim">
            Paired bridge · permissions scoped to this task
          </p>
        </div>
        <PanelComposer />
      </div>
    </DeviceRoot>
  );
}

/* ─────────────── VS Code window with @agi panel ─────────────── */

export function EditorWindow({
  title = 'workspace.ts · AGI in VS Code',
  badge = 'VS Code',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot type="editor" label="AGI VS Code extension interface" className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-ed" aria-hidden="true">
        <div className="agi-ed-activity">
          <span>⊞</span>
          <span>⊘</span>
          <span className="agi-ed-act--on">◈</span>
          <span>⊙</span>
          <span>⊗</span>
          <span>⊕</span>
        </div>
        <div className="agi-ed-editor">
          <div className="agi-ed-code">
            <span className="agi-ed-ln">1</span>
            <span>
              <em className="agi-ed-kw">import</em>{' '}
              <span className="agi-ed-dim">
                {'{'} processChat, ChatConfig {'}'}
              </span>
            </span>
            <span className="agi-ed-ln">2</span>
            <span>
              <em className="agi-ed-kw">from</em> <span className="agi-ed-fn">'@agi/sdk'</span>
            </span>
            <span className="agi-ed-ln">3</span>
            <span className="agi-ed-dim">&nbsp;</span>
            <span className="agi-ed-ln">4</span>
            <span>
              <em className="agi-ed-kw">export async function</em>{' '}
              <span className="agi-ed-fn">runChat</span>
              <span className="agi-ed-dim">(</span>
            </span>
            <span className="agi-ed-ln">5</span>
            <span className="agi-ed-dim agi-ed-indent">
              config<span className="agi-ed-punc">:</span>{' '}
              <span className="agi-ed-type">ChatConfig</span>
            </span>
            <span className="agi-ed-ln">6</span>
            <span className="agi-ed-dim">
              {')'} <span className="agi-ed-punc">:</span>{' '}
              <span className="agi-ed-type">Promise</span>
              {'<string>'} {'{'}
            </span>
            <span className="agi-ed-ln">7</span>
            <span className="agi-ed-dim agi-ed-indent">
              <em className="agi-ed-kw">const</em> stream <span className="agi-ed-punc">=</span>
            </span>
            <span className="agi-ed-ln">8</span>
            <span className="agi-ed-dim agi-ed-indent">
              &nbsp;&nbsp;<span className="agi-ed-kw">await</span>{' '}
              <span className="agi-ed-fn">processChat</span>(config)
            </span>
            <span className="agi-ed-ln">9</span>
            <span className="agi-ed-dim agi-ed-indent">
              <em className="agi-ed-kw">return</em> stream.text()
            </span>
            <span className="agi-ed-ln">10</span>
            <span className="agi-ed-dim">{'}'}</span>
          </div>
        </div>
        <div className="agi-ed-panel">
          <div className="agi-ed-panel-head">
            <span className="agi-ed-panel-title">AGI</span>
            <span className="agi-ed-chip">@agi</span>
          </div>
          <div className="agi-ed-chat">
            <div className="agi-ed-msg">
              <span className="agi-ed-avatar">U</span>
              <p>@agi explain runChat and add error handling</p>
            </div>
            <div className="agi-ed-msg">
              <span className="agi-ed-avatar agi-ed-avatar--agi">A</span>
              <p>
                Streams a chat response from <code>processChat</code>. Add a <code>try/catch</code>{' '}
                around the stream call. Want me to write it?
              </p>
            </div>
          </div>
          <div className="agi-ed-input">
            <span className="agi-ed-chip">@agi</span>
            <span className="agi-dev-caret" />
          </div>
        </div>
      </div>
    </DeviceRoot>
  );
}

/* ──────────────────── Terminal window ─────────────────── */

export function TerminalWindow({
  title = 'agi · zsh',
  badge = 'sandboxed',
  className,
}: DeviceWindowProps) {
  return (
    <DeviceRoot type="terminal" label="AGI CLI interface" className={className}>
      <WindowBar title={title} badge={badge} />
      <div className="agi-dev-body agi-term" aria-hidden="true">
        <p className="agi-term-line agi-term-line--dim agi-term-strip">
          <span>
            AGI · <span className="agi-term-ok">local model</span> · ollama(local)
          </span>
          <span className="agi-term-hud">
            in 0 · out 0 · <span className="agi-term-ok">$0.0000</span> · ctx 0%
          </span>
        </p>
        <p className="agi-term-line">Welcome to AGI</p>
        <p className="agi-term-line agi-term-ok">● local · on-device &amp; private</p>
        <p className="agi-term-line agi-term-line--dim">
          Choose Local, BYOK, or Cloud with /model.
        </p>
        <p className="agi-term-line agi-term-line--dim">
          Type / for commands · Shift+Tab to switch modes
        </p>
        <p className="agi-term-line">
          <span className="agi-term-prompt">›</span> Message AGI…
          <span className="agi-term-caret" />
        </p>
        <p className="agi-term-line agi-term-line--dim">
          Default · local · effort:Medium · sandbox: seatbelt
        </p>
      </div>
    </DeviceRoot>
  );
}

/* ───────────────────────── Phone ───────────────────────── */

export function PhoneDevice({
  label = 'AGI Mobile interface',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <DeviceRoot type="phone" label={label} className={className}>
      <div className="agi-dev-body agi-ph" aria-hidden="true">
        <div className="agi-ph-status">
          <span className="agi-ph-time">11:10</span>
          <span className="agi-ph-signal">
            <i />
            <i />
            <i />
            <svg className="agi-ph-wifi" viewBox="0 0 14 10" fill="none">
              <path
                d="M1 8.5C2.8 5.5 5.2 4 7 4s4.2 1.5 6 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M3.5 8.5C4.8 6.8 5.8 6 7 6s2.2.8 3.5 2.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <circle cx="7" cy="9" r="1" fill="currentColor" />
            </svg>
            <svg className="agi-ph-battery" viewBox="0 0 22 11" fill="none">
              <rect
                x="0.5"
                y="0.5"
                width="18"
                height="10"
                rx="2.5"
                stroke="currentColor"
                strokeOpacity="0.35"
              />
              <rect x="1.5" y="1.5" width="14" height="8" rx="1.5" fill="currentColor" />
              <path d="M20 3.5v4a1.5 1.5 0 000-4z" fill="currentColor" fillOpacity="0.4" />
            </svg>
          </span>
        </div>
        <div className="agi-ph-nav">
          <span className="agi-ph-navbtn">☰</span>
          <span className="agi-ph-name">AGI</span>
          <span className="agi-ph-navbtn">✎</span>
        </div>
        <div className="agi-ph-main">
          <div className="agi-ph-toggle">
            <span className="agi-ph-toggle-btn agi-ph-toggle-btn--on">⊞ Local</span>
            <span className="agi-ph-toggle-btn">☁ Cloud</span>
          </div>
          <p className="agi-ph-greet">How can I help you tonight?</p>
          <p className="agi-ph-sub">
            Start privately on this device. Use the sidebar for recents and projects.
          </p>
        </div>
        <div className="agi-ph-composer-wrap">
          <div className="agi-ph-project">
            <span>⊟ No project</span>
            <span className="agi-ph-project-chevron">∨</span>
          </div>
          <div className="agi-ph-composer">
            <p className="agi-ph-ghost">What's on your mind?</p>
            <div className="agi-ph-composer-foot">
              <span className="agi-ph-attach">+</span>
              <span className="agi-ph-model">⊡ AGI Standard ∨</span>
              <span className="agi-ph-mic">🎙</span>
              <span className="agi-dev-send">➤</span>
            </div>
          </div>
        </div>
      </div>
    </DeviceRoot>
  );
}

/* ─────────────── Real-screenshot window (image mode) ─────────────── */

export interface DeviceImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export function ImageWindow({
  title,
  badge,
  image,
  className,
}: {
  title: string;
  badge?: string;
  image: DeviceImage;
  className?: string;
}) {
  return (
    <figure
      className={['agi-dev', 'agi-dev--image', className].filter(Boolean).join(' ')}
      style={deviceStyle('desktop')}
      data-device="image"
    >
      <div className="agi-dev-shell">
        <WindowBar title={title} badge={badge} />
        <Image
          src={image.src}
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="(min-width: 960px) 50vw, 100vw"
          className="agi-dev-image"
        />
      </div>
    </figure>
  );
}
