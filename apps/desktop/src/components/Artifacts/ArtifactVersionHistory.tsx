/**
 * ArtifactVersionHistory
 *
 * Standalone component that accepts an artifactId, fetches version history
 * from the artifact store, shows a vertical timeline, and renders a
 * side-by-side diff when a non-current version is selected.
 * The "Restore" button calls artifactStore.rollbackArtifact().
 */

import { formatDistanceToNow } from 'date-fns';
import { Check, ChevronRight, GitBranch, Loader2, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { useArtifactStore, type ArtifactVersion, type VersionDiff } from '@/stores/artifactStore';

interface Props {
  artifactId: string;
  currentVersion: number;
  className?: string;
  onRollbackSuccess?: () => void;
}

export function ArtifactVersionHistory({
  artifactId,
  currentVersion,
  className,
  onRollbackSuccess,
}: Props) {
  const { getVersionHistory, getVersionDiff, rollbackArtifact } = useArtifactStore();

  const [versions, setVersions] = useState<ArtifactVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  useEffect(() => {
    if (!artifactId) return;
    let cancelled = false;
    setIsLoading(true);
    setSelected(null);
    setDiff(null);
    getVersionHistory(artifactId)
      .then((h) => {
        if (!cancelled) setVersions(h ? [...h].sort((a, b) => b.version - a.version) : []);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load version history');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId, getVersionHistory]);

  useEffect(() => {
    if (selected === null || selected === currentVersion) {
      setDiff(null);
      return;
    }
    let cancelled = false;
    setIsDiffLoading(true);
    setDiff(null);
    const from = Math.min(selected, currentVersion);
    const to = Math.max(selected, currentVersion);
    getVersionDiff(artifactId, from, to)
      .then((r) => {
        if (!cancelled) setDiff(r);
      })
      .catch(() => {
        if (!cancelled) toast.error('Failed to load diff');
      })
      .finally(() => {
        if (!cancelled) setIsDiffLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId, selected, currentVersion, getVersionDiff]);

  const handleRollback = useCallback(async () => {
    if (selected === null || isRollingBack) return;
    setIsRollingBack(true);
    try {
      const ok = await rollbackArtifact(artifactId, selected);
      if (ok) {
        toast.success(`Rolled back to v${selected}`);
        setSelected(null);
        setDiff(null);
        onRollbackSuccess?.();
      } else toast.error('Rollback failed');
    } catch {
      toast.error('Rollback failed');
    } finally {
      setIsRollingBack(false);
    }
  }, [artifactId, selected, isRollingBack, rollbackArtifact, onRollbackSuccess]);

  if (isLoading)
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );

  if (!versions.length)
    return (
      <div
        className={cn('flex items-center justify-center py-12 text-zinc-500 text-sm', className)}
      >
        No version history available.
      </div>
    );

  return (
    <div className={cn('flex flex-col min-h-0', className)}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <GitBranch className="h-4 w-4 text-zinc-500" />
        <span className="text-sm font-medium">Version History</span>
        <Badge variant="secondary" className="text-xs ml-auto">
          {versions.length}
        </Badge>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Timeline */}
        <ScrollArea className="w-44 shrink-0 border-r border-zinc-200 dark:border-zinc-800">
          <div className="relative py-3 pl-6 pr-3 space-y-0">
            <div className="absolute left-[1.35rem] top-6 bottom-6 w-px bg-zinc-200 dark:bg-zinc-700" />
            {versions.map((v) => {
              const isCurrent = v.version === currentVersion;
              const isSelected = v.version === selected;
              return (
                <div key={v.version} className="relative pb-4 last:pb-0">
                  <div
                    className={cn(
                      'absolute -left-[0.875rem] top-1.5 h-3 w-3 rounded-full border-2',
                      isCurrent
                        ? 'border-green-500 bg-green-500'
                        : isSelected
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setSelected(isCurrent ? null : v.version)}
                    className={cn(
                      'text-left rounded-lg px-2 py-1.5 transition-colors w-full',
                      isCurrent && 'bg-green-50 dark:bg-green-900/20',
                      isSelected && !isCurrent && 'bg-blue-50 dark:bg-blue-900/20',
                      !isCurrent && !isSelected && 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50',
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                        v{v.version}
                      </span>
                      {isCurrent && <Check className="h-3 w-3 text-green-500" />}
                      {isSelected && !isCurrent && (
                        <ChevronRight className="h-3 w-3 text-blue-500" />
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400">
                      {formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}
                    </div>
                    <div className="text-[10px] text-zinc-400">{formatBytes(v.size_bytes)}</div>
                    {v.change_description && (
                      <div className="text-[10px] text-zinc-500 mt-0.5 leading-tight truncate">
                        {v.change_description}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Diff panel */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {selected === null ? (
            <div className="flex items-center justify-center flex-1 text-zinc-400 text-sm px-4 text-center">
              Select a version to compare with the current version.
            </div>
          ) : selected === currentVersion ? (
            <div className="flex items-center justify-center flex-1 text-zinc-400 text-sm px-4 text-center">
              This is the current version.
            </div>
          ) : isDiffLoading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
            </div>
          ) : diff ? (
            <DiffPanel diff={diff} />
          ) : (
            <div className="flex items-center justify-center flex-1 text-zinc-400 text-sm px-4">
              No diff available.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
        <span className="text-xs text-zinc-500">
          {selected !== null && selected !== currentVersion
            ? `Restore v${selected} as current`
            : 'Select a previous version to restore'}
        </span>
        <Button
          size="sm"
          onClick={handleRollback}
          disabled={selected === null || selected === currentVersion || isRollingBack}
          className="gap-1.5 text-xs"
        >
          {isRollingBack ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Restore
        </Button>
      </div>
    </div>
  );
}

function DiffPanel({ diff }: { diff: VersionDiff }) {
  const fromLines = diff.from_content.split('\n');
  const toLines = diff.to_content.split('\n');
  const maxLines = Math.max(fromLines.length, toLines.length);

  return (
    <ScrollArea className="flex-1">
      <div className="p-3">
        <div className="flex items-center justify-between mb-2 text-xs text-zinc-500">
          <span>
            v{diff.from_version} {' → '} v{diff.to_version}
          </span>
          <span className="text-zinc-400">
            {formatDistanceToNow(new Date(diff.from_timestamp), { addSuffix: true })} {' → '}{' '}
            {formatDistanceToNow(new Date(diff.to_timestamp), { addSuffix: true })}
          </span>
        </div>
        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden text-xs font-mono">
          <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-700">
            <div className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] font-sans">
              v{diff.from_version} — before
            </div>
            <div className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-[10px] font-sans">
              v{diff.to_version} — after
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {Array.from({ length: maxLines }, (_, i) => {
              const from = fromLines[i];
              const to = toLines[i];
              const changed = from !== to;
              return (
                <div
                  key={i}
                  className="grid grid-cols-2 divide-x divide-zinc-100 dark:divide-zinc-800"
                >
                  <div
                    className={cn(
                      'px-2 py-0.5 leading-5 whitespace-pre-wrap break-all',
                      changed && from !== undefined
                        ? 'bg-red-50/60 dark:bg-red-900/10 text-red-700 dark:text-red-300'
                        : 'text-zinc-600 dark:text-zinc-400',
                      from === undefined && 'bg-zinc-50 dark:bg-zinc-900/50',
                    )}
                  >
                    {from ?? ''}
                  </div>
                  <div
                    className={cn(
                      'px-2 py-0.5 leading-5 whitespace-pre-wrap break-all',
                      changed && to !== undefined
                        ? 'bg-green-50/60 dark:bg-green-900/10 text-green-700 dark:text-green-300'
                        : 'text-zinc-600 dark:text-zinc-400',
                      to === undefined && 'bg-zinc-50 dark:bg-zinc-900/50',
                    )}
                  >
                    {to ?? ''}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
