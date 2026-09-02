/**
 * CheckpointManager
 *
 * UI to list, restore, delete, and fork from prior message snapshots.
 *
 * Ported from apps/desktop/src/components/UnifiedAgenticChat/CheckpointManager.tsx
 *
 * Breaking changes vs source:
 *  - `chat.checkpointList/Create/Restore/Delete` (@agiworkforce/desktop-command-client) removed.
 *    Hosts pass `onLoad`, `onCreate`, `onRestore`, `onDelete` callbacks so the
 *    component has zero backend coupling.
 *  - Restore/delete confirmation routes through `useConfirmAction` from
 *    `@agiworkforce/ui`. `Dialog/Input/Textarea` from desktop UI remain
 *    inline Tailwind implementations for the create-checkpoint form.
 *  - `toast` (sonner) removed — hosts show toasts via `onError`/`onSuccess`
 *    optional callbacks, or use the returned Promise rejection to handle errors.
 *  - `Checkpoint` type is re-exported as `ManagerCheckpoint` (camelCase, no
 *    snake_case DB fields) to match the store type.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Clock,
  GitBranch,
  MessageSquare,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { useConfirmAction } from '@agiworkforce/ui';
import { cn } from '../lib/utils';
import type { Checkpoint } from '../stores/checkpointStore';

export type { Checkpoint as ManagerCheckpoint };

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'just now';
  if (hours < 1) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export interface CheckpointManagerProps {
  conversationId: string;
  onLoad: (conversationId: string) => Promise<Checkpoint[]>;
  onCreate: (conversationId: string, label: string, description?: string) => Promise<Checkpoint>;
  onRestore: (checkpointId: string, conversationId: string) => Promise<void>;
  onDelete: (checkpointId: string) => Promise<void>;
  onFork?: (checkpoint: Checkpoint) => Promise<void>;
  onRestoreComplete?: () => void;
  className?: string;
}

interface MiniDialogProps {
  open: boolean;
  title: string;
  children: React.ReactNode;
}

function MiniDialog({ open, title, children }: MiniDialogProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="relative w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
        <p className="mb-4 text-lg font-semibold">{title}</p>
        {children}
      </div>
    </div>
  );
}

export function CheckpointManager({
  conversationId,
  onLoad,
  onCreate,
  onRestore,
  onDelete,
  onFork,
  onRestoreComplete,
  className,
}: CheckpointManagerProps) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmAction();

  const loadCheckpoints = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await onLoad(conversationId);
      setCheckpoints(Array.isArray(result) ? result : []);
    } catch (err) {
      console.error('[CheckpointManager] Failed to load checkpoints:', err);
      setError('Failed to load checkpoints');
    } finally {
      setLoading(false);
    }
  }, [conversationId, onLoad]);

  useEffect(() => {
    void loadCheckpoints();
  }, [loadCheckpoints]);

  const handleCreate = async () => {
    if (!newLabel.trim()) {
      setError('Checkpoint name is required');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await onCreate(
        conversationId,
        newLabel.trim(),
        newDescription.trim() || undefined,
      );
      setCheckpoints((prev) => [created, ...prev]);
      setNewLabel('');
      setNewDescription('');
      setShowCreateDialog(false);
    } catch (err) {
      console.error('[CheckpointManager] Failed to create checkpoint:', err);
      setError('Failed to create checkpoint');
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = useCallback(
    async (checkpoint: Checkpoint) => {
      setRestoring(true);
      try {
        await onRestore(checkpoint.id, conversationId);
        onRestoreComplete?.();
        await loadCheckpoints();
      } catch (err) {
        console.error('[CheckpointManager] Failed to restore checkpoint:', err);
        setError('Failed to restore checkpoint');
      } finally {
        setRestoring(false);
      }
    },
    [conversationId, onRestore, onRestoreComplete, loadCheckpoints],
  );

  const handleDelete = useCallback(
    async (checkpoint: Checkpoint) => {
      try {
        await onDelete(checkpoint.id);
        setCheckpoints((prev) => prev.filter((c) => c.id !== checkpoint.id));
      } catch (err) {
        console.error('[CheckpointManager] Failed to delete checkpoint:', err);
        setError('Failed to delete checkpoint');
      }
    },
    [onDelete],
  );

  const confirmRestore = useCallback(
    (checkpoint: Checkpoint) => {
      confirm({
        title: 'Restore Checkpoint',
        description: `Restore to "${checkpoint.label ?? checkpoint.id}"? This will replace all messages in the current conversation with the checkpoint state.`,
        confirmLabel: 'Restore',
        destructive: false,
        onConfirm: () => handleRestore(checkpoint),
      });
    },
    [confirm, handleRestore],
  );

  const confirmDelete = useCallback(
    (checkpoint: Checkpoint) => {
      confirm({
        title: 'Delete Checkpoint',
        description: `Delete "${checkpoint.label ?? checkpoint.id}"? This action cannot be undone.`,
        confirmLabel: 'Delete',
        onConfirm: () => handleDelete(checkpoint),
      });
    },
    [confirm, handleDelete],
  );

  const handleFork = async (checkpoint: Checkpoint) => {
    if (!onFork) return;
    try {
      await onFork(checkpoint);
    } catch (err) {
      console.error('[CheckpointManager] Failed to fork checkpoint:', err);
      setError('Failed to fork at checkpoint');
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Confirm dialog */}
      {confirmDialog}

      {/* Create checkpoint dialog */}
      <MiniDialog open={showCreateDialog} title="Create Checkpoint">
        <div className="space-y-4">
          <div>
            <label htmlFor="uc-cp-name" className="mb-1 block text-sm font-medium">
              Checkpoint Name *
            </label>
            <input
              id="uc-cp-name"
              type="text"
              placeholder="e.g., Before API refactor"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              disabled={creating}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="uc-cp-desc" className="mb-1 block text-sm font-medium">
              Description (optional)
            </label>
            <textarea
              id="uc-cp-desc"
              rows={3}
              placeholder="Add notes about this checkpoint..."
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              disabled={creating}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={creating}
              onClick={() => {
                setShowCreateDialog(false);
                setError(null);
              }}
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={creating}
              onClick={handleCreate}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90"
            >
              {creating ? (
                <>
                  <Clock className="h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Create
                </>
              )}
            </button>
          </div>
        </div>
      </MiniDialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Checkpoints</h3>
        </div>
        <button
          type="button"
          disabled={creating || restoring}
          onClick={() => {
            setError(null);
            setShowCreateDialog(true);
          }}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Create Checkpoint
        </button>
      </div>

      {/* Error banner (outside dialogs) */}
      {error && !showCreateDialog && (
        <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center py-8 text-muted-foreground"
        >
          <Clock className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          Loading checkpoints...
        </div>
      ) : checkpoints.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground opacity-50" />
          <p className="mt-4 text-sm text-muted-foreground">
            No checkpoints yet. Create your first checkpoint to save the current conversation state.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {checkpoints.map((checkpoint, index) => (
            <div
              key={checkpoint.id}
              className="group relative rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
            >
              {/* Timeline connector */}
              {index < checkpoints.length - 1 && (
                <div className="absolute left-6 top-12 h-full w-0.5 bg-border" />
              )}

              <div className="flex items-start gap-3">
                {/* Dot */}
                <div className="relative shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-4 w-4" />
                  </div>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-foreground">
                        {checkpoint.label ?? checkpoint.id}
                      </h4>
                      {typeof checkpoint.metadata?.['description'] === 'string' && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {checkpoint.metadata['description']}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        title="Restore to this checkpoint"
                        aria-label="Restore to this checkpoint"
                        disabled={restoring}
                        onClick={() => confirmRestore(checkpoint)}
                        className="rounded p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      {onFork && (
                        <button
                          type="button"
                          title="Fork from this checkpoint"
                          aria-label="Fork from this checkpoint"
                          onClick={() => handleFork(checkpoint)}
                          className="rounded p-1 text-muted-foreground hover:text-foreground"
                        >
                          <GitBranch className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Delete checkpoint"
                        aria-label="Delete checkpoint"
                        onClick={() => confirmDelete(checkpoint)}
                        className="rounded p-1 text-muted-foreground hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(checkpoint.createdAt)}
                    </span>
                    {checkpoint.metadata?.['messageCount'] !== undefined && (
                      <span className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {String(checkpoint.metadata['messageCount'])} messages
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default CheckpointManager;
