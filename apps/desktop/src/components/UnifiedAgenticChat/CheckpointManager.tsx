import { chat } from '@agiworkforce/api';
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
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/Dialog';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';

export interface Checkpoint {
  id: string;
  conversation_id: number;
  checkpoint_name: string;
  description: string | null;
  message_count: number;
  messages_snapshot: string;
  context_snapshot: string | null;
  metadata: string | null;
  parent_checkpoint_id: string | null;
  branch_name: string | null;
  created_at: number;
}

interface CheckpointManagerProps {
  conversationId: number;
  onRestoreComplete?: () => void;
  className?: string;
}

export function CheckpointManager({
  conversationId,
  onRestoreComplete,
  className,
}: CheckpointManagerProps) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCheckpointName, setNewCheckpointName] = useState('');
  const [newCheckpointDescription, setNewCheckpointDescription] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'restore' | 'delete';
    checkpointId: string;
    checkpointName: string;
  }>({ open: false, type: 'restore', checkpointId: '', checkpointName: '' });

  const loadCheckpoints = useCallback(async () => {
    setLoading(true);
    try {
      const result = (await chat.checkpointList(conversationId)) as unknown as Checkpoint[];
      setCheckpoints(result);
    } catch (error) {
      console.error('Failed to load checkpoints:', error);
      toast.error('Failed to load checkpoints');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    void loadCheckpoints();
  }, [loadCheckpoints]);

  const handleCreateCheckpoint = async () => {
    if (!newCheckpointName.trim()) {
      toast.error('Checkpoint name is required');
      return;
    }

    setCreating(true);
    try {
      await chat.checkpointCreate({
        conversationId: conversationId,
        checkpointName: newCheckpointName.trim(),
        description: newCheckpointDescription.trim() || null,
        parentCheckpointId: null,
        branchName: null,
      });

      toast.success('Checkpoint created successfully');
      setNewCheckpointName('');
      setNewCheckpointDescription('');
      setShowCreateDialog(false);
      await loadCheckpoints();
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      toast.error('Failed to create checkpoint');
    } finally {
      setCreating(false);
    }
  };

  const openRestoreDialog = (checkpointId: string, checkpointName: string) => {
    setConfirmDialog({ open: true, type: 'restore', checkpointId, checkpointName });
  };

  const openDeleteDialog = (checkpointId: string, checkpointName: string) => {
    setConfirmDialog({ open: true, type: 'delete', checkpointId, checkpointName });
  };

  const handleConfirmAction = async () => {
    const { type, checkpointId, checkpointName } = confirmDialog;
    setConfirmDialog((prev) => ({ ...prev, open: false }));

    if (type === 'restore') {
      setRestoring(true);
      try {
        await chat.checkpointRestore({
          checkpointId: checkpointId,
          conversationId: conversationId,
        });

        toast.success(`Restored to checkpoint: ${checkpointName}`);
        onRestoreComplete?.();
        await loadCheckpoints();
      } catch (error) {
        console.error('Failed to restore checkpoint:', error);
        toast.error('Failed to restore checkpoint');
      } finally {
        setRestoring(false);
      }
    } else if (type === 'delete') {
      try {
        await chat.checkpointDelete(checkpointId);

        toast.success('Checkpoint deleted');
        await loadCheckpoints();
      } catch (error) {
        console.error('Failed to delete checkpoint:', error);
        toast.error('Failed to delete checkpoint');
      }
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60));
      return `${minutes}m ago`;
    } else if (hours < 24) {
      return `${hours}h ago`;
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Confirmation Dialog */}
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog.type === 'restore' ? 'Restore Checkpoint' : 'Delete Checkpoint'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === 'restore'
                ? `Restore to checkpoint "${confirmDialog.checkpointName}"? This will replace all messages in the current conversation with the checkpoint state.`
                : `Delete checkpoint "${confirmDialog.checkpointName}"? This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={
                confirmDialog.type === 'delete' ? 'bg-destructive hover:bg-destructive/90' : ''
              }
            >
              {confirmDialog.type === 'restore' ? 'Restore' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Checkpoints</h3>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="default" disabled={creating || restoring}>
              <Plus className="mr-2 h-4 w-4" />
              Create Checkpoint
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Checkpoint</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label htmlFor="checkpoint-name" className="text-sm font-medium">
                  Checkpoint Name *
                </label>
                <Input
                  id="checkpoint-name"
                  placeholder="e.g., Before API refactor"
                  value={newCheckpointName}
                  onChange={(e) => setNewCheckpointName(e.target.value)}
                  disabled={creating}
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="checkpoint-description" className="text-sm font-medium">
                  Description (optional)
                </label>
                <Textarea
                  id="checkpoint-description"
                  placeholder="Add notes about this checkpoint..."
                  value={newCheckpointDescription}
                  onChange={(e) => setNewCheckpointDescription(e.target.value)}
                  disabled={creating}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  disabled={creating}
                >
                  Cancel
                </Button>
                <Button onClick={handleCreateCheckpoint} disabled={creating}>
                  {creating ? (
                    <>
                      <Clock className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Create
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          <Clock className="mr-2 h-4 w-4 animate-spin" />
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
              {}
              {index < checkpoints.length - 1 && (
                <div className="absolute left-6 top-12 h-full w-0.5 bg-border" />
              )}

              <div className="flex items-start gap-3">
                {}
                <div className="relative shrink-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Check className="h-4 w-4" />
                  </div>
                </div>

                {}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-foreground">
                        {checkpoint.checkpoint_name}
                      </h4>
                      {checkpoint.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {checkpoint.description}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openRestoreDialog(checkpoint.id, checkpoint.checkpoint_name)}
                        disabled={restoring}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openDeleteDialog(checkpoint.id, checkpoint.checkpoint_name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {}
                  <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimestamp(checkpoint.created_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {checkpoint.message_count} messages
                    </span>
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
