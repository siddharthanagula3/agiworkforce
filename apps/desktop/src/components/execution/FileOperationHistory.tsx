/**
 * File Operation History Component
 *
 * Displays file operation history with undo/redo capabilities.
 * Similar to Claude Code's file change tracking.
 */

import { AnimatePresence, motion } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  File,
  FilePlus,
  FileX,
  Pencil,
  RotateCcw,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { invoke } from '../../lib/tauri-mock';

import { cn } from '../../lib/utils';
import { selectFileChanges, useExecutionStore } from '../../stores/executionStore';
import { Button } from '../ui/Button';

interface FileOperationHistoryProps {
  className?: string;
  maxItems?: number;
}

export function FileOperationHistory({ className, maxItems = 20 }: FileOperationHistoryProps) {
  const fileChanges = useExecutionStore(selectFileChanges);
  const updateFileChange = useExecutionStore((state) => state.updateFileChange);
  const clearFileChanges = useExecutionStore((state) => state.clearFileChanges);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  // Sort by timestamp descending (most recent first)
  const sortedChanges = [...fileChanges]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxItems);

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'create':
        return <FilePlus className="h-4 w-4 text-emerald-400" />;
      case 'modify':
        return <Pencil className="h-4 w-4 text-amber-400" />;
      case 'delete':
        return <FileX className="h-4 w-4 text-red-400" />;
      default:
        return <File className="h-4 w-4 text-gray-400" />;
    }
  };

  const getOperationLabel = (operation: string) => {
    switch (operation) {
      case 'create':
        return 'Created';
      case 'modify':
        return 'Modified';
      case 'delete':
        return 'Deleted';
      default:
        return operation;
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) {
      return 'Just now';
    } else if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    } else if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleUndo = async (change: (typeof fileChanges)[0]) => {
    setUndoingId(change.id);
    try {
      // Determine undo action based on operation type
      if (change.operation === 'create') {
        // Undo create = delete the file
        await invoke('undo_file_operation', {
          operation: 'delete',
          path: change.path,
        });
        toast.success(`Deleted ${change.path.split('/').pop()}`);
      } else if (change.operation === 'modify' && change.oldContent !== undefined) {
        // Undo modify = restore old content
        await invoke('undo_file_operation', {
          operation: 'restore',
          path: change.path,
          content: change.oldContent,
        });
        toast.success(`Restored ${change.path.split('/').pop()}`);
      } else if (change.operation === 'delete' && change.oldContent !== undefined) {
        // Undo delete = recreate the file
        await invoke('undo_file_operation', {
          operation: 'create',
          path: change.path,
          content: change.oldContent,
        });
        toast.success(`Restored ${change.path.split('/').pop()}`);
      }

      updateFileChange(change.id, false); // Mark as rejected/undone
    } catch (error) {
      toast.error(`Failed to undo: ${error}`);
    } finally {
      setUndoingId(null);
    }
  };

  const handleRedo = async (change: (typeof fileChanges)[0]) => {
    setUndoingId(change.id);
    try {
      if (change.operation === 'create' && change.newContent !== undefined) {
        await invoke('undo_file_operation', {
          operation: 'create',
          path: change.path,
          content: change.newContent,
        });
        toast.success(`Recreated ${change.path.split('/').pop()}`);
      } else if (change.operation === 'modify' && change.newContent !== undefined) {
        await invoke('undo_file_operation', {
          operation: 'restore',
          path: change.path,
          content: change.newContent,
        });
        toast.success(`Reapplied changes to ${change.path.split('/').pop()}`);
      } else if (change.operation === 'delete') {
        await invoke('undo_file_operation', {
          operation: 'delete',
          path: change.path,
        });
        toast.success(`Deleted ${change.path.split('/').pop()}`);
      }

      updateFileChange(change.id, true); // Mark as accepted
    } catch (error) {
      toast.error(`Failed to redo: ${error}`);
    } finally {
      setUndoingId(null);
    }
  };

  if (sortedChanges.length === 0) {
    return (
      <div className={cn('flex flex-col items-center justify-center py-8 text-center', className)}>
        <File className="h-8 w-8 text-gray-400 mb-2" />
        <p className="text-sm text-gray-500">No file operations yet</p>
        <p className="text-xs text-gray-400 mt-1">
          File changes will appear here with undo options
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">File History</span>
          <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
            {sortedChanges.length}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={clearFileChanges}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>

      {/* File Changes List */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence>
          {sortedChanges.map((change) => (
            <motion.div
              key={change.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className={cn(
                'border-b border-gray-100 dark:border-gray-800',
                change.accepted === false && 'opacity-50',
              )}
            >
              {/* Main Row */}
              <div
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                onClick={() => setExpandedId(expandedId === change.id ? null : change.id)}
              >
                {getOperationIcon(change.operation)}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {change.path.split('/').pop()}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{change.path}</p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      change.operation === 'create' &&
                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                      change.operation === 'modify' &&
                        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                      change.operation === 'delete' &&
                        'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                    )}
                  >
                    {getOperationLabel(change.operation)}
                  </span>

                  {change.accepted === false && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                      Undone
                    </span>
                  )}

                  <span className="text-xs text-gray-400">{formatTimestamp(change.timestamp)}</span>

                  {expandedId === change.id ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              <AnimatePresence>
                {expandedId === change.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden bg-gray-50 dark:bg-gray-900/50"
                  >
                    <div className="px-4 py-3 space-y-3">
                      {/* Content Preview */}
                      {change.operation === 'modify' && change.oldContent && change.newContent && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Before</p>
                            <pre className="text-xs font-mono bg-red-50 dark:bg-red-900/20 p-2 rounded overflow-x-auto max-h-32 text-red-600 dark:text-red-400">
                              {change.oldContent.slice(0, 500)}
                              {change.oldContent.length > 500 && '...'}
                            </pre>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">After</p>
                            <pre className="text-xs font-mono bg-emerald-50 dark:bg-emerald-900/20 p-2 rounded overflow-x-auto max-h-32 text-emerald-600 dark:text-emerald-400">
                              {change.newContent.slice(0, 500)}
                              {change.newContent.length > 500 && '...'}
                            </pre>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {change.accepted !== false ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUndo(change);
                            }}
                            disabled={undoingId === change.id}
                            className="text-xs"
                          >
                            {undoingId === change.id ? (
                              <span className="animate-spin mr-1">⟳</span>
                            ) : (
                              <RotateCcw className="h-3 w-3 mr-1" />
                            )}
                            Undo
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRedo(change);
                            }}
                            disabled={undoingId === change.id}
                            className="text-xs"
                          >
                            {undoingId === change.id ? (
                              <span className="animate-spin mr-1">⟳</span>
                            ) : (
                              <RotateCw className="h-3 w-3 mr-1" />
                            )}
                            Redo
                          </Button>
                        )}

                        {change.accepted === true && (
                          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3 w-3" />
                            Applied
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default FileOperationHistory;
