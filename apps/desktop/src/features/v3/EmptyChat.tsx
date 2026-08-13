/**
 * v3 empty-chat surface.
 *
 * Renders the workspace-aware greeting and capability-shaped starters in the
 * empty chat content area. Height is deliberately intrinsic, not `h-full`:
 * ChatInterface centres the greeting + composer as one group in the empty
 * state, and an `h-full` slot would re-open the dead gap between them.
 */
import { BookOpen, Clock3, Download, FilePlus2 } from 'lucide-react';
import { useChatStore } from '@agiworkforce/unified-chat';
import { BrandedGreeting } from '../chat/BrandedGreeting';

interface EmptyChatProps {
  workspaceLabel?: string | null;
  onSelectWorkspace?: () => void;
  onOpenScheduled?: () => void;
  onSetUpLocalModel?: () => void;
  needsLocalModelSetup?: boolean;
}

const STARTERS = [
  {
    label: 'Create a file or build a site',
    prompt: 'Create a file or build a site that ',
    icon: FilePlus2,
  },
  {
    label: 'Research and plan next steps',
    prompt: 'Research this topic and plan the next steps: ',
    icon: BookOpen,
  },
] as const;

export function EmptyChat({
  workspaceLabel,
  onSelectWorkspace,
  onOpenScheduled,
  onSetUpLocalModel,
  needsLocalModelSetup = false,
}: EmptyChatProps) {
  const setDraftContent = useChatStore((state) => state.setDraftContent);
  const showLocalModelSetup = Boolean(onSetUpLocalModel) && needsLocalModelSetup;

  return (
    <div className="flex w-full flex-col items-center justify-center gap-7 px-6 pb-6">
      <BrandedGreeting workspaceLabel={workspaceLabel} onSelectWorkspace={onSelectWorkspace} />

      {showLocalModelSetup ? (
        <button
          type="button"
          onClick={onSetUpLocalModel}
          aria-label="Set up a local model"
          className="group flex w-full max-w-[760px] items-center gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-4 py-3 text-left transition-colors hover:border-[var(--chat-accent-primary)]/35 hover:bg-[var(--chat-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--chat-accent-primary)]/10 text-[var(--chat-accent-primary)]">
            <Download className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-[var(--chat-text-primary)]">
              Set up a local model
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-[var(--chat-text-muted)]">
              Start a local runtime and choose a downloaded model. Nothing is sent to AGI Cloud.
            </span>
          </span>
        </button>
      ) : (
        <div
          className="grid w-full max-w-[760px] grid-cols-1 gap-2 sm:grid-cols-3"
          aria-label="Start something"
        >
          {STARTERS.map(({ label, prompt, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setDraftContent(prompt)}
              className="group flex min-h-20 items-start gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-4 py-3 text-left text-sm text-[var(--chat-text-secondary)] transition-colors hover:border-[var(--chat-accent-primary)]/35 hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
            >
              <Icon
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chat-accent-primary)]"
                aria-hidden="true"
              />
              <span className="font-medium leading-5">{label}</span>
            </button>
          ))}

          {onOpenScheduled && (
            <button
              type="button"
              onClick={onOpenScheduled}
              className="group flex min-h-20 items-start gap-3 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-base)] px-4 py-3 text-left text-sm text-[var(--chat-text-secondary)] transition-colors hover:border-[var(--chat-accent-primary)]/35 hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-accent-primary)]"
            >
              <Clock3
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--chat-accent-primary)]"
                aria-hidden="true"
              />
              <span className="font-medium leading-5">Automate routine and recurring work</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
