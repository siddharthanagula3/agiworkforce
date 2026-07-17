'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lightbulb, Smile } from 'lucide-react';
import {
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
} from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { useProjectStore } from '@features/projects/stores/project-store';
import type { Project } from '@features/projects/stores/project-store';
import { webManagedCloudProjects } from '@/features/projects/services/managed-cloud-projects';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When provided, the created project is handed to the caller INSTEAD of
   * navigating to /projects/[id] — used by the composer "Project or folder"
   * picker, where the user is mid-composition and must stay on /chat.
   */
  onCreated?: (project: Project) => void;
}

type SubmitState = 'idle' | 'submitting' | 'error';

export function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const router = useRouter();
  const addProject = useProjectStore((s) => s.addProject);

  const [name, setName] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && submitState !== 'submitting';

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setName('');
      setSubmitState('idle');
      setErrorMsg(null);
      // Autofocus the input after the dialog animation
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;

    setSubmitState('submitting');
    setErrorMsg(null);

    try {
      const project: Project = await webManagedCloudProjects.createProject({ name: trimmedName });

      // Merge into the store so the sidebar picks it up immediately
      addProject(project);

      // Close modal, then either hand the project to the caller (composer
      // picker flow) or navigate to the new project page (sidebar flow).
      onOpenChange(false);
      if (onCreated) {
        onCreated(project);
      } else {
        router.push(`/projects/${project.id}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitState('error');
    }
  }, [addProject, canSubmit, onCreated, onOpenChange, router, trimmedName]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (submitState === 'submitting' && !nextOpen) return;
      onOpenChange(nextOpen);
    },
    [onOpenChange, submitState],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && canSubmit) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [canSubmit, handleSubmit],
  );

  const errorId = errorMsg ? 'create-project-error' : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="w-[min(94vw,26rem)] overflow-hidden border-border/70 bg-background p-0 sm:rounded-2xl"
        closeLabel="Close create project dialog"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            Give your project a name to group chats, files, and custom instructions.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pb-5">
          {/* Title row */}
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Create project</h2>
          </div>

          {/* Project name input */}
          <div className="space-y-1.5">
            <Label
              htmlFor="create-project-name"
              className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
            >
              Project name
            </Label>

            {/* Input with a leading decorative icon. (Not a button — an emoji
                picker is not implemented, so a clickable no-op would be a dead
                control; this is a non-interactive affordance instead.) */}
            <div className="relative">
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2',
                  'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground',
                )}
              >
                <Smile className="h-4 w-4" />
              </span>
              <Input
                ref={inputRef}
                id="create-project-name"
                type="text"
                value={name}
                placeholder="Project name"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={submitState === 'submitting'}
                hasError={Boolean(errorMsg)}
                errorMessageId={errorId}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                onKeyDown={handleKeyDown}
                className="h-11 rounded-xl bg-muted/40 pl-10"
              />
            </div>

            {errorMsg ? (
              <p id={errorId} role="alert" className="text-xs text-destructive">
                {errorMsg}
              </p>
            ) : null}
          </div>

          {/* Tip box */}
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 px-4 py-3">
            <Lightbulb
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Projects keep chats, files, and custom instructions in one place. Use them for ongoing
              work, or just to keep things tidy.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border/60 px-6 py-4">
          <Button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            isLoading={submitState === 'submitting'}
            className="rounded-xl px-5"
          >
            Create project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
