'use client';

/**
 * GreetingBanner · time-aware greeting with suggestion chips for the chat
 * empty state (rendered by ChatMessageList when messages.length === 0).
 *
 * Design:
 *   1. Sparkle icon · amber accent, small
 *   2. Greeting headline · serif display font, time-aware (morning / afternoon / evening)
 *   3. Subtext line · muted secondary copy
 *   4. Suggestion chips · pre-fill the composer text on click
 *
 * All colours come from --chat-* design tokens; no hardcoded hex values.
 */

import { Code2, Film, Image as ImageIcon, Monitor, PenLine, Search } from 'lucide-react';
import {
  QUICK_START_INTENTS,
  quickStartIntentLabel,
  quickStartIntentPrompt,
  type QuickStartIntent,
} from '@agiworkforce/types';
import { AgiMark } from '@shared/components/agi/AgiMark';
import { useGreeting } from './useGreeting';

interface SuggestionChip {
  label: string;
  prompt: string;
  icon: React.ReactNode;
}

/**
 * Icons are per-surface (they are React nodes); the labels and composer stems
 * come from the shared vocabulary so web, desktop and mobile stop introducing
 * the product with three different sets of starting points.
 *
 * Web PREFILLS rather than toggling a mode: its chat store is separate from
 * unified-chat's, so rendering desktop's mode-toggling QuickChips here would
 * flip a store this surface never reads — a chip that looks live and does
 * nothing. Shared words, surface-appropriate action.
 */
const INTENT_ICONS: Record<QuickStartIntent, React.ReactNode> = {
  code: <Code2 size={13} />,
  write: <PenLine size={13} />,
  research: <Search size={13} />,
  image: <ImageIcon size={13} />,
  video: <Film size={13} />,
  computer: <Monitor size={13} />,
};

const CHIPS: SuggestionChip[] = QUICK_START_INTENTS.map((intent) => ({
  label: quickStartIntentLabel(intent),
  prompt: quickStartIntentPrompt(intent),
  icon: INTENT_ICONS[intent],
}));

interface GreetingBannerProps {
  /** Called when the user clicks a suggestion chip. */
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

export function GreetingBanner({ onSendMessage, busy = false }: GreetingBannerProps) {
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

      {/* Suggestion chips */}
      {onSendMessage && (
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => onSendMessage(chip.prompt)}
              className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-full text-[13px] border transition-colors"
              style={{
                borderColor: 'var(--chat-border)',
                background: 'var(--chat-surface-base)',
                color: 'var(--chat-text-secondary)',
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget;
                el.style.background = 'var(--chat-surface-hover)';
                el.style.color = 'var(--chat-text-primary)';
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget;
                el.style.background = 'var(--chat-surface-base)';
                el.style.color = 'var(--chat-text-secondary)';
              }}
            >
              {chip.icon}
              {chip.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
