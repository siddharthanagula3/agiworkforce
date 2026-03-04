import {
  GitCommit,
  GitBranch,
  GitPullRequest,
  Loader2,
  AlertCircle,
  Plus,
  Minus,
  FileText,
} from 'lucide-react';
import { useState } from 'react';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';
import { cn } from '@/lib/utils';

interface GitFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | string;
}

interface GitCommitInfo {
  hash?: string;
  message?: string;
  author?: string;
}

interface GitData {
  operation?: 'commit' | 'diff' | 'status' | 'branch' | string;
  diff?: string;
  commit?: GitCommitInfo;
  files?: GitFile[];
  branch?: string;
}

const FILE_STATUS_COLOR: Record<string, string> = {
  added: 'text-emerald-400',
  modified: 'text-amber-400',
  deleted: 'text-red-400',
  renamed: 'text-blue-400',
};

const FILE_STATUS_CHAR: Record<string, string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
  renamed: 'R',
};

export function InlineGitResult({ result, status }: ToolResultProps) {
  const [expanded, setExpanded] = useState(false);
  const data = result?.data as GitData | undefined;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-zinc-900/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-zinc-400">Running git operation...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-zinc-900/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">Git operation failed</p>
          {result?.error && <p className="text-xs text-zinc-500 mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { operation = 'status', diff, commit, files = [], branch } = data;

  const OpIcon =
    operation === 'commit'
      ? GitCommit
      : operation === 'branch'
        ? GitBranch
        : operation === 'diff'
          ? GitPullRequest
          : FileText;

  const opColor =
    operation === 'commit'
      ? 'text-blue-400'
      : operation === 'branch'
        ? 'text-purple-400'
        : 'text-emerald-400';

  const diffLines = diff ? diff.split('\n') : [];
  const previewLines = diffLines.slice(0, 6);

  return (
    <div className="mt-3 rounded-lg bg-zinc-900/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800/60 border-b border-white/10">
        <OpIcon className={cn('h-4 w-4 shrink-0', opColor)} />
        <span className="text-xs font-mono font-medium text-zinc-300 capitalize">{operation}</span>
        {branch && (
          <span className="ml-auto text-xs text-zinc-500 flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {branch}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {commit && (
          <div className="space-y-1">
            {commit.hash && (
              <span className="text-xs font-mono text-zinc-500">{commit.hash.substring(0, 7)}</span>
            )}
            {commit.message && (
              <p className="text-xs text-zinc-300 line-clamp-2">{commit.message}</p>
            )}
            {commit.author && <p className="text-xs text-zinc-500">by {commit.author}</p>}
          </div>
        )}

        {files.length > 0 && (
          <ul className="space-y-0.5">
            {files.slice(0, 5).map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'font-mono font-bold w-4 shrink-0',
                    FILE_STATUS_COLOR[f.status] ?? 'text-zinc-400',
                  )}
                >
                  {FILE_STATUS_CHAR[f.status] ?? '?'}
                </span>
                <span className="text-zinc-400 truncate font-mono">{f.path}</span>
              </li>
            ))}
            {files.length > 5 && (
              <li className="text-xs text-zinc-600">+ {files.length - 5} more files</li>
            )}
          </ul>
        )}

        {diff && diffLines.length > 0 && (
          <div className="rounded bg-zinc-950/60 overflow-hidden">
            <div className="px-2 py-1 border-b border-white/5 flex items-center justify-between">
              <span className="text-xs text-zinc-500 font-mono">Diff</span>
              {diffLines.length > 6 && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setExpanded(!expanded)}
                  className="h-5 px-1.5 text-xs"
                >
                  {expanded ? 'Collapse' : `+${diffLines.length - 6} lines`}
                </Button>
              )}
            </div>
            <div className="p-2 max-h-48 overflow-auto">
              {(expanded ? diffLines : previewLines).map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    'text-xs font-mono leading-5 flex items-center gap-1',
                    line.startsWith('+') && !line.startsWith('+++')
                      ? 'text-emerald-400 bg-emerald-500/5'
                      : line.startsWith('-') && !line.startsWith('---')
                        ? 'text-red-400 bg-red-500/5'
                        : 'text-zinc-500',
                  )}
                >
                  {line.startsWith('+') && !line.startsWith('+++') && (
                    <Plus className="h-2.5 w-2.5 shrink-0" />
                  )}
                  {line.startsWith('-') && !line.startsWith('---') && (
                    <Minus className="h-2.5 w-2.5 shrink-0" />
                  )}
                  <span className="whitespace-pre">{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
