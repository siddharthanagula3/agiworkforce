'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Terminal } from 'lucide-react';
import { useSettingsStore, type CustomCommand } from '@/stores/settingsStore';
import { Button } from '@shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@shared/ui/dialog';
import { Input } from '@shared/ui/input';
import { Textarea } from '@shared/ui/textarea';
import { Label } from '@shared/ui/label';
import { cn } from '@shared/lib/utils';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const NAME_RE = /^[a-z0-9-]{2,32}$/;

interface FormErrors {
  name?: string;
  description?: string;
  template?: string;
}

function validate(
  name: string,
  description: string,
  template: string,
  existingNames: string[],
  editingId?: string,
): FormErrors {
  const errors: FormErrors = {};

  if (!NAME_RE.test(name)) {
    errors.name =
      'Name must be 2-32 characters: lowercase letters, numbers, and hyphens only. No spaces.';
  } else if (existingNames.includes(name) && editingId === undefined) {
    errors.name = 'A command with this name already exists.';
  }

  if (description.length > 100) {
    errors.description = `Description must be 100 characters or fewer (currently ${description.length}).`;
  }

  if (!template.trim()) {
    errors.template = 'Template is required.';
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Command Form Modal
// ---------------------------------------------------------------------------

interface CommandFormModalProps {
  open: boolean;
  onClose: () => void;
  initial?: CustomCommand;
  existingNames: string[];
}

function CommandFormModal({ open, onClose, initial, existingNames }: CommandFormModalProps) {
  const { addCustomCommand, updateCustomCommand } = useSettingsStore();

  const isEditing = !!initial;

  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [template, setTemplate] = useState(initial?.template ?? '');
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState(false);

  const namesForCheck = isEditing ? existingNames.filter((n) => n !== initial.name) : existingNames;

  function handleSubmit() {
    setTouched(true);
    const errs = validate(
      name,
      description,
      template,
      namesForCheck,
      isEditing ? initial.id : undefined,
    );
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (isEditing) {
      updateCustomCommand(initial.id, { name, description, template });
    } else {
      addCustomCommand({ name, description, template });
    }
    handleClose();
  }

  function handleClose() {
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setTemplate(initial?.template ?? '');
    setErrors({});
    setTouched(false);
    onClose();
  }

  function revalidate(n: string, d: string, t: string) {
    if (!touched) return;
    setErrors(validate(n, d, t, namesForCheck, isEditing ? initial.id : undefined));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg border-white/[0.08] bg-zinc-950">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit command' : 'New custom command'}</DialogTitle>
          <DialogDescription>
            Custom commands appear in the slash menu when you type{' '}
            <code className="rounded bg-muted px-1 text-xs">/</code> in the chat composer. Use{' '}
            <code className="rounded bg-muted px-1 text-xs">{'{input}'}</code> in your template to
            insert what you type after the command.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="cmd-name" className="text-sm">
              Name <span className="text-muted-foreground text-xs">(slug, no spaces)</span>
            </Label>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-sm select-none">/</span>
              <Input
                id="cmd-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  revalidate(e.target.value, description, template);
                }}
                placeholder="summarize"
                className={cn(
                  'flex-1',
                  errors.name && 'border-destructive focus-visible:ring-destructive',
                )}
                aria-describedby={errors.name ? 'cmd-name-error' : undefined}
                aria-invalid={!!errors.name}
                autoFocus
              />
            </div>
            {errors.name && (
              <p id="cmd-name-error" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="cmd-description" className="text-sm">
              Description{' '}
              <span className="text-muted-foreground text-xs">(shown in the slash menu)</span>
            </Label>
            <Input
              id="cmd-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                revalidate(name, e.target.value, template);
              }}
              placeholder="Summarize the selected text"
              className={cn(
                errors.description && 'border-destructive focus-visible:ring-destructive',
              )}
              aria-describedby={errors.description ? 'cmd-description-error' : undefined}
              aria-invalid={!!errors.description}
              maxLength={110}
            />
            <p className="text-xs text-muted-foreground text-right">{description.length}/100</p>
            {errors.description && (
              <p id="cmd-description-error" className="text-xs text-destructive">
                {errors.description}
              </p>
            )}
          </div>

          {/* Template */}
          <div className="space-y-1.5">
            <Label htmlFor="cmd-template" className="text-sm">
              Template{' '}
              <span className="text-muted-foreground text-xs">
                (use <code className="rounded bg-muted px-1">{'{input}'}</code> for user text)
              </span>
            </Label>
            <Textarea
              id="cmd-template"
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                revalidate(name, description, e.target.value);
              }}
              placeholder={`Summarize the following in 3 bullet points:\n\n{input}`}
              rows={5}
              hasError={!!errors.template}
              errorMessageId={errors.template ? 'cmd-template-error' : undefined}
              className="font-mono text-xs"
            />
            {errors.template && (
              <p id="cmd-template-error" className="text-xs text-destructive">
                {errors.template}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose} className="border-border">
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            {isEditing ? 'Save changes' : 'Create command'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Delete Confirm Dialog
// ---------------------------------------------------------------------------

interface DeleteConfirmProps {
  open: boolean;
  commandName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirmDialog({ open, commandName, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-sm border-white/[0.08] bg-zinc-950">
        <DialogHeader>
          <DialogTitle>Delete /{commandName}?</DialogTitle>
          <DialogDescription>
            This custom command will be permanently removed. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onCancel} className="border-border">
            Cancel
          </Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main CustomCommandsSettings
// ---------------------------------------------------------------------------

export function CustomCommandsSettings() {
  const { customCommands, deleteCustomCommand } = useSettingsStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingCmd, setEditingCmd] = useState<CustomCommand | null>(null);
  const [deletingCmd, setDeletingCmd] = useState<CustomCommand | null>(null);

  const existingNames = customCommands.map((c) => c.name);

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {customCommands.length === 0
            ? 'No custom commands yet. Create one to get started.'
            : `${customCommands.length} custom command${customCommands.length === 1 ? '' : 's'}`}
        </p>
        <Button size="sm" onClick={() => setIsCreating(true)} className="gap-2">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          New command
        </Button>
      </div>

      {/* Command list */}
      {customCommands.length > 0 && (
        <ul className="space-y-2" aria-label="Custom slash commands">
          {customCommands.map((cmd) => (
            <li
              key={cmd.id}
              className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-3"
            >
              <Terminal
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground">/</span>
                  {cmd.name}
                </p>
                {cmd.description && (
                  <p className="text-xs text-muted-foreground truncate">{cmd.description}</p>
                )}
                <p className="text-xs text-muted-foreground/60 truncate font-mono">
                  {cmd.template}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setEditingCmd(cmd)}
                  aria-label={`Edit /${cmd.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-400"
                  onClick={() => setDeletingCmd(cmd)}
                  aria-label={`Delete /${cmd.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Create modal */}
      <CommandFormModal
        open={isCreating}
        onClose={() => setIsCreating(false)}
        existingNames={existingNames}
      />

      {/* Edit modal */}
      {editingCmd && (
        <CommandFormModal
          open={true}
          onClose={() => setEditingCmd(null)}
          initial={editingCmd}
          existingNames={existingNames}
        />
      )}

      {/* Delete confirm */}
      {deletingCmd && (
        <DeleteConfirmDialog
          open={true}
          commandName={deletingCmd.name}
          onConfirm={() => {
            deleteCustomCommand(deletingCmd.id);
            setDeletingCmd(null);
          }}
          onCancel={() => setDeletingCmd(null)}
        />
      )}
    </div>
  );
}
