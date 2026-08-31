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
import { PROJECT_TEMPLATES, getProjectTemplate } from '@/features/projects/data/project-templates';
import { toUserMessage } from '@/lib/user-error-message';

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (project: Project) => void;
}

type SubmitState = 'idle' | 'submitting' | 'error';

export function CreateProjectDialog({ open, onOpenChange, onCreated }: CreateProjectDialogProps) {
  const router = useRouter();
  const addProject = useProjectStore((s) => s.addProject);

  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('blank');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && submitState !== 'submitting';

  useEffect(() => {
    if (open) {
      setName('');
      setTemplateId('blank');
      setSubmitState('idle');
      setErrorMsg(null);
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
      const template = getProjectTemplate(templateId);
      const project: Project = await webManagedCloudProjects.createProject({
        name: trimmedName,
        ...(template?.description ? { description: template.description } : {}),
        ...(template?.instructions ? { instructions: template.instructions } : {}),
      });

      addProject(project);

      onOpenChange(false);
      if (onCreated) {
        onCreated(project);
      } else {
        router.push(`/chat/projects/${project.id}`);
      }
    } catch (err) {
      setErrorMsg(toUserMessage(err, 'Something went wrong. Please try again.'));
      setSubmitState('error');
    }
  }, [addProject, canSubmit, onCreated, onOpenChange, router, trimmedName, templateId]);

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
              className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
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
              <p id={errorId} role="alert" className="text-xs text-danger">
                {errorMsg}
              </p>
            ) : null}
          </div>

          {/* Template picker. Selecting one fills the name field if the user has
              not typed their own, so the common path is: pick a template, press
              Enter. */}
          <fieldset className="mt-4">
            <legend className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Start from
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {PROJECT_TEMPLATES.map((template) => {
                const selected = template.id === templateId;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setTemplateId(template.id);
                      const suggestions = PROJECT_TEMPLATES.map((entry) => entry.name);
                      if (!name.trim() || suggestions.includes(name.trim())) {
                        setName(template.name);
                      }
                    }}
                    aria-pressed={selected}
                    title={template.summary}
                    disabled={submitState === 'submitting'}
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-xs transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border/60 text-muted-foreground hover:bg-muted/60',
                    )}
                  >
                    {template.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {getProjectTemplate(templateId)?.summary}
            </p>
          </fieldset>

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
