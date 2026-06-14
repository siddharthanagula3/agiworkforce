import Image from 'next/image';

/**
 * ProductFrame · CSS-drawn product chrome for marketing pages.
 *
 * One shared component for every surface visual on the site. When a real
 * screenshot exists, pass `image` and the frame renders it inside the same
 * chrome. Without one, each variant renders a faithful TEXT-BASED scene
 * using real strings from the shipped product (mobile + CLI screenshots,
 * 2026-06-11; web composer) · never abstract gray bars, never invented
 * feature states.
 */

export type ProductFrameVariant = 'desktop' | 'terminal' | 'phone' | 'browser' | 'editor' | 'web';

export interface ProductFrameImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface ProductFrameProps {
  variant: ProductFrameVariant;
  /** Title shown in the frame chrome (e.g. "AGI Desktop", "agi · zsh"). */
  title: string;
  /** Mono status label rendered in the chrome right corner (e.g. "Local"). */
  badge?: string;
  /** Real screenshot; replaces the scene when provided. */
  image?: ProductFrameImage;
  className?: string;
}

/** Mirrors the real AGI Desktop empty state (product screenshot 2026-06-11):
 *  sidebar with workspace nav + Recents + cloud sign-in, Local Mode pill,
 *  centered greeting, composer with model controls. */
function DesktopScene() {
  return (
    <div className="agi-frame-desk" aria-hidden="true">
      <div className="agi-frame-desk-side">
        <p className="agi-frame-desk-brand">AGI</p>
        <p className="agi-frame-desk-new">+ New chat</p>
        <p className="agi-frame-desk-item">
          ⌕ Search <span className="agi-frame-desk-kbd">⌘K</span>
        </p>
        <p className="agi-frame-desk-item">▤ Projects</p>
        <p className="agi-frame-desk-item">◇ Artifacts</p>
        <p className="agi-frame-desk-item">↻ Scheduled</p>
        <p className="agi-frame-desk-item">
          ⌁ Dispatch <span className="agi-frame-desk-beta">Beta</span>
        </p>
        <p className="agi-frame-desk-group">Recents</p>
        <p className="agi-frame-desk-recent">Quarterly notes</p>
        <p className="agi-frame-desk-recent">Rust build fix</p>
        <p className="agi-frame-desk-foot">→ Sign in · Cloud sync</p>
      </div>
      <div className="agi-frame-desk-main">
        <span className="agi-frame-desk-mode">Local Mode</span>
        <p className="agi-frame-desk-greet">What can I help with, Local?</p>
        <div className="agi-frame-scene-composer">
          <span className="agi-frame-scene-ghost">How can I help you today?</span>
          <span className="agi-frame-scene-model">Select model ▾</span>
        </div>
        <p className="agi-frame-desk-hint">AI can make mistakes. Verify important information.</p>
      </div>
    </div>
  );
}

/** Web chat: composer-first, mirrors the web app's empty state. */
function ChatScene() {
  return (
    <div className="agi-frame-scene" aria-hidden="true">
      <p className="agi-frame-scene-title">How can I help?</p>
      <div className="agi-frame-scene-chips">
        <span>Web</span>
        <span>Code</span>
        <span>Writing</span>
        <span className="agi-frame-scene-chip--on">All</span>
      </div>
      <div className="agi-frame-scene-composer">
        <span className="agi-frame-scene-ghost">Ask me anything…</span>
        <span className="agi-frame-scene-model">Auto ▾</span>
      </div>
    </div>
  );
}

/** Mirrors the real `agi` TUI (status strip, welcome, composer, footer). */
function TerminalScene() {
  return (
    <div className="agi-frame-term" aria-hidden="true">
      <p className="agi-frame-term-line agi-frame-term-line--dim agi-frame-term-line--strip">
        <span>
          AGI · <span className="agi-frame-term-line--ok">local model</span> · ollama(local)
        </span>
        <span className="agi-frame-term-hud">
          in 0 · out 0 · <span className="agi-frame-term-line--ok">$0.0000</span> · ctx 0%
        </span>
      </p>
      <p className="agi-frame-term-line">Welcome to AGI</p>
      <p className="agi-frame-term-line agi-frame-term-line--ok">
        ● local · on-device &amp; private
      </p>
      <p className="agi-frame-term-line agi-frame-term-line--dim">
        Choose Local, BYOK, or Cloud with /model.
      </p>
      <p className="agi-frame-term-line agi-frame-term-line--dim">
        Type / for commands · Shift+Tab to switch modes
      </p>
      <p className="agi-frame-term-line">
        <span className="agi-frame-term-prompt">›</span> Message AGI…
        <span className="agi-frame-term-caret" />
      </p>
      <p className="agi-frame-term-line agi-frame-term-line--dim">
        Default · local · effort:Medium · sandbox: seatbelt
      </p>
    </div>
  );
}

/** Mirrors the real mobile empty state (product screenshot strings). */
function PhoneScene() {
  return (
    <div className="agi-frame-scene agi-frame-scene--phone" aria-hidden="true">
      <div className="agi-frame-scene-toggle">
        <span className="agi-frame-scene-chip--on">◉ Local</span>
        <span>◌ Cloud</span>
      </div>
      <p className="agi-frame-scene-title">How can I help you tonight?</p>
      <p className="agi-frame-scene-sub">Start privately on this device.</p>
      <div className="agi-frame-scene-composer">
        <span className="agi-frame-scene-ghost">What&rsquo;s on your mind?</span>
        <span className="agi-frame-scene-model">AGI Standard ▾</span>
      </div>
    </div>
  );
}

/** Side panel reading a page on request (real extension flow). */
function BrowserScene() {
  return (
    <div className="agi-frame-scene" aria-hidden="true">
      <div className="agi-frame-scene-chips">
        <span className="agi-frame-scene-chip--on">This page</span>
        <span>/tldr</span>
        <span>/extract</span>
      </div>
      <p className="agi-frame-scene-line">Summarize this page</p>
      <p className="agi-frame-scene-line agi-frame-scene-line--ok">
        ✓ Context captured · sent to Desktop
      </p>
      <p className="agi-frame-scene-line agi-frame-scene-line--dim">
        Paired bridge · permissions scoped to this task
      </p>
    </div>
  );
}

/** Editor with @agi panel (real slash commands). */
function EditorScene() {
  return (
    <div className="agi-frame-scene" aria-hidden="true">
      <p className="agi-frame-scene-code">
        <span className="agi-frame-scene-line--dim">14</span> const res = await send(msg)
      </p>
      <p className="agi-frame-scene-code agi-frame-scene-code--add">
        <span className="agi-frame-scene-line--dim">15</span> render(res, {'{ stream: true }'})
      </p>
      <div className="agi-frame-scene-chips">
        <span className="agi-frame-scene-chip--on">@agi</span>
        <span>/explain</span>
        <span>/fix</span>
        <span>/tests</span>
      </div>
      <p className="agi-frame-scene-line agi-frame-scene-line--dim">
        Workspace-scoped · diffs reviewed before they land
      </p>
    </div>
  );
}

const SCENES: Record<ProductFrameVariant, () => React.ReactNode> = {
  desktop: DesktopScene,
  web: ChatScene,
  terminal: TerminalScene,
  phone: PhoneScene,
  browser: BrowserScene,
  editor: EditorScene,
};

export function ProductFrame({ variant, title, badge, image, className }: ProductFrameProps) {
  const Scene = SCENES[variant];
  const isPhone = variant === 'phone';

  return (
    <figure
      className={['agi-frame', `agi-frame--${variant}`, className].filter(Boolean).join(' ')}
      aria-label={image ? undefined : `${title} interface illustration`}
    >
      <div className="agi-frame-chrome" aria-hidden="true">
        {!isPhone && (
          <span className="agi-frame-lights">
            <i />
            <i />
            <i />
          </span>
        )}
        <span className="agi-frame-title">{title}</span>
        {badge ? <span className="agi-frame-badge">{badge}</span> : null}
      </div>
      <div className="agi-frame-screen">
        {image ? (
          <Image
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            sizes="(min-width: 960px) 50vw, 100vw"
            className="agi-frame-image"
          />
        ) : (
          <Scene />
        )}
      </div>
    </figure>
  );
}
