import { useState } from 'react';
import { ArrowUp, Pencil, X } from 'lucide-react';
import { useUiTranslation } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import { useFollowUpStore, type FollowUp } from '../queue/followUps';

export interface FollowUpQueueProps {
  conversationId: string | null;
  isStreaming: boolean;
  onEdit: (id: string, content: string) => void;
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
  className?: string;
}

const EMPTY: FollowUp[] = [];

const ICON_BUTTON = cn(
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
  'text-[var(--chat-text-secondary)] hover:bg-[var(--chat-surface-hover)] hover:text-[var(--chat-text-primary)]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]',
);

export function FollowUpQueue({
  conversationId,
  isStreaming,
  onEdit,
  onRemove,
  onSendNow,
  className,
}: FollowUpQueueProps) {
  const { t } = useUiTranslation('chat');
  const followUps = useFollowUpStore((state) =>
    conversationId ? (state.byConversation[conversationId] ?? EMPTY) : EMPTY,
  );
  const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);

  if (followUps.length === 0) return null;

  return (
    <section
      aria-label={t('followUps.label', 'Follow-up messages')}
      className={cn('mb-2 space-y-1', className)}
    >
      {followUps.map((followUp) => {
        const isEditing = editing?.id === followUp.id;
        const steering = followUp.state === 'steering';
        return (
          <div
            key={followUp.id}
            className="flex items-center gap-2 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-elevated)] px-3 py-1.5"
          >
            <span className="shrink-0 text-xs font-medium text-[var(--chat-text-secondary)]">
              {steering
                ? t('followUps.steering', 'Steering')
                : followUp.heldReason
                  ? t('followUps.notSent', 'Not sent')
                  : t('followUps.queued', 'Queued')}
            </span>
            {isEditing ? (
              <form
                className="flex min-w-0 flex-1 items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const draft = editing.draft.trim();
                  if (draft) onEdit(followUp.id, draft);
                  setEditing(null);
                }}
              >
                <input
                  autoFocus
                  aria-label={t('followUps.editLabel', 'Edit follow-up')}
                  value={editing.draft}
                  onChange={(event) => setEditing({ id: followUp.id, draft: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setEditing(null);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-[var(--chat-border)] bg-transparent px-2 py-1 text-sm text-[var(--chat-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chat-focus-ring)]"
                />
              </form>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--chat-text-primary)]">
                  {followUp.content}
                </p>
                {followUp.heldReason ? (
                  <p role="status" className="text-xs text-[var(--chat-text-secondary)]">
                    {followUp.heldReason}
                  </p>
                ) : null}
              </div>
            )}
            {!steering && !isEditing && (
              <button
                type="button"
                className={ICON_BUTTON}
                aria-label={t('followUps.edit', 'Edit')}
                onClick={() => setEditing({ id: followUp.id, draft: followUp.content })}
              >
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
            {!steering && !isStreaming && (
              <button
                type="button"
                className={ICON_BUTTON}
                aria-label={t('followUps.sendNow', 'Send now')}
                onClick={() => onSendNow(followUp.id)}
              >
                <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              className={ICON_BUTTON}
              aria-label={t('followUps.remove', 'Remove')}
              onClick={() => onRemove(followUp.id)}
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </section>
  );
}
