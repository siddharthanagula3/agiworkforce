'use client';

import { useChatStore } from '@shared/stores/web-chat-store';
import { selectWorkEscalation, useWorkEscalationStore, type WorkEscalation } from '../escalation';

const buttonClass =
  'min-h-8 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function reasonFor(escalation: WorkEscalation): string {
  return escalation.applied
    ? 'This is running as Work: it takes several steps, and you can watch each one.'
    : 'This looks like several steps of work. Running it as Work shows you the plan as it goes.';
}

/**
 * The visible half of automatic escalation. A turn must never change axis
 * silently, so the transition is announced where the answer appears and the
 * person can put it back in Chat from the same place.
 */
export function WorkEscalationNotice({ conversationId }: { conversationId: string | null }) {
  const escalation = useWorkEscalationStore(selectWorkEscalation(conversationId));
  const keepInChat = useWorkEscalationStore((state) => state.keepInChat);
  const markApplied = useWorkEscalationStore((state) => state.markApplied);
  const dismiss = useWorkEscalationStore((state) => state.dismiss);
  const setComposerToggles = useChatStore((state) => state.setComposerToggles);

  if (!escalation) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="my-2 flex flex-col gap-2 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: 'var(--settings-border)', background: 'var(--bg-elev)' }}
    >
      <div className="min-w-0">
        <p className="text-sm" style={{ color: 'var(--text-1)' }}>
          {escalation.applied ? 'Switched to Work' : 'Run this as Work?'}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--text-3)' }}>
          {reasonFor(escalation)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {escalation.applied ? null : (
          <button
            type="button"
            className={buttonClass}
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
            onClick={() => {
              setComposerToggles({ workMode: 'agiwork' }, conversationId);
              markApplied(conversationId);
            }}
          >
            Switch to Work
          </button>
        )}
        <button
          type="button"
          className={buttonClass}
          style={{ borderColor: 'var(--settings-border)', color: 'var(--text-1)' }}
          onClick={() => {
            setComposerToggles({ workMode: 'chat' }, conversationId);
            keepInChat(conversationId);
          }}
        >
          Keep this in Chat
        </button>
        {escalation.applied ? (
          <button
            type="button"
            className={buttonClass}
            aria-label="Dismiss the Work notice"
            style={{ borderColor: 'var(--settings-border)', color: 'var(--text-3)' }}
            onClick={() => dismiss(conversationId)}
          >
            Got it
          </button>
        ) : null}
      </div>
    </div>
  );
}
