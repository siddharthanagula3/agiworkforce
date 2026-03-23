import { useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import { getGreeting } from '../lib/greetings';
import { useSettingsStore } from '../stores/settingsStore';

interface EmptyStateProps {
  className?: string;
}

export function EmptyState({ className }: EmptyStateProps) {
  const nickname = useSettingsStore((s) => s.profile.nickname);

  // Generate greeting once on mount — ref ensures stable value across re-renders
  const greetingRef = useRef(getGreeting(nickname || undefined));
  const greeting = greetingRef.current;

  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-4',
        'animate-fade-in',
        className,
      )}
    >
      <Sparkles
        className="text-[var(--chat-accent-primary)]"
        style={{
          width: 32,
          height: 32,
          animation: 'spinner-pulse 3s ease-in-out infinite',
        }}
        aria-hidden
      />
      <p
        className="text-center font-normal text-[var(--chat-text-primary)]"
        style={{ fontSize: 28 }}
      >
        {greeting.text}
        {greeting.emoji && (
          <span className="ml-2" aria-hidden>
            {greeting.emoji}
          </span>
        )}
      </p>
    </div>
  );
}
