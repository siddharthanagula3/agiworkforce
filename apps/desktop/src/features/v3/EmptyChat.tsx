import { BookOpen, Clock3, FilePlus2 } from 'lucide-react';
import { useChatStore } from '@agiworkforce/unified-chat';
import { BrandedGreeting } from '../chat/BrandedGreeting';
import { FirstRunChecklist, type FirstRunChecklistItem } from './FirstRunChecklist';

interface EmptyChatProps {
  workspaceLabel?: string | null;
  onSelectWorkspace?: () => void;
  onOpenScheduled?: () => void;
  onSetUpLocalModel?: () => void;
  needsLocalModelSetup?: boolean;
  onOpenConnectors?: () => void;
  hasConnectedTools?: boolean;
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
  onOpenConnectors,
  hasConnectedTools = false,
}: EmptyChatProps) {
  const setDraftContent = useChatStore((state) => state.setDraftContent);
  const blockedOnLocalModel = Boolean(onSetUpLocalModel) && needsLocalModelSetup;

  const checklistItems: FirstRunChecklistItem[] = [];
  if (onSelectWorkspace) {
    checklistItems.push({
      id: 'workspace',
      label: 'Choose a working folder',
      description: 'AGI reads and writes files here. You can change it any time.',
      done: Boolean(workspaceLabel),
      onAction: onSelectWorkspace,
    });
  }
  if (onSetUpLocalModel) {
    checklistItems.push({
      id: 'local-model',
      label: 'Set up a local model',
      description:
        'Start a local runtime and choose a downloaded model. Nothing is sent to AGI Cloud.',
      done: !needsLocalModelSetup,
      onAction: onSetUpLocalModel,
    });
  }
  if (onOpenConnectors) {
    checklistItems.push({
      id: 'connectors',
      label: 'Connect your tools',
      description: 'Give AGI access to the apps you already work in.',
      done: hasConnectedTools,
      onAction: onOpenConnectors,
    });
  }

  return (
    <div className="flex w-full flex-col items-center justify-center gap-7 px-6 pb-6">
      <BrandedGreeting workspaceLabel={workspaceLabel} onSelectWorkspace={onSelectWorkspace} />

      <FirstRunChecklist items={checklistItems} />

      {/* Starters compose a prompt for a model this session does not have yet, so
          they stay out until the Local setup step above is finished. */}
      {blockedOnLocalModel ? null : (
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
