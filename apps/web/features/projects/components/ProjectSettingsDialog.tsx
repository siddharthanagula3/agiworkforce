'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { isImeComposingKey } from '@agiworkforce/ui/ime-composition';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Textarea,
  useConfirmAction,
  useUnsavedChangesGuard,
} from '@agiworkforce/ui';
import { Label, translateUiPlural } from '@agiworkforce/ui';
import { Copy, Download, Smile, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { webManagedCloudProjects } from '@/features/projects/services/managed-cloud-projects';
import { KnowledgeFilesPanel } from './KnowledgeFilesPanel';
import { ProjectMemoryPanel } from './ProjectMemoryPanel';
import { ProjectDefaultModelField } from './ProjectDefaultModelField';
import { ProjectChatDefaultsField } from './ProjectChatDefaultsField';
import { sameProjectChatDefaults } from '@/features/projects/lib/project-chat-defaults';
import type { Project } from '@features/projects/stores/project-store';
import { toUserMessage } from '@/lib/user-error-message';
import {
  PROJECT_DESCRIPTION_MAX_LENGTH,
  PROJECT_INSTRUCTIONS_MAX_LENGTH,
} from '@agiworkforce/cloud-contracts';

export interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onUpdate: (
    id: string,
    updates: Partial<
      Pick<Project, 'name' | 'description' | 'instructions' | 'color' | 'iconEmoji'>
    >,
  ) => void;
  onDelete: (id: string) => void;
  onDuplicated?: () => void;
}

export function ProjectSettingsDialog(props: ProjectSettingsDialogProps) {
  // Each opening owns its draft and receipts, even when a parent keeps this
  // wrapper mounted while closed or replaces its target project.
  return props.open ? <ProjectSettingsSession key={props.project.id} {...props} /> : null;
}

function ProjectSettingsSession({
  open,
  onOpenChange,
  project: initialProject,
  onUpdate,
  onDelete,
  onDuplicated,
}: ProjectSettingsDialogProps) {
  // Parent refreshes must not overwrite the draft in an already-open dialog.
  const [project] = useState(initialProject);
  const lifetime = useRef(0);
  const mounted = useRef(false);
  const savePending = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      lifetime.current += 1;
      savePending.current = false;
    };
  }, []);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [instructions, setInstructions] = useState(project.instructions ?? '');
  const [usesGlobalMemory, setUsesGlobalMemory] = useState(project.usesGlobalMemory !== false);
  const [usesAccountInstructions, setUsesAccountInstructions] = useState(
    project.usesAccountInstructions !== false,
  );
  const [usesAccountStyle, setUsesAccountStyle] = useState(project.usesAccountStyle !== false);
  const [defaultModelId, setDefaultModelId] = useState(project.defaultModelId ?? null);
  const [chatDefaults, setChatDefaults] = useState(project.chatDefaults ?? {});
  const [isSaving, setIsSaving] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const resetFields = useCallback(() => {
    setName(project.name);
    setDescription(project.description ?? '');
    setInstructions(project.instructions ?? '');
    setUsesGlobalMemory(project.usesGlobalMemory !== false);
    setUsesAccountInstructions(project.usesAccountInstructions !== false);
    setUsesAccountStyle(project.usesAccountStyle !== false);
    setDefaultModelId(project.defaultModelId ?? null);
    setChatDefaults(project.chatDefaults ?? {});
  }, [
    project.name,
    project.description,
    project.instructions,
    project.usesGlobalMemory,
    project.usesAccountInstructions,
    project.usesAccountStyle,
    project.defaultModelId,
    project.chatDefaults,
  ]);

  const dirty =
    open &&
    (name !== project.name ||
      description !== (project.description ?? '') ||
      instructions !== (project.instructions ?? '') ||
      usesGlobalMemory !== (project.usesGlobalMemory !== false) ||
      usesAccountInstructions !== (project.usesAccountInstructions !== false) ||
      usesAccountStyle !== (project.usesAccountStyle !== false) ||
      defaultModelId !== (project.defaultModelId ?? null) ||
      !sameProjectChatDefaults(chatDefaults, project.chatDefaults));
  const { confirmDiscard, dialog: discardDialog } = useUnsavedChangesGuard({
    dirty,
    description:
      'Your changes to this project have not been saved. If you leave now, they will be lost.',
    onDiscard: resetFields,
  });

  const handleOpenChange = (next: boolean) => {
    if (savePending.current) return;
    if (next) {
      onOpenChange(true);
      return;
    }
    confirmDiscard(() => onOpenChange(false));
  };

  const [isDuplicating, setIsDuplicating] = useState(false);

  const handleDuplicate = async () => {
    setIsDuplicating(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/duplicate`, {
        method: 'POST',
        headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? 'Could not duplicate the project.');
      }
      const { copiedKnowledgeFiles } = (await response.json()) as {
        copiedKnowledgeFiles?: number;
      };
      toast.success(
        copiedKnowledgeFiles
          ? translateUiPlural('common', 'counts.projectDuplicatedFiles', copiedKnowledgeFiles, {
              one: 'Project duplicated with {{count}} file.',
              other: 'Project duplicated with {{count}} files.',
            })
          : 'Project duplicated.',
      );
      onDuplicated?.();
    } catch (error) {
      toast.error(toUserMessage(error, 'Could not duplicate the project.'));
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleSave = async () => {
    if (!mounted.current || savePending.current) return;
    if (!name.trim()) {
      toast.error('Project name is required');
      return;
    }
    const trimmedDescription = description.trim();
    const updates = {
      name: name.trim(),
      instructions: instructions.trim() || null,
      usesGlobalMemory,
      usesAccountInstructions,
      usesAccountStyle,
      defaultModelId,
      ...(sameProjectChatDefaults(chatDefaults, project.chatDefaults) ? {} : { chatDefaults }),
    };
    savePending.current = true;
    const owner = lifetime.current;
    setIsSaving(true);
    try {
      await webManagedCloudProjects.updateProject(project.id, {
        ...updates,
        description: trimmedDescription || null,
      });

      if (owner !== lifetime.current) return;
      onUpdate(project.id, {
        ...updates,
        instructions: updates.instructions ?? undefined,
        description: trimmedDescription || undefined,
      });
      toast.success('Project updated');
      onOpenChange(false);
    } catch (error) {
      if (owner !== lifetime.current) return;
      toast.error(toUserMessage(error, 'Failed to update project'));
    } finally {
      if (owner === lifetime.current) {
        savePending.current = false;
        setIsSaving(false);
      }
    }
  };

  const handleDelete = async () => {
    try {
      await webManagedCloudProjects.deleteProject(project.id);

      onDelete(project.id);
      onOpenChange(false);
      toast.success('Project deleted');
    } catch (error) {
      toast.error(toUserMessage(error, 'Failed to delete project'));
    }
  };

  const isHealthSpace = project.space === 'health';
  const requestDelete = () =>
    confirm({
      title: isHealthSpace ? 'Delete Health?' : 'Delete project?',
      description: isHealthSpace
        ? 'Health, its chats, its files and its memories will be permanently deleted, including the uploaded file contents. Connected health records stay connected until you disconnect them. This action cannot be undone.'
        : `“${project.name}” and its knowledge files will be permanently deleted, including the uploaded file contents. Conversations in this project will be moved to “All Chats”. This action cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: handleDelete,
    });

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 sm:max-w-lg">
          {/* Header */}
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-5">
            <DialogTitle className="text-base font-semibold">Project settings</DialogTitle>
            <DialogDescription className="sr-only">
              Rename the project, update its instructions and knowledge files, or delete it.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <fieldset disabled={isSaving} className="min-w-0 space-y-5 border-0 p-0">
              {/* Project name with emoji affordance */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="ps-project-name"
                  className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Project name
                </Label>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute start-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground"
                  >
                    {project.iconEmoji ? (
                      <span className="text-base leading-none">{project.iconEmoji}</span>
                    ) : (
                      <Smile className="h-4 w-4" aria-hidden="true" />
                    )}
                  </span>
                  <Input
                    id="ps-project-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Project name"
                    autoComplete="off"
                    maxLength={100}
                    className="h-11 rounded-xl bg-muted/40 ps-10"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isImeComposingKey(e.nativeEvent)) void handleSave();
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="ps-description"
                  className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Description
                </Label>
                <Textarea
                  id="ps-description"
                  aria-describedby="ps-description-count"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this project for?"
                  maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
                  rows={2}
                  className="resize-y rounded-xl bg-muted/40"
                />
                <p id="ps-description-count" className="text-end text-sm text-muted-foreground">
                  {description.length.toLocaleString()} /{' '}
                  {PROJECT_DESCRIPTION_MAX_LENGTH.toLocaleString()}
                </p>
              </div>

              {/* Instructions */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="ps-instructions"
                  className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  Instructions
                </Label>
                <p id="ps-instructions-hint" className="text-xs text-muted-foreground">
                  Set context and customize how the assistant responds in this project.
                </p>
                <Textarea
                  id="ps-instructions"
                  aria-describedby="ps-instructions-hint ps-instructions-count"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={`e.g. "Respond in Spanish. Reference the latest documentation. Keep answers short and focused."`}
                  maxLength={PROJECT_INSTRUCTIONS_MAX_LENGTH}
                  rows={5}
                  className="resize-y rounded-xl bg-muted/40"
                />
                <p id="ps-instructions-count" className="text-end text-sm text-muted-foreground">
                  {instructions.length.toLocaleString()} /{' '}
                  {PROJECT_INSTRUCTIONS_MAX_LENGTH.toLocaleString()}
                </p>
              </div>

              <ProjectDefaultModelField value={defaultModelId} onChange={setDefaultModelId} />

              <ProjectChatDefaultsField value={chatDefaults} onChange={setChatDefaults} />

              <div className="space-y-1.5">
                <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Personalization
                </p>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={usesAccountInstructions}
                    onChange={(e) => setUsesAccountInstructions(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs text-foreground">
                      Use your profile and instructions for AGI
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {usesAccountInstructions
                        ? 'Chats here also follow your profile and Instructions for AGI.'
                        : 'Chats here follow only this project\u2019s instructions.'}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={usesAccountStyle}
                    onChange={(e) => setUsesAccountStyle(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs text-foreground">Use your response style</span>
                    <span className="text-caption text-muted-foreground">
                      {usesAccountStyle
                        ? 'Replies here use the style, length and language you chose in Settings.'
                        : 'Replies here ignore your saved style, length and language settings.'}
                    </span>
                  </span>
                </label>
              </div>

              <div className="space-y-1.5">
                <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Memory
                </p>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={usesGlobalMemory}
                    onChange={(e) => setUsesGlobalMemory(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-xs text-foreground">
                      Use memories from outside this project
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {usesGlobalMemory
                        ? 'Chats here draw on what has been remembered account-wide, and anything learned here stays in this project.'
                        : 'Chats here use only this project\u2019s memories.'}
                    </span>
                  </span>
                </label>
              </div>
            </fieldset>
            <ProjectMemoryPanel projectId={project.id} projectName={project.name} />

            {/* Knowledge Files */}
            <div className="space-y-2">
              <p className="text-caption font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Files
              </p>
              <p className="text-xs text-muted-foreground">
                Context for every chat in this project.
              </p>
              <KnowledgeFilesPanel projectId={project.id} />
            </div>
          </div>

          {/* Footer */}
          <div
            data-testid="project-settings-actions"
            className="grid shrink-0 grid-cols-2 gap-2 border-t border-border/60 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:px-6 sm:py-4"
          >
            {/* Destructive delete */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="order-3 col-span-2 w-full justify-center text-danger hover:bg-destructive/10 hover:text-danger sm:order-none sm:w-auto"
              onClick={requestDelete}
            >
              <Trash2 className="me-1.5 h-4 w-4" />
              {isHealthSpace ? 'Delete Health' : 'Delete project'}
            </Button>

            {/*
              Duplicate and Export. The routes shipped without a caller, which
              is the same unwired-backend pattern this codebase keeps getting
              bitten by, a capability that exists and no user can reach.
            */}
            <div className="order-2 col-span-2 grid grid-cols-2 gap-2 sm:order-none sm:flex sm:items-center">
              {isHealthSpace ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full sm:w-auto"
                  disabled={isDuplicating}
                  onClick={() => void handleDuplicate()}
                >
                  <Copy className="me-1.5 h-4 w-4" />
                  {isDuplicating ? 'Duplicating…' : 'Duplicate'}
                </Button>
              )}
              {/*
                This is intentionally a document link, not App Router
                navigation: the route returns Content-Disposition: attachment,
                so the browser streams the file without holding it in memory.
              */}
              <Button asChild variant="ghost" size="sm" className="w-full sm:w-auto">
                <a href={`/api/projects/${project.id}/export`} download>
                  <Download className="me-1.5 h-4 w-4" />
                  Export
                </a>
              </Button>
            </div>

            {/* Save */}
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !name.trim()}
              className="order-1 col-span-2 w-full rounded-xl px-5 sm:order-none sm:w-auto"
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {confirmDialog}
      {discardDialog}
    </>
  );
}
