'use client';

import { useState, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Textarea,
} from '@agiworkforce/ui';
import { Label } from '@agiworkforce/ui';
import { Copy, Download, Smile, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { addCsrfHeaders } from '@/lib/client/csrf';
import { webManagedCloudProjects } from '@/features/projects/services/managed-cloud-projects';
import { KnowledgeFilesPanel } from './KnowledgeFilesPanel';
import type { Project } from '@features/projects/stores/project-store';
import { toUserMessage } from '@/lib/user-error-message';

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

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  onUpdate,
  onDelete,
  onDuplicated,
}: ProjectSettingsDialogProps) {
  const [name, setName] = useState(project.name);
  const [instructions, setInstructions] = useState(project.instructions ?? '');
  const [usesGlobalMemory, setUsesGlobalMemory] = useState(project.usesGlobalMemory !== false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setName(project.name);
    setInstructions(project.instructions ?? '');
    setUsesGlobalMemory(project.usesGlobalMemory !== false);
  }, [project.id, project.name, project.instructions, project.usesGlobalMemory]);

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
          ? `Project duplicated with ${copiedKnowledgeFiles} file${copiedKnowledgeFiles === 1 ? '' : 's'}.`
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
    if (!name.trim()) {
      toast.error('Project name is required');
      return;
    }
    const updates = {
      name: name.trim(),
      instructions: instructions.trim() || undefined,
      usesGlobalMemory,
    };
    setIsSaving(true);
    try {
      await webManagedCloudProjects.updateProject(project.id, updates);

      onUpdate(project.id, updates);
      toast.success('Project updated');
      onOpenChange(false);
    } catch (error) {
      toast.error(toUserMessage(error, 'Failed to update project'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await webManagedCloudProjects.deleteProject(project.id);

      onDelete(project.id);
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      toast.success('Project deleted');
    } catch (error) {
      toast.error(toUserMessage(error, 'Failed to delete project'));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
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
            {/* Project name with emoji affordance */}
            <div className="space-y-1.5">
              <Label
                htmlFor="ps-project-name"
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                Project name
              </Label>
              <div className="relative">
                <span
                  aria-hidden="true"
                  className="absolute left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-muted-foreground"
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
                  className="h-11 rounded-xl bg-muted/40 pl-10"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSave();
                  }}
                />
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-1.5">
              <Label
                htmlFor="ps-instructions"
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                Instructions
              </Label>
              <p className="text-xs text-muted-foreground">
                Set context and customize how AGI responds in this project.
              </p>
              <Textarea
                id="ps-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={`e.g. "Respond in Spanish. Reference the latest documentation. Keep answers short and focused."`}
                rows={5}
                className="resize-y rounded-xl bg-muted/40"
              />
            </div>

            {/*
              Memory scope.

              A decorative <select> used to sit here — one option, no onChange,
              no persistence — implying per-project scoping the product did not
              have. It was removed with a note to re-add a control only once
              memories could actually be scoped. Migration 0135 added
              `user_memories.project_id` and `user_projects.uses_global_memory`,
              and both the read path (loadManagedMemoryContext) and the write
              path (persistManagedAutoMemoryFacts) honour them, so this is a
              real control now.
            */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                  <span className="text-[11px] text-muted-foreground">
                    {usesGlobalMemory
                      ? 'Chats here draw on what has been remembered account-wide, and anything learned here stays in this project.'
                      : 'Chats here use only this project\u2019s memories. Nothing from your other chats is included.'}
                  </span>
                </span>
              </label>
            </div>

            {/* Knowledge Files */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Files
              </p>
              <p className="text-xs text-muted-foreground">
                Upload documents that provide context for all conversations in this project.
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
              className="order-3 col-span-2 w-full justify-center text-destructive hover:bg-destructive/10 hover:text-destructive sm:order-none sm:w-auto"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete project
            </Button>

            {/*
              Duplicate and Export. The routes shipped without a caller, which
              is the same unwired-backend pattern this codebase keeps getting
              bitten by — a capability that exists and no user can reach.
            */}
            <div className="order-2 col-span-2 grid grid-cols-2 gap-2 sm:order-none sm:flex sm:items-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full sm:w-auto"
                disabled={isDuplicating}
                onClick={() => void handleDuplicate()}
              >
                <Copy className="mr-1.5 h-4 w-4" />
                {isDuplicating ? 'Duplicating…' : 'Duplicate'}
              </Button>
              {/*
                This is intentionally a document link, not App Router
                navigation: the route returns Content-Disposition: attachment,
                so the browser streams the file without holding it in memory.
              */}
              <Button asChild variant="ghost" size="sm" className="w-full sm:w-auto">
                <a href={`/api/projects/${project.id}/export`}>
                  <Download className="mr-1.5 h-4 w-4" />
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

      {/* Delete confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{project.name}&rdquo; and its knowledge files will be permanently deleted,
              including the uploaded file contents. Conversations in this project will be moved to
              &ldquo;All Chats&rdquo;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
