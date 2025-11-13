/**
 * Files Panel Component
 *
 * Shows file changes with Monaco diff editor.
 * Allows accepting/rejecting individual changes.
 */

import { useState, useEffect } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import {
  File,
  FilePlus,
  FileEdit,
  FileX,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  useExecutionStore,
  selectFileChanges,
  selectActiveGoal,
} from '../../stores/executionStore';
import type { FileChange } from '../../stores/executionStore';
import { Button } from '../ui/Button';

export interface FilesPanelProps {
  className?: string;
}

export function FilesPanel({ className }: FilesPanelProps) {
  const fileChanges = useExecutionStore(selectFileChanges);
  const activeGoal = useExecutionStore(selectActiveGoal);
  const updateFileChange = useExecutionStore((state) => state.updateFileChange);
  const [selectedFile, setSelectedFile] = useState<FileChange | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Auto-select first pending file
  useEffect(() => {
    if (!selectedFile && fileChanges.length > 0) {
      const firstPending = fileChanges.find((f) => f.accepted === null);
      if (firstPending) {
        setSelectedFile(firstPending);
        setExpandedFiles((prev) => new Set([...prev, firstPending.id]));
      }
    }
  }, [fileChanges, selectedFile]);

  const toggleFileExpansion = (fileId: string) => {
    setExpandedFiles((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fileId)) {
        newSet.delete(fileId);
      } else {
        newSet.add(fileId);
      }
      return newSet;
    });
  };

  const handleAccept = (fileChange: FileChange) => {
    updateFileChange(fileChange.id, true);
    // Move to next pending file
    const nextPending = fileChanges.find((f) => f.id !== fileChange.id && f.accepted === null);
    setSelectedFile(nextPending || null);
  };

  const handleReject = (fileChange: FileChange) => {
    updateFileChange(fileChange.id, false);
    // Move to next pending file
    const nextPending = fileChanges.find((f) => f.id !== fileChange.id && f.accepted === null);
    setSelectedFile(nextPending || null);
  };

  const pendingCount = fileChanges.filter((f) => f.accepted === null).length;
  const acceptedCount = fileChanges.filter((f) => f.accepted === true).length;
  const rejectedCount = fileChanges.filter((f) => f.accepted === false).length;

  if (!activeGoal) {
    return (
      <div className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center">
          <File className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No active execution</p>
          <p className="mt-1 text-xs text-muted-foreground">File changes will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex h-full', className)}>
      {/* File list sidebar */}
      <div className="w-80 border-r border-border">
        {/* Header */}
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">File Changes</h3>
          <div className="mt-2 flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">
              Pending: <span className="font-medium text-foreground">{pendingCount}</span>
            </span>
            <span className="text-muted-foreground">
              Accepted: <span className="font-medium text-green-500">{acceptedCount}</span>
            </span>
            <span className="text-muted-foreground">
              Rejected: <span className="font-medium text-destructive">{rejectedCount}</span>
            </span>
          </div>
        </div>

        {/* File list */}
        <div className="overflow-y-auto" style={{ height: 'calc(100% - 73px)' }}>
          {fileChanges.length === 0 ? (
            <div className="flex h-full items-center justify-center p-4">
              <p className="text-center text-sm text-muted-foreground">No file changes yet</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {fileChanges.map((file) => (
                <FileListItem
                  key={file.id}
                  file={file}
                  isSelected={selectedFile?.id === file.id}
                  isExpanded={expandedFiles.has(file.id)}
                  onSelect={() => setSelectedFile(file)}
                  onToggleExpand={() => toggleFileExpansion(file.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Diff viewer */}
      <div className="flex-1">
        {selectedFile ? (
          <div className="flex h-full flex-col">
            {/* File header */}
            <div className="border-b border-border px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {getOperationIcon(selectedFile.operation)}
                    <h4 className="text-sm font-semibold text-foreground">{selectedFile.path}</h4>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {getOperationLabel(selectedFile.operation)} •{' '}
                    {new Date(selectedFile.timestamp).toLocaleString()}
                  </p>
                </div>

                {/* Action buttons */}
                {selectedFile.accepted === null && (
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReject(selectedFile)}
                      className="border-destructive text-destructive hover:bg-destructive hover:text-white"
                    >
                      <X className="mr-1 h-3 w-3" />
                      Reject
                    </Button>
                    <Button size="sm" onClick={() => handleAccept(selectedFile)}>
                      <Check className="mr-1 h-3 w-3" />
                      Accept
                    </Button>
                  </div>
                )}

                {selectedFile.accepted !== null && (
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium',
                      selectedFile.accepted
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-destructive/10 text-destructive',
                    )}
                  >
                    {selectedFile.accepted ? (
                      <>
                        <Check className="h-4 w-4" />
                        Accepted
                      </>
                    ) : (
                      <>
                        <X className="h-4 w-4" />
                        Rejected
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Monaco diff editor */}
            <div className="flex-1">
              {selectedFile.operation === 'delete' ? (
                <div className="flex h-full flex-col items-center justify-center bg-muted p-8 text-center">
                  <FileX className="h-16 w-16 text-destructive" />
                  <p className="mt-4 text-sm font-medium text-foreground">File will be deleted</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedFile.path}</p>
                </div>
              ) : (
                <DiffEditor
                  original={selectedFile.oldContent || ''}
                  modified={selectedFile.newContent || ''}
                  language={selectedFile.language || 'plaintext'}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    renderSideBySide: true,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">Select a file to view changes</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// File List Item Component
// ========================================

interface FileListItemProps {
  file: FileChange;
  isSelected: boolean;
  isExpanded: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
}

function FileListItem({
  file,
  isSelected,
  isExpanded,
  onSelect,
  onToggleExpand,
}: FileListItemProps) {
  const operationConfig = getOperationConfig(file.operation);
  const OperationIcon = operationConfig.icon;
  const fileName = file.path.split('/').pop() || file.path;
  const filePath = file.path.split('/').slice(0, -1).join('/');

  return (
    <div
      className={cn(
        'group relative cursor-pointer rounded-lg border p-2 transition-colors',
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-transparent hover:border-border hover:bg-accent/50',
        file.accepted === true && 'bg-green-500/5',
        file.accepted === false && 'bg-destructive/5',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        {/* Operation icon */}
        <div
          className={cn(
            'mt-0.5 flex h-5 w-5 items-center justify-center rounded',
            operationConfig.bgColor,
          )}
        >
          <OperationIcon className={cn('h-3 w-3', operationConfig.iconColor)} />
        </div>

        {/* File info */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{fileName}</p>
          {filePath && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{filePath}</p>
          )}
        </div>

        {/* Status indicator */}
        {file.accepted !== null && (
          <div className="flex-shrink-0">
            {file.accepted ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <X className="h-4 w-4 text-destructive" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ========================================
// Helper Functions
// ========================================

function getOperationConfig(operation: FileChange['operation']) {
  switch (operation) {
    case 'create':
      return {
        icon: FilePlus,
        label: 'Create',
        bgColor: 'bg-green-500/10',
        iconColor: 'text-green-500',
      };
    case 'modify':
      return {
        icon: FileEdit,
        label: 'Modify',
        bgColor: 'bg-blue-500/10',
        iconColor: 'text-blue-500',
      };
    case 'delete':
      return {
        icon: FileX,
        label: 'Delete',
        bgColor: 'bg-destructive/10',
        iconColor: 'text-destructive',
      };
  }
}

function getOperationIcon(operation: FileChange['operation']) {
  const config = getOperationConfig(operation);
  const Icon = config.icon;
  return <Icon className={cn('h-4 w-4', config.iconColor)} />;
}

function getOperationLabel(operation: FileChange['operation']) {
  return getOperationConfig(operation).label;
}

export default FilesPanel;
