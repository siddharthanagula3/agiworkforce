'use client';

import { AgiMark } from '@shared/components/agi/AgiMark';
import { useGreeting } from './useGreeting';

interface GreetingBannerProps {
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
          fontFamily: "var(--font-newsreader), Georgia, 'Times New Roman', serif",
        }}
      >
        {headline}
      </h1>

      {/* Suggestion chips were removed on every surface (founder 2026-08-06).
          The empty state is the brand mark and the greeting — nothing else.
          The `onSendMessage` prop went with them: two callers were still
          threading a handler into a component that had stopped reading it. */}
    </div>
  );
}
