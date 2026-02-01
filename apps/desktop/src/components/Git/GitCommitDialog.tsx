/**
 * Git Commit Dialog component.
 *
 * Dialog for creating Git commits with support for commit message
 * subject and body, showing staged files.
 *
 * @module GitCommitDialog
 */

import { Check, GitCommit as GitCommitIcon, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { useGit } from '../../hooks/useGit';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Input } from '../ui/Input';
import { ScrollArea } from '../ui/ScrollArea';
import { Textarea } from '../ui/Textarea';

interface GitCommitDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog open state changes */
  onOpenChange: (open: boolean) => void;
  /** Repository path */
  repoPath: string;
  /** Callback after successful commit */
  onCommitSuccess?: (commitHash: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Git Commit Dialog component.
 *
 * @param props - Component props
 * @returns The Git commit dialog
 *
 * @example
 * ```tsx
 * <GitCommitDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   repoPath="/path/to/repo"
 *   onCommitSuccess={(hash) => console.log('Committed:', hash)}
 * />
 * ```
 */
export function GitCommitDialog({
  open,
  onOpenChange,
  repoPath,
  onCommitSuccess,
  className,
}: GitCommitDialogProps) {
  const { status, loading, setRepoPath, refreshStatus, commit } = useGit(repoPath);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);

  // Update repo path when prop changes
  useEffect(() => {
    setRepoPath(repoPath);
  }, [repoPath, setRepoPath]);

  // Refresh status when dialog opens
  useEffect(() => {
    if (open && repoPath) {
      refreshStatus();
    }
  }, [open, repoPath, refreshStatus]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSubject('');
      setBody('');
    }
  }, [open]);

  const handleCommit = useCallback(async () => {
    if (!subject.trim()) {
      return;
    }

    // Combine subject and body into full message
    const message = body.trim() ? `${subject.trim()}\n\n${body.trim()}` : subject.trim();

    setIsCommitting(true);

    try {
      const commitHash = await commit(message);
      onCommitSuccess?.(commitHash);
      onOpenChange(false);
    } catch {
      // Error is handled by the hook
    } finally {
      setIsCommitting(false);
    }
  }, [subject, body, commit, onCommitSuccess, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl+Enter to commit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (subject.trim() && !isCommitting && (status?.staged.length ?? 0) > 0) {
          handleCommit();
        }
      }
    },
    [subject, isCommitting, status?.staged.length, handleCommit],
  );

  const subjectLength = subject.length;
  const isSubjectTooLong = subjectLength > 72;
  const canCommit = subject.trim().length > 0 && !isCommitting && (status?.staged.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-lg', className)} onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCommitIcon className="h-5 w-5" />
            Create Commit
          </DialogTitle>
          <DialogDescription>
            {status?.staged.length ?? 0} file{(status?.staged.length ?? 0) !== 1 ? 's' : ''} staged
            for commit
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Staged Files Preview */}
          {(status?.staged.length ?? 0) > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Staged Files</label>
              <ScrollArea className="max-h-32 border border-border rounded-md p-2 bg-muted/20">
                <div className="space-y-1">
                  {status?.staged.map((file) => (
                    <div key={file} className="flex items-center gap-2 text-sm">
                      <Check className="h-3 w-3 text-green-500 shrink-0" />
                      <span className="font-mono text-xs truncate" title={file}>
                        {file}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Commit Subject */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="commit-subject" className="text-sm font-medium">
                Commit Subject
              </label>
              <span
                className={cn(
                  'text-xs',
                  isSubjectTooLong ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {subjectLength}/72
              </span>
            </div>
            <Input
              id="commit-subject"
              placeholder="feat: add new feature"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={isCommitting}
              autoFocus
              className={cn(
                isSubjectTooLong && 'border-destructive focus-visible:ring-destructive',
              )}
            />
            {isSubjectTooLong && (
              <p className="text-xs text-destructive">Subject should be 72 characters or less</p>
            )}
          </div>

          {/* Commit Body */}
          <div className="space-y-2">
            <label htmlFor="commit-body" className="text-sm font-medium">
              Description (optional)
            </label>
            <Textarea
              id="commit-body"
              placeholder="Add more details about the changes..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={isCommitting}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Separate subject from body with a blank line
            </p>
          </div>

          {/* No staged files warning */}
          {(status?.staged.length ?? 0) === 0 && !loading && (
            <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                No files are staged for commit. Stage some changes first.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isCommitting}>
            Cancel
          </Button>
          <Button onClick={handleCommit} disabled={!canCommit}>
            {isCommitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Committing...
              </>
            ) : (
              <>
                <GitCommitIcon className="h-4 w-4 mr-2" />
                Commit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
