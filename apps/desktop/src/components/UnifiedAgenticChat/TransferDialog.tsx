import { useCallback, useState } from 'react';
import { ArrowRight, Cloud, HardDrive, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { transferLocalToCloud, transferCloudToLocal } from '../../services/cloudChat';
import { useAuthStore, selectUser } from '../../stores/auth';
import { useChatStore } from '../../stores/chat/chatStore';

interface TransferDialogProps {
  conversationId: string;
  conversationTitle: string;
  direction: 'local_to_cloud' | 'cloud_to_local';
  localDbId?: number;
  onClose: () => void;
}

export function TransferDialog({
  conversationId,
  conversationTitle,
  direction,
  localDbId,
  onClose,
}: TransferDialogProps) {
  const [deleteOriginal, setDeleteOriginal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const user = useAuthStore(selectUser);
  const loadConversations = useChatStore((s) => s.loadConversations);

  const isLocalToCloud = direction === 'local_to_cloud';
  const accentColor = isLocalToCloud ? 'blue' : 'emerald';

  const handleTransfer = useCallback(async () => {
    if (!user?.id) {
      toast.error('Sign in to transfer conversations');
      return;
    }

    setIsLoading(true);
    try {
      if (direction === 'local_to_cloud') {
        if (localDbId === undefined) {
          throw new Error('Local database ID is required for local-to-cloud transfer');
        }
        await transferLocalToCloud(localDbId, user.id, deleteOriginal);
        toast.success(`"${conversationTitle}" moved to cloud`);
      } else {
        await transferCloudToLocal(conversationId, user.id, deleteOriginal);
        toast.success(`"${conversationTitle}" downloaded to device`);
      }

      // Reload conversations to reflect the change
      await loadConversations(user.id);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transfer failed';
      toast.error(`Transfer failed: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [
    direction,
    localDbId,
    conversationId,
    conversationTitle,
    deleteOriginal,
    user,
    loadConversations,
    onClose,
  ]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-xl bg-white dark:bg-zinc-900 shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
          Transfer Conversation
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-5">
          {isLocalToCloud
            ? 'Copy this conversation from your device to cloud storage.'
            : 'Download this conversation from cloud to your device.'}
        </p>

        {/* Direction indicator */}
        <div className="flex items-center justify-center gap-4 py-4 mb-5 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700">
          {isLocalToCloud ? (
            <>
              <div className="flex flex-col items-center gap-1">
                <HardDrive className="h-6 w-6 text-emerald-500" />
                <span className="text-[10px] font-medium text-zinc-500">Local</span>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-400" />
              <div className="flex flex-col items-center gap-1">
                <Cloud className="h-6 w-6 text-blue-500" />
                <span className="text-[10px] font-medium text-zinc-500">Cloud</span>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center gap-1">
                <Cloud className="h-6 w-6 text-blue-500" />
                <span className="text-[10px] font-medium text-zinc-500">Cloud</span>
              </div>
              <ArrowRight className="h-4 w-4 text-zinc-400" />
              <div className="flex flex-col items-center gap-1">
                <HardDrive className="h-6 w-6 text-emerald-500" />
                <span className="text-[10px] font-medium text-zinc-500">Local</span>
              </div>
            </>
          )}
        </div>

        {/* Conversation title */}
        <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-4">
          Transferring:{' '}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            &ldquo;{conversationTitle}&rdquo;
          </span>
        </p>

        {/* Delete original checkbox */}
        <label className="flex items-center gap-2.5 mb-6 cursor-pointer group">
          <input
            type="checkbox"
            checked={deleteOriginal}
            onChange={(e) => setDeleteOriginal(e.target.checked)}
            disabled={isLoading}
            className={cn(
              'h-4 w-4 rounded border-zinc-300 dark:border-zinc-600',
              'text-blue-500 focus:ring-blue-500/50 cursor-pointer',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          />
          <span className="text-xs text-zinc-600 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors">
            Delete original after transfer
          </span>
        </label>

        {/* Footer actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleTransfer()}
            disabled={isLoading}
            className={cn(
              'text-xs gap-1.5',
              accentColor === 'blue'
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white',
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Transferring&hellip;
              </>
            ) : isLocalToCloud ? (
              <>
                <Cloud className="h-3.5 w-3.5" />
                Move to Cloud
              </>
            ) : (
              <>
                <HardDrive className="h-3.5 w-3.5" />
                Download to Device
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
