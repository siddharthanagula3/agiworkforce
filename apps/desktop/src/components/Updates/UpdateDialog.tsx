import { AlertCircle, ArrowRight, Check, Download, Loader2, RefreshCw, X } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { useUpdater } from '../../hooks/useUpdater';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { cn } from '../../lib/utils';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * UpdateDialog component
 *
 * Modal dialog showing update details with version comparison,
 * release notes, download progress, and action buttons.
 */
export function UpdateDialog({ open, onOpenChange }: UpdateDialogProps) {
  const {
    status,
    updateInfo,
    downloadProgress,
    error,
    isDownloading,
    currentVersion,
    downloadAndInstall,
    dismiss,
    retry,
  } = useUpdater();

  const handleDismiss = useCallback(() => {
    dismiss();
    onOpenChange(false);
  }, [dismiss, onOpenChange]);

  const handleDownload = useCallback(() => {
    void downloadAndInstall();
  }, [downloadAndInstall]);

  const handleRetry = useCallback(() => {
    retry();
  }, [retry]);

  // Format bytes to human readable
  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  // Format release date
  const formattedDate = useMemo(() => {
    if (!updateInfo?.releaseDate) return null;
    try {
      return new Date(updateInfo.releaseDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return updateInfo.releaseDate;
    }
  }, [updateInfo?.releaseDate]);

  // Determine dialog state
  const isError = status === 'error';
  const isDownloadComplete = status === 'downloaded';
  const isInstalling = status === 'installing';
  const showProgress = status === 'downloading' && downloadProgress;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isError ? (
              <>
                <AlertCircle className="h-5 w-5 text-destructive" />
                Update Error
              </>
            ) : isDownloadComplete ? (
              <>
                <Check className="h-5 w-5 text-green-500" />
                Update Ready
              </>
            ) : (
              <>
                <Download className="h-5 w-5 text-primary" />
                Update Available
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {isError
              ? 'There was a problem downloading the update.'
              : isDownloadComplete
                ? 'The update has been downloaded and is ready to install.'
                : 'A new version of AGI Workforce is available.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Version comparison */}
          {updateInfo && !isError && (
            <div className="flex items-center justify-center gap-4 rounded-lg bg-muted/50 p-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Current</p>
                <p className="text-lg font-mono font-semibold">v{currentVersion}</p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">New</p>
                <p className="text-lg font-mono font-semibold text-primary">
                  v{updateInfo.version}
                </p>
              </div>
            </div>
          )}

          {/* Release date */}
          {formattedDate && !isError && (
            <p className="text-sm text-muted-foreground text-center">Released on {formattedDate}</p>
          )}

          {/* Download progress */}
          {showProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Downloading...</span>
                <span className="font-medium">{downloadProgress.percent}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${downloadProgress.percent}%` }}
                />
              </div>
              {downloadProgress.total > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.total)}
                </p>
              )}
            </div>
          )}

          {/* Installing indicator */}
          {isInstalling && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-muted-foreground">Installing update and restarting...</span>
            </div>
          )}

          {/* Error message */}
          {isError && error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Release notes */}
          {updateInfo?.releaseNotes && !isError && !showProgress && !isInstalling && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">What&apos;s New</h4>
              <div
                className={cn(
                  'max-h-48 overflow-y-auto rounded-lg border bg-muted/30 p-4',
                  'prose prose-sm dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-li:my-0',
                )}
              >
                <ReactMarkdown>{updateInfo.releaseNotes}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {isError ? (
            <>
              <Button variant="outline" onClick={handleDismiss}>
                Close
              </Button>
              <Button onClick={handleRetry}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </>
          ) : isDownloadComplete ? (
            <>
              <Button variant="outline" onClick={handleDismiss}>
                Later
              </Button>
              <Button onClick={handleDownload}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Restart Now
              </Button>
            </>
          ) : isDownloading || isInstalling ? (
            <Button variant="outline" onClick={handleDismiss} disabled={isInstalling}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleDismiss}>
                Remind Me Later
              </Button>
              <Button onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download & Install
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpdateDialog;
