import React, { useMemo } from 'react';
import { AgiMark } from '@agiworkforce/ui';
import { cn } from '../../lib/utils';
import { useUnifiedAuthStore, selectUser } from '../../stores/auth';

interface GreetingTemplate {
  headline: (name: string | null) => string;
  subline: string;
}

const MORNING_GREETINGS: GreetingTemplate[] = [
  {
    headline: (name) => (name ? `Good morning, ${name}` : 'Good morning'),
    subline: 'What are we accomplishing today?',
  },
  {
    headline: (name) => (name ? `Rise and shine, ${name}` : 'Rise and shine'),
    subline: 'Your AI workforce is ready to start the day.',
  },
];

const AFTERNOON_GREETINGS: GreetingTemplate[] = [
  {
    headline: (name) => (name ? `Good afternoon, ${name}` : 'Good afternoon'),
    subline: 'What can we get done?',
  },
  {
    headline: (name) => (name ? `Hi ${name}` : 'Hello'),
    subline: 'Your AI workforce is standing by.',
  },
];

const EVENING_GREETINGS: GreetingTemplate[] = [
  {
    headline: (name) => (name ? `Good evening, ${name}` : 'Good evening'),
    subline: 'Working late? Your workforce never sleeps.',
  },
  {
    headline: (name) => (name ? `Hi ${name}` : 'Hello'),
    subline: 'What shall we tackle tonight?',
  },
];

function getGreeting(name: string | null): { headline: string; subline: string } {
  const hour = new Date().getHours();

  let pool: GreetingTemplate[];
  if (hour >= 5 && hour < 12) {
    pool = MORNING_GREETINGS;
  } else if (hour >= 12 && hour < 18) {
    pool = AFTERNOON_GREETINGS;
  } else {
    pool = EVENING_GREETINGS;
  }

  const index = new Date().getMinutes() % pool.length;
  const template = pool[index] ?? pool[0]!;

  return {
    headline: template.headline(name),
    subline: template.subline,
  };
}

interface BrandedGreetingProps {
  className?: string;
  workspaceLabel?: string | null;
  onSelectWorkspace?: () => void;
}

export const BrandedGreeting: React.FC<BrandedGreetingProps> = ({
  className,
  workspaceLabel,
  onSelectWorkspace,
}) => {
  const user = useUnifiedAuthStore(selectUser);
  const firstName = useMemo(() => {
    if (!user?.name) return null;
    return user.name.split(' ')[0] ?? null;
  }, [user?.name]);

  const { headline, subline } = useMemo(() => getGreeting(firstName), [firstName]);
  const scopedWorkspace = workspaceLabel?.trim() || null;

  return (
    <div className={cn('flex flex-col items-center gap-3 text-center', className)}>
      {/* Animated brand icon. Token-driven like every sibling in the pane.
          the previous violet/indigo gradient existed nowhere in the chat
          palette and did not repaint under [data-chat-theme]. */}
      <div
        className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[var(--chat-accent-primary)]/12 border border-[var(--chat-accent-primary)]/20"
        aria-hidden="true"
      >
        <AgiMark size={24} spinning className="text-[var(--chat-accent-primary)]" />
      </div>

      {/* Headline, display serif, sized between web's 28px and Claude's ~40px
          so it still fits one line at the desktop content measure. */}
      <h1
        className="text-[32px] leading-[40px] font-normal tracking-[-0.01em] text-[var(--chat-text-primary)]"
        style={{ fontFamily: 'var(--chat-font-display)' }}
        aria-label={scopedWorkspace ? `What should we build in ${scopedWorkspace}?` : undefined}
      >
        {scopedWorkspace ? (
          <>
            What should we build in{' '}
            {onSelectWorkspace ? (
              <button
                type="button"
                onClick={onSelectWorkspace}
                className="rounded-sm underline decoration-[var(--chat-text-muted)] underline-offset-4 transition-colors hover:text-[var(--chat-accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
                aria-label={`Change workspace from ${scopedWorkspace}`}
              >
                {scopedWorkspace}
              </button>
            ) : (
              <span className="underline decoration-[var(--chat-text-muted)] underline-offset-4">
                {scopedWorkspace}
              </span>
            )}
            ?
          </>
        ) : (
          headline
        )}
      </h1>

      {/* Branded sub-tagline */}
      {!scopedWorkspace && (
        <p className="text-sm text-[var(--chat-text-secondary)] font-medium">{subline}</p>
      )}
    </div>
  );
};
