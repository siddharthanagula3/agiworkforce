/**
 * MemoryBrowserModal Component
 *
 * Full-screen modal dialog for browsing, searching, and managing
 * memories with advanced filtering and sorting options.
 */
import { memo, useCallback, useState } from 'react';
import { Brain } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { MemoryManager } from './MemoryManager';

export interface MemoryBrowserModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Callback when modal should close */
  onOpenChange: (open: boolean) => void;
  /** Project ID for filtering (optional) */
  projectId?: string;
}

export const MemoryBrowserModal = memo(function MemoryBrowserModal({
  open,
  onOpenChange,
}: MemoryBrowserModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-zinc-900 border-zinc-700 p-0 flex flex-col">
        <DialogHeader className="border-b border-zinc-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-blue-400" />
            <DialogTitle className="text-white">Memory Browser</DialogTitle>
          </div>
          <DialogDescription className="text-zinc-400">
            View, search, and manage all memories. High-importance memories are automatically
            recalled during conversations.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden px-6 py-4">
          <MemoryManager
            showCreateButton={true}
            showImportExport={true}
            maxHeight="calc(100vh - 200px)"
          />
        </div>

        <div className="border-t border-zinc-700 px-6 py-4 flex justify-end">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

/**
 * Hook for managing memory browser modal state
 */
export function useMemoryBrowserModal() {
  const [open, setOpen] = useState(false);

  const openMemoryBrowser = useCallback(() => {
    setOpen(true);
  }, []);

  const closeMemoryBrowser = useCallback(() => {
    setOpen(false);
  }, []);

  return {
    open,
    setOpen,
    openMemoryBrowser,
    closeMemoryBrowser,
  };
}
