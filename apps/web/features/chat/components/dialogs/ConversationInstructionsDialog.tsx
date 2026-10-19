'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@agiworkforce/ui';
import { CONVERSATION_INSTRUCTIONS_MAX_LENGTH } from '@agiworkforce/cloud-contracts';

const TITLE = 'Instructions for this chat';
const DESCRIPTION =
  'AGI follows these in every reply in this chat, on top of your account and project instructions. Other chats are not affected.';
const SAVE_FAILED = 'Your instructions were not saved. Try again.';

export interface ConversationInstructionsDialogProps {
  open: boolean;
  instructions: string;
  onOpenChange: (open: boolean) => void;
  onSave: (instructions: string) => Promise<boolean>;
}

export function ConversationInstructionsDialog({
  open,
  instructions,
  onOpenChange,
  onSave,
}: ConversationInstructionsDialogProps) {
  const [draft, setDraft] = useState(instructions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(instructions);
    setError(null);
  }, [open, instructions]);

  const unchanged = draft.trim() === instructions.trim();

  const save = async () => {
    setSaving(true);
    setError(null);
    const saved = await onSave(draft.trim()).catch(() => false);
    setSaving(false);
    if (saved) onOpenChange(false);
    else setError(SAVE_FAILED);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <DialogContent
        className="w-[min(94vw,32rem)] border-border/70 bg-background sm:rounded-2xl"
        closeLabel="Close chat instructions"
      >
        <DialogHeader>
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="conversation-instructions">Instructions</Label>
          <Textarea
            id="conversation-instructions"
            value={draft}
            maxLength={CONVERSATION_INSTRUCTIONS_MAX_LENGTH}
            rows={6}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="For example: answer in Spanish, and keep every reply under 150 words."
            className="resize-y"
          />
          <p className="text-xs text-muted-foreground">
            {draft.length} / {CONVERSATION_INSTRUCTIONS_MAX_LENGTH}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={unchanged} isLoading={saving}>
            {draft.trim() || !instructions.trim() ? 'Save' : 'Remove instructions'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
