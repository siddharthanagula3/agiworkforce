import { useEffect, useState } from 'react';
import { useEditingStore } from '../../stores/editingStore';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Code,
  GitMerge,
  Users,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ScrollArea } from '../ui/ScrollArea';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/Tooltip';

interface ConflictResolverProps {
  filePath: string;
  className?: string;
}

export function ConflictResolver({ filePath, className }: ConflictResolverProps) {
  const { pendingChanges, conflicts, detectConflicts, resolveConflict } = useEditingStore();
  const [expandedConflicts, setExpandedConflicts] = useState<Set<number>>(new Set());

  const diff = pendingChanges.get(filePath);
  const fileConflicts = conflicts.get(filePath) || [];

  useEffect(() => {
    if (diff) {
      detectConflicts(filePath, diff.modifiedContent);
    }
  }, [filePath, diff, detectConflicts]);

  if (!diff) {
    return null;
  }

  if (fileConflicts.length === 0) {
    return null;
  }

  const toggleConflict = (index: number) => {
    setExpandedConflicts(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleResolve = (conflictIndex: number, resolution: 'ours' | 'theirs' | 'both') => {
    resolveConflict(filePath, conflictIndex, resolution);
  };

  return (
    <Card className={cn('p-4 space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-semibold">Merge Conflicts</h3>
          <Badge variant="destructive">
            {fileConflicts.length} conflict{fileConflicts.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Conflicts List */}
      <ScrollArea className="max-h-96">
        <div className="space-y-3">
          {fileConflicts.map((conflict, index) => {
            const isExpanded = expandedConflicts.has(index);

            return (
              <div
                key={index}
                className="border border-amber-500/30 rounded-lg overflow-hidden bg-amber-500/5"
              >
                {/* Conflict Header */}
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-amber-500/10 transition-colors"
                  onClick={() => toggleConflict(index)}
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-amber-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-amber-500" />
                    )}
                    <GitMerge className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium">
                      Conflict {index + 1}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Lines {conflict.startLine + 1} - {conflict.endLine + 1}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {conflict.ourContent.split('\n').length} vs {conflict.theirContent.split('\n').length} lines
                    </Badge>
                  </div>
                </div>

                {/* Conflict Content */}
                {isExpanded && (
                  <div className="border-t border-amber-500/30">
                    {/* Our Changes */}
                    <div className="p-3 border-b border-amber-500/20 bg-blue-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                          Our Changes
                        </span>
                      </div>
                      <pre className="text-xs font-mono p-2 bg-blue-500/5 rounded border border-blue-500/20 overflow-x-auto">
                        <code>{conflict.ourContent}</code>
                      </pre>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full border-blue-500/30 hover:bg-blue-500/10"
                            onClick={() => handleResolve(index, 'ours')}
                          >
                            Accept Ours
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Accept our changes and discard theirs</TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Their Changes */}
                    <div className="p-3 border-b border-amber-500/20 bg-green-500/5">
                      <div className="flex items-center gap-2 mb-2">
                        <Code className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium text-green-600 dark:text-green-400">
                          Their Changes
                        </span>
                      </div>
                      <pre className="text-xs font-mono p-2 bg-green-500/5 rounded border border-green-500/20 overflow-x-auto">
                        <code>{conflict.theirContent}</code>
                      </pre>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2 w-full border-green-500/30 hover:bg-green-500/10"
                            onClick={() => handleResolve(index, 'theirs')}
                          >
                            Accept Theirs
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Accept their changes and discard ours</TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Accept Both */}
                    <div className="p-3 bg-muted/20">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="default"
                            size="sm"
                            className="w-full"
                            onClick={() => handleResolve(index, 'both')}
                          >
                            <GitMerge className="h-4 w-4 mr-2" />
                            Accept Both
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Keep both changes (ours first, then theirs)</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Instructions */}
      <div className="p-3 bg-muted/20 rounded-lg border border-border">
        <p className="text-xs text-muted-foreground">
          Resolve conflicts by choosing which changes to keep. You can accept your changes,
          their changes, or both. Conflicts must be resolved before applying changes.
        </p>
      </div>
    </Card>
  );
}
