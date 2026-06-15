'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@shared/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shared/ui/alert-dialog';
import { Button } from '@shared/ui/button';
import { Input } from '@shared/ui/input';
import { Label } from '@shared/ui/label';
import { Textarea } from '@shared/ui/textarea';
import { Smile, Trash2 } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { toast } from 'sonner';
import { KnowledgeFilesPanel } from './KnowledgeFilesPanel';
import type { Project } from '@features/projects/stores/project-store';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  onUpdate,
  onDelete,
}: ProjectSettingsDialogProps) {
  const [name, setName] = useState(project.name);
  const [instructions, setInstructions] = useState(project.instructions ?? '');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sync local state when project changes (e.g., switching between projects)
  useEffect(() => {
    setName(project.name);
    setInstructions(project.instructions ?? '');
  }, [project.id, project.name, project.instructions]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Project name is required');
      return;
    }
    setIsSaving(true);
    try {
      onUpdate(project.id, {
        name: name.trim(),
        instructions: instructions.trim() || undefined,
      });
      toast.success('Project updated');
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    onDelete(project.id);
    setDeleteConfirmOpen(false);
    onOpenChange(false);
    toast.success('Project deleted');
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 sm:max-w-lg">
          {/* Header */}
          <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-5">
            <DialogTitle className="text-base font-semibold">Project settings</DialogTitle>
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
                <button
                  type="button"
                  aria-label="Choose emoji (coming soon)"
                  tabIndex={-1}
                  className={cn(
                    'absolute left-3 top-1/2 -translate-y-1/2',
                    'flex h-6 w-6 items-center justify-center rounded-md',
                    'text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {project.iconEmoji ? (
                    <span className="text-base leading-none">{project.iconEmoji}</span>
                  ) : (
                    <Smile className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
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

            {/* Memory */}
            <div className="space-y-1.5">
              <Label
                htmlFor="ps-memory"
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
              >
                Memory
              </Label>
              <div className="flex items-center gap-3">
                <select
                  id="ps-memory"
                  defaultValue="default"
                  className="h-9 rounded-lg border border-border/60 bg-muted/40 px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                >
                  <option value="default">Default</option>
                </select>
              </div>
              <p className="text-xs text-muted-foreground">
                Project can access memories from outside chats, and vice versa.
              </p>
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
          <div className="flex shrink-0 items-center justify-between border-t border-border/60 px-6 py-4">
            {/* Destructive delete */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete project
            </Button>

            {/* Save */}
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || !name.trim()}
              className="rounded-xl px-5"
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
              &ldquo;{project.name}&rdquo; will be permanently deleted. Conversations in this
              project will be moved to &ldquo;All Chats&rdquo;. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
