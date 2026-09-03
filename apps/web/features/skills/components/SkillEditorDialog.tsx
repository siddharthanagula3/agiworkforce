'use client';

import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@agiworkforce/ui';
import {
  validateSkillDraft,
  SKILL_DRAFT_BODY_MAX_LENGTH,
  SKILL_DRAFT_DESCRIPTION_MAX_LENGTH,
  SKILL_DRAFT_NAME_MAX_LENGTH,
  type SkillDraft,
} from '@agiworkforce/skills/validation';

export interface SkillEditorInitialSkill {
  name: string;
  description: string;
  body: string;
}

export interface SkillEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initialSkill?: SkillEditorInitialSkill | null;
  bodyLoading?: boolean;
  bodyError?: string | null;
  submitting?: boolean;
  submitError?: string | null;
  onSubmit: (draft: SkillDraft) => Promise<void> | void;
}

const EMPTY_DRAFT: SkillDraft = { name: '', description: '', body: '' };

export function SkillEditorDialog({
  open,
  onOpenChange,
  mode,
  initialSkill = null,
  bodyLoading = false,
  bodyError = null,
  submitting = false,
  submitError = null,
  onSubmit,
}: SkillEditorDialogProps) {
  const [draft, setDraft] = useState<SkillDraft>(EMPTY_DRAFT);
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const descriptionId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (!open) return;
    setDraft(initialSkill ? { ...initialSkill } : EMPTY_DRAFT);
    setTouched(false);
  }, [open, initialSkill]);

  const validation = validateSkillDraft(draft);
  const showValidation = touched && !validation.ok;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!validation.ok) return;
    await onSubmit({
      name: draft.name.trim(),
      description: draft.description.trim(),
      body: draft.body.trim(),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'New skill' : 'Edit skill'}</DialogTitle>
          <DialogDescription>
            A skill is a set of instructions the model follows once your prompt matches its
            description.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={draft.name}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="release-notes"
              maxLength={SKILL_DRAFT_NAME_MAX_LENGTH}
              autoFocus={mode === 'create'}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={descriptionId}>Description</Label>
            <Textarea
              id={descriptionId}
              value={draft.description}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="What this does and when to use it. This is what matches your prompts to the skill."
              rows={2}
              maxLength={SKILL_DRAFT_DESCRIPTION_MAX_LENGTH}
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <Label htmlFor={bodyId}>Instructions</Label>
            {bodyLoading ? (
              <p className="text-xs text-muted-foreground">Loading current instructions…</p>
            ) : (
              <Textarea
                id={bodyId}
                value={draft.body}
                onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Step-by-step instructions the model follows when this skill is selected."
                rows={12}
                className="min-h-[220px] resize-y font-mono text-xs"
                spellCheck={false}
                maxLength={SKILL_DRAFT_BODY_MAX_LENGTH}
              />
            )}
            {bodyError ? (
              <p role="alert" className="text-xs text-danger">
                {bodyError}
              </p>
            ) : null}
          </div>
          {showValidation ? (
            <ul role="alert" className="list-disc space-y-1 pl-4 text-xs text-danger">
              {validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {submitError ? (
            <p role="alert" className="text-xs text-danger">
              {submitError}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || bodyLoading}>
              {submitting ? 'Saving…' : mode === 'create' ? 'Create skill' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
