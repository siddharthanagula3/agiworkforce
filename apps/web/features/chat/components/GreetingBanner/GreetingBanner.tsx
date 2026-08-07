'use client';

/**
 * GreetingBanner · time-aware greeting for the chat empty state (rendered by
 * ChatMessageList when messages.length === 0).
 *
 * Design:
 *   1. AGI brand mark
 *   2. Greeting headline · serif display font, time-aware (morning / afternoon / evening)
 *
 * The six quick-start suggestion chips were removed here and on mobile and
 * desktop (founder 2026-08-06): the empty state is the mark and the greeting,
 * nothing else.
 *
 * All colours come from --chat-* design tokens; no hardcoded hex values.
 */

import { AgiMark } from '@shared/components/agi/AgiMark';
import { useGreeting } from './useGreeting';

interface GreetingBannerProps {
  /**
   * Retained so callers need no change and a future empty-state action has a
   * hook; nothing in this component sends today.
   */
  onSendMessage?: (prompt: string) => void;
  /**
   * Whether a turn is actually in flight. The mark spins ONLY then.
   *
   * It previously span permanently on the idle empty state, where a
   * perpetual spinner reads as "still loading" — users waited for a screen
   * that had already finished. Rotation is the app's busy signal, so it has
   * to mean something.
   */
  busy?: boolean;
}

export function GreetingBanner({ busy = false }: GreetingBannerProps) {
  const { headline } = useGreeting();

  return (
    <div className="flex w-full max-w-[760px] flex-col items-center gap-5 px-4 text-center">
      {/* AGI brand mark */}
      <div
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full"
        role="presentation"
      >
        <AgiMark size={28} spinning={busy} />
      </div>

      {/* Time-aware headline */}
      <h1
        className="text-[28px] leading-[36px] font-normal tracking-tight"
        style={{
          color: 'var(--chat-text-primary)',
          // Reference `--font-newsreader` directly: next/font sets this variable
          // on <body> in app/layout.tsx, so it inherits reliably down to this
          // /chat h1. `--font-display` is a Tailwind `@theme` value that is not
          // guaranteed to be emitted to :root here, and an unresolved var() with
          // no fallback silently drops the whole font-family to the sans stack —
          // so the serif greeting would degrade. `--font-newsreader` + serif
          // fallbacks renders the display serif dependably.
          fontFamily: "var(--font-newsreader), Georgia, 'Times New Roman', serif",
        }}
      >
        {headline}
      </h1>

      {/* Suggestion chips were removed on every surface (founder 2026-08-06).
          The empty state is the brand mark and the greeting — nothing else. */}
    </div>
  );
}
