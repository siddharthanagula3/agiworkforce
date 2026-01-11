import { useEditingStore } from '../../stores/editingStore';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import {
  FileText,
  Plus,
  Minus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Info,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '../ui/Tooltip';

interface ChangeSummaryProps {
  className?: string;
}

export function ChangeSummary({ className }: ChangeSummaryProps) {
  const {
    getChangesSummary,
    getChangedFiles,
    acceptAllChanges,
    rejectAllChanges,
  } = useEditingStore();

  const stats = getChangesSummary();
  const changedFiles = getChangedFiles();

  const riskLevel = getRiskLevel(stats);

  if (stats.filesChanged === 0) {
    return (
      <Card className={cn('p-6 text-center', className)}>
        <Info className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No pending changes</p>
      </Card>
    );
  }

  return (
    <Card className={cn('p-4 space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Changes Summary</h3>
        </div>
        <Badge variant={riskLevel.variant as any} className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          {riskLevel.label}
        </Badge>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col items-center p-3 rounded-lg bg-muted/30">
          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-1">
            <FileText className="h-4 w-4" />
            Files
          </div>
          <div className="text-2xl font-bold">{stats.filesChanged}</div>
        </div>

        <div className="flex flex-col items-center p-3 rounded-lg bg-green-500/10">
          <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400 mb-1">
            <Plus className="h-4 w-4" />
            Additions
          </div>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {stats.additions}
          </div>
        </div>

        <div className="flex flex-col items-center p-3 rounded-lg bg-red-500/10">
          <div className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400 mb-1">
            <Minus className="h-4 w-4" />
            Deletions
          </div>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {stats.deletions}
          </div>
        </div>
      </div>

      {/* File List */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Changed Files</h4>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {changedFiles.map((file) => (
            <div
              key={file.path}
              className="flex items-center justify-between p-2 rounded-md bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileChangeIcon type={file.type} />
                <span className="text-sm font-mono truncate" title={file.path}>
                  {getFileName(file.path)}
                </span>
              </div>
              <FileChangeBadge type={file.type} status={file.status} />
            </div>
          ))}
        </div>
      </div>

      {/* Risk Indicators */}
      {riskLevel.warnings.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Risk Indicators
          </h4>
          <div className="space-y-1">
            {riskLevel.warnings.map((warning, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-2 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-sm"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI-Generated Description */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
        <p className="text-sm text-foreground/80 leading-relaxed">
          {generateChangeDescription(changedFiles, stats)}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="default"
              className="flex-1 gap-2"
              onClick={() => acceptAllChanges()}
            >
              <CheckCircle className="h-4 w-4" />
              Accept All
            </Button>
          </TooltipTrigger>
          <TooltipContent>Accept all pending changes and write to files</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => rejectAllChanges()}
            >
              <XCircle className="h-4 w-4" />
              Reject All
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reject all pending changes and discard them</TooltipContent>
        </Tooltip>
      </div>
    </Card>
  );
}

function FileChangeIcon({ type }: { type: 'modified' | 'added' | 'deleted' }) {
  switch (type) {
    case 'added':
      return <Plus className="h-4 w-4 text-green-500" />;
    case 'deleted':
      return <Minus className="h-4 w-4 text-red-500" />;
    case 'modified':
      return <FileText className="h-4 w-4 text-amber-500" />;
  }
}

function FileChangeBadge({
  type,
  status
}: {
  type: 'modified' | 'added' | 'deleted';
  status: 'pending' | 'accepted' | 'rejected' | 'partial';
}) {
  const getColor = () => {
    if (status === 'accepted') return 'bg-green-500/20 text-green-700 dark:text-green-400';
    if (status === 'rejected') return 'bg-red-500/20 text-red-700 dark:text-red-400';
    if (status === 'partial') return 'bg-amber-500/20 text-amber-700 dark:text-amber-400';

    switch (type) {
      case 'added':
        return 'bg-green-500/20 text-green-700 dark:text-green-400';
      case 'deleted':
        return 'bg-red-500/20 text-red-700 dark:text-red-400';
      case 'modified':
        return 'bg-amber-500/20 text-amber-700 dark:text-amber-400';
    }
  };

  const getLabel = () => {
    if (status !== 'pending' && status !== 'partial') {
      return status.charAt(0).toUpperCase() + status.slice(1);
    }

    switch (type) {
      case 'added':
        return status === 'partial' ? 'Partial' : 'Added';
      case 'deleted':
        return status === 'partial' ? 'Partial' : 'Deleted';
      case 'modified':
        return status === 'partial' ? 'Partial' : 'Modified';
    }
  };

  return (
    <span className={cn(
      'px-2 py-0.5 rounded text-xs font-medium',
      getColor()
    )}>
      {getLabel()}
    </span>
  );
}

function getFileName(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

function getRiskLevel(stats: { additions: number; deletions: number; filesChanged: number }) {
  const warnings: string[] = [];
  let level: 'low' | 'medium' | 'high' = 'low';

  // Check file count
  if (stats.filesChanged > 10) {
    warnings.push('Large number of files changed');
    level = 'high';
  } else if (stats.filesChanged > 5) {
    warnings.push('Multiple files affected');
    level = 'medium';
  }

  // Check total changes
  const totalChanges = stats.additions + stats.deletions;
  if (totalChanges > 500) {
    warnings.push('Extensive code modifications');
    level = 'high';
  } else if (totalChanges > 200) {
    warnings.push('Significant code changes');
    if (level !== 'high') level = 'medium';
  }

  // Check deletion ratio
  if (stats.deletions > 0 && stats.deletions > stats.additions) {
    warnings.push('More deletions than additions');
    if (level !== 'high') level = 'medium';
  }

  return {
    level,
    label: level.charAt(0).toUpperCase() + level.slice(1) + ' Risk',
    variant: level === 'high' ? 'destructive' : level === 'medium' ? 'default' : 'secondary',
    warnings,
  };
}

function generateChangeDescription(
  files: Array<{ path: string; type: 'modified' | 'added' | 'deleted' }>,
  stats: { additions: number; deletions: number; filesChanged: number }
): string {
  const addedCount = files.filter(f => f.type === 'added').length;
  const modifiedCount = files.filter(f => f.type === 'modified').length;
  const deletedCount = files.filter(f => f.type === 'deleted').length;

  const parts: string[] = [];

  if (addedCount > 0) {
    parts.push(`${addedCount} new file${addedCount > 1 ? 's' : ''}`);
  }
  if (modifiedCount > 0) {
    parts.push(`${modifiedCount} modified file${modifiedCount > 1 ? 's' : ''}`);
  }
  if (deletedCount > 0) {
    parts.push(`${deletedCount} deleted file${deletedCount > 1 ? 's' : ''}`);
  }

  const fileDesc = parts.join(', ');
  const changeDesc = `${stats.additions} addition${stats.additions !== 1 ? 's' : ''} and ${stats.deletions} deletion${stats.deletions !== 1 ? 's' : ''}`;

  return `This change affects ${fileDesc} with a total of ${changeDesc}.`;
}
