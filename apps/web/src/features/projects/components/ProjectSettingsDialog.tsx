'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shared/ui/dialog';
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
import { Save, Trash2, Upload, FileText, X as XIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@features/projects/stores/project-store';

// ---------------------------------------------------------------------------
// Color options
// ---------------------------------------------------------------------------

const PROJECT_COLORS = [
  { value: '#3b82f6', label: 'Blue' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ef4444', label: 'Red' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#06b6d4', label: 'Cyan' },
  { value: '#f97316', label: 'Orange' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  onUpdate: (
    id: string,
    updates: Partial<Pick<Project, 'name' | 'description' | 'instructions' | 'color'>>,
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
  const [description, setDescription] = useState(project.description);
  const [instructions, setInstructions] = useState(project.instructions);
  const [color, setColor] = useState(project.color);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [knowledgeFiles, setKnowledgeFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local state when project changes (e.g., switching between projects)
  useEffect(() => {
    setName(project.name);
    setDescription(project.description);
    setInstructions(project.instructions);
    setColor(project.color);
  }, [project.id, project.name, project.description, project.instructions, project.color]);

  const handleSave = () => {
    if (!name.trim()) {
      toast.error('Project name is required');
      return;
    }

    onUpdate(project.id, {
      name: name.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      color,
    });

    toast.success('Project updated');
    onOpenChange(false);
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Project Settings</DialogTitle>
            <DialogDescription>
              Configure the project name, description, and custom instructions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Project"
                maxLength={100}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Input
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief description of this project"
                maxLength={200}
              />
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors"
                    style={{
                      backgroundColor: c.value,
                      borderColor: color === c.value ? 'white' : 'transparent',
                    }}
                    aria-label={c.label}
                    title={c.label}
                  >
                    {color === c.value && (
                      <svg
                        className="h-3.5 w-3.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Knowledge Files */}
            <div className="space-y-2">
              <Label>Knowledge Files</Label>
              <p className="text-xs text-muted-foreground">
                Upload documents that provide context for all conversations in this project.
              </p>

              {/* Drop zone */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border/50 bg-muted/20 px-4 py-6 text-sm transition-colors hover:border-primary/30 hover:bg-muted/40"
              >
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-muted-foreground">Drop files or click to upload</span>
                <span className="text-[10px] text-muted-foreground/60">
                  PDF, DOCX, TXT, CSV, MD — max 30MB each
                </span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.csv,.md,.doc,.rtf,.epub"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const valid = files.filter((f) => f.size <= 30 * 1024 * 1024);
                  if (valid.length < files.length) {
                    toast.error('Some files exceeded 30MB and were skipped');
                  }
                  setKnowledgeFiles((prev) => [...prev, ...valid]);
                  e.target.value = '';
                }}
              />

              {/* File list */}
              {knowledgeFiles.length > 0 && (
                <div className="space-y-1.5">
                  {knowledgeFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-1.5 text-sm"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(1)}MB
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setKnowledgeFiles((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Remove ${file.name}`}
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">
                    {knowledgeFiles.length} file{knowledgeFiles.length !== 1 ? 's' : ''} ·{' '}
                    {(knowledgeFiles.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)}MB
                    total
                  </p>
                </div>
              )}
            </div>

            {/* Custom Instructions */}
            <div className="space-y-2">
              <Label htmlFor="project-instructions">Custom Instructions</Label>
              <Textarea
                id="project-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Enter custom instructions that will be prepended to every conversation in this project..."
                rows={5}
                className="resize-y"
              />
              <p className="text-xs text-muted-foreground">
                These instructions are automatically included as context in every chat within this
                project.
              </p>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Project
            </Button>
            <Button onClick={handleSave}>
              <Save className="mr-2 h-4 w-4" />
              Save
            </Button>
          </DialogFooter>
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
