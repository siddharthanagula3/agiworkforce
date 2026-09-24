import { useMemo } from 'react';
import { AgiMark } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import { resolveGreetingHeadline } from '../lib/greeting';

export interface BrandedGreetingProps {
  headline?: string;
  userName?: string | null;
  busy?: boolean;
  workspaceLabel?: string | null;
  onSelectWorkspace?: () => void;
  className?: string;
}

export function BrandedGreeting({
  headline,
  userName = null,
  busy = false,
  workspaceLabel = null,
  onSelectWorkspace,
  className,
}: BrandedGreetingProps) {
  const resolvedHeadline = useMemo(
    () => headline ?? resolveGreetingHeadline(new Date(), userName),
    [headline, userName],
  );
  const workspace = workspaceLabel?.trim() || null;

  return (
    <div
      className={cn(
        'flex w-full max-w-[760px] flex-col items-center gap-5 px-4 text-center',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full"
        role="presentation"
      >
        <AgiMark size={28} spinning={busy} />
      </div>

      <h1
        className="text-[28px] font-normal leading-[36px] tracking-tight"
        style={{
          color: 'var(--chat-text-primary)',
          fontFamily: 'var(--chat-font-display)',
        }}
        aria-label={workspace ? `What should we build in ${workspace}?` : undefined}
      >
        {workspace ? (
          <>
            What should we build in{' '}
            {onSelectWorkspace ? (
              <button
                type="button"
                onClick={onSelectWorkspace}
                className="rounded-sm underline decoration-[var(--chat-text-muted)] underline-offset-4 transition-colors hover:text-[var(--chat-accent-primary-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                aria-label={`Change workspace from ${workspace}`}
              >
                {workspace}
              </button>
            ) : (
              <span className="underline decoration-[var(--chat-text-muted)] underline-offset-4">
                {workspace}
              </span>
            )}
            ?
          </>
        ) : (
          resolvedHeadline
        )}
      </h1>
    </div>
  );
}
