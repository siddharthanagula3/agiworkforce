/**
 * VersionHistoryDialog Component
 *
 * Dialog for viewing artifact version history and rolling back to previous versions.
 */

import { formatDistanceToNow } from 'date-fns';
import { Check, GitBranch, RotateCcw } from 'lucide-react';
import React from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/Tooltip';
import type { ArtifactVersion } from '@/stores/artifactStore';

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: ArtifactVersion[];
  currentVersion: number;
  onRollback: (version: number) => void;
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  versions,
  currentVersion,
  onRollback,
}: VersionHistoryDialogProps) {
  const [selectedVersion, setSelectedVersion] = React.useState<number | null>(null);

  // Reset selection when dialog opens
  React.useEffect(() => {
    if (open) {
      setSelectedVersion(null);
    }
  }, [open]);

  const sortedVersions = React.useMemo(
    () => [...versions].sort((a, b) => b.version - a.version),
    [versions]
  );

  const handleRollback = () => {
    if (selectedVersion !== null) {
      onRollback(selectedVersion);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Version History
          </DialogTitle>
          <DialogDescription>
            View and restore previous versions of this artifact.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-2">
            {sortedVersions.map((version) => {
              const isCurrent = version.version === currentVersion;
              const isSelected = version.version === selectedVersion;

              return (
                <div
                  key={version.version}
                  className={cn(
                    'p-3 rounded-lg border cursor-pointer transition-colors',
                    isCurrent && 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
                    isSelected && !isCurrent && 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
                    !isCurrent && !isSelected && 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                  )}
                  onClick={() => !isCurrent && setSelectedVersion(version.version)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isCurrent ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        v{version.version}
                      </Badge>
                      {isCurrent && (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                          <Check className="h-3 w-3 mr-1" />
                          Current
                        </Badge>
                      )}
                      {isSelected && !isCurrent && (
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-600">
                          Selected
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-zinc-500">
                      {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {version.change_description && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                      {version.change_description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-zinc-500">
                    <span>{formatBytes(version.size_bytes)}</span>
                    <span className="font-mono truncate max-w-[200px]" title={version.content_hash}>
                      {version.content_hash.slice(0, 8)}...
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <p className="text-sm text-zinc-500">
            {selectedVersion !== null
              ? `Rolling back will restore version ${selectedVersion}`
              : 'Select a version to restore'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleRollback}
                  disabled={selectedVersion === null}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore Version
                </Button>
              </TooltipTrigger>
              {selectedVersion === null && (
                <TooltipContent>Select a version to restore</TooltipContent>
              )}
            </Tooltip>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
