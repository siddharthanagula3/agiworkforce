'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@agiworkforce/ui';
import { useChatStore } from '@shared/stores/web-chat-store';
import type { OpenDraftConflict } from '../hooks/use-conversation-draft-sync';

export interface DraftConflictDialogProps {
  conflict: OpenDraftConflict | null;
  onResolve: (keep: 'mine' | 'theirs') => void;
  onClose: () => void;
}

function DraftVersion({
  heading,
  text,
  emptyLabel,
  testId,
}: {
  heading: string;
  text: string;
  emptyLabel: string;
  testId: string;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5" aria-label={heading} data-testid={testId}>
      <h3 className="text-xs font-medium text-muted-foreground">{heading}</h3>
      <div className="max-h-64 min-h-24 overflow-y-auto rounded-md border border-border bg-muted/40 p-3 text-sm">
        {text ? (
          <p className="whitespace-pre-wrap break-words text-foreground">{text}</p>
        ) : (
          <p className="text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}

export function DraftConflictDialog({ conflict, onResolve, onClose }: DraftConflictDialogProps) {
  const conversationId = conflict?.conversationId ?? null;
  const mine = useChatStore((state) =>
    conversationId ? (state.draftsByConversation[conversationId] ?? '') : '',
  );
  const title = useChatStore((state) =>
    conversationId
      ? state.conversations.find((conversation) => conversation.id === conversationId)?.title
      : undefined,
  );

  if (!conflict) return null;

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl" data-testid="draft-conflict-dialog">
        <DialogHeader>
          <DialogTitle>Choose which draft to keep</DialogTitle>
          <DialogDescription>
            {title ? `The unsent draft in "${title}"` : 'This unsent draft'} was changed on another
            device or tab after you started typing here. Keeping one replaces the other everywhere.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <DraftVersion
            heading="Here"
            text={mine}
            emptyLabel="Empty. You cleared this draft here."
            testId="draft-conflict-mine"
          />
          <DraftVersion
            heading="Elsewhere"
            text={conflict.theirs}
            emptyLabel="Empty. It was sent or cleared elsewhere."
            testId="draft-conflict-theirs"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onResolve('theirs')}>
            Use the other version
          </Button>
          <Button onClick={() => onResolve('mine')}>Keep this version</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
