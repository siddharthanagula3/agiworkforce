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

import { Code2, PenLine, GraduationCap, Coffee, Lightbulb } from 'lucide-react';
import { AgiSpark } from '@/components/agi/AgiSpark';
import { useGreeting } from './useGreeting';

interface SuggestionChip {
  label: string;
  prompt: string;
  icon: React.ReactNode;
}

const CHIPS: SuggestionChip[] = [
  {
    label: 'Code',
    prompt: 'Help me write code for ',
    icon: <Code2 size={13} />,
  },
  {
    label: 'Write',
    prompt: 'Help me write ',
    icon: <PenLine size={13} />,
  },
  {
    label: 'Learn',
    prompt: 'Help me learn about ',
    icon: <GraduationCap size={13} />,
  },
  {
    label: 'Life stuff',
    prompt: 'Help me with ',
    icon: <Coffee size={13} />,
  },
  {
    label: "AGI's pick",
    prompt: 'What should I focus on today? Give me an interesting challenge or idea to explore.',
    icon: <Lightbulb size={13} />,
  },
];

interface GreetingBannerProps {
  /** Called when the user clicks a suggestion chip. */
  onSendMessage?: (prompt: string) => void;
}

export function GreetingBanner({ onSendMessage }: GreetingBannerProps) {
  const { headline } = useGreeting();

  return (
    <div className="flex w-full max-w-[760px] flex-col items-center gap-5 px-4 text-center">
      {/* AGI brand mark */}
      <div
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full"
        role="presentation"
      >
        <AgiSpark size={30} />
      </div>

      {/* Time-aware headline */}
      <h1
        className="text-[28px] leading-[36px] font-normal tracking-tight"
        style={{
          color: 'var(--chat-text-primary)',
          fontFamily: 'var(--font-display)',
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
