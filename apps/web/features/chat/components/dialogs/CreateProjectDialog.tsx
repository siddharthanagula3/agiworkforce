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
  // Templates only pre-fill the create form. Nothing about the created project
  // is special-cased by template, so a template can never produce a project the
  // user could not have typed by hand.
  const [templateId, setTemplateId] = useState('blank');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && submitState !== 'submitting';

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setName('');
      setTemplateId('blank');
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
      const template = getProjectTemplate(templateId);
      const project: Project = await webManagedCloudProjects.createProject({
        name: trimmedName,
        // Only send what the template actually carries. An empty-string
        // description on the Blank template would overwrite nothing, but it
        // would also make every project carry a meaningless empty field.
        ...(template?.description ? { description: template.description } : {}),
        ...(template?.instructions ? { instructions: template.instructions } : {}),
      });

      // Merge into the store so the sidebar picks it up immediately
      addProject(project);

      // Close modal, then either hand the project to the caller (composer
      // picker flow) or navigate to the new project page (sidebar flow).
      onOpenChange(false);
      if (onCreated) {
        onCreated(project);
      } else {
        router.push(`/chat/projects/${project.id}`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
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

          {/* Template picker. Selecting one fills the name field if the user has
              not typed their own, so the common path is: pick a template, press
              Enter. */}
          <fieldset className="mt-4">
            <legend className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                      // Fill the name only when the field is untouched or still
                      // holds another template's suggestion — never clobber
                      // something the user typed.
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
