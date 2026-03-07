import { useState } from 'react';
import { AlertCircle, Check, Download, Info, Loader2, RefreshCw, Settings2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { Label } from '../ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { useUpdater } from '../../hooks/useUpdater';
import { useUpdaterStore } from '../../stores/updaterStore';
import { UpdateDialog } from '../Updates/UpdateDialog';

export function UpdateSettings() {
  const {
    status,
    updateInfo,
    downloadProgress,
    error,
    isChecking,
    currentVersion,
    checkForUpdates,
    downloadAndInstall,
    retry,
  } = useUpdater();

  const autoCheckEnabled = useUpdaterStore((state) => state.autoCheckEnabled);
  const checkIntervalHours = useUpdaterStore((state) => state.checkIntervalHours);
  const lastCheckTime = useUpdaterStore((state) => state.lastCheckTime);
  const setAutoCheckEnabled = useUpdaterStore((state) => state.setAutoCheckEnabled);
  const setCheckIntervalHours = useUpdaterStore((state) => state.setCheckIntervalHours);

  const [dialogOpen, setDialogOpen] = useState(false);

  // Format last check time
  const formatLastCheck = () => {
    if (!lastCheckTime) return 'Never';
    const date = new Date(lastCheckTime);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  // Get status display info
  const getStatusInfo = () => {
    switch (status) {
      case 'checking':
        return {
          title: 'Checking for Updates...',
          description: 'Please wait while we check for available updates.',
          icon: <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />,
        };
      case 'available':
        return {
          title: 'Update Available',
          description: `Version ${updateInfo?.version} is available for download.`,
          icon: <Download className="h-6 w-6 text-muted-foreground" />,
        };
      case 'downloading':
        return {
          title: 'Downloading Update...',
          description: `Downloading version ${updateInfo?.version}... ${downloadProgress?.percent || 0}%`,
          icon: <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />,
        };
      case 'downloaded':
        return {
          title: 'Update Ready',
          description: 'The update has been downloaded. Restart to apply.',
          icon: <Check className="h-6 w-6 text-green-500" />,
        };
      case 'installing':
        return {
          title: 'Installing Update...',
          description: 'Restarting the application to apply the update.',
          icon: <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />,
        };
      case 'error':
        return {
          title: 'Update Check Failed',
          description: error || 'An error occurred while checking for updates.',
          icon: <AlertCircle className="h-6 w-6 text-destructive" />,
        };
      case 'up-to-date':
      default:
        return {
          title: 'You have the latest version',
          description: 'No updates are currently available.',
          icon: <Check className="h-6 w-6 text-green-500" />,
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Software Update</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Check for updates to the AGI Workforce desktop application
        </p>
      </div>

      {/* Update Status Card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-muted p-3">{statusInfo.icon}</div>
          <div className="flex-1 space-y-4">
            <div>
              <h4 className="font-semibold mb-1">{statusInfo.title}</h4>
              <p className="text-sm text-muted-foreground">{statusInfo.description}</p>
            </div>

            {/* Download progress bar */}
            {status === 'downloading' && downloadProgress && (
              <div className="space-y-1">
                <div className="w-full bg-secondary rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
                {downloadProgress.total > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {Math.round(downloadProgress.downloaded / 1024 / 1024)} MB /{' '}
                    {Math.round(downloadProgress.total / 1024 / 1024)} MB
                  </p>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {(status === 'idle' || status === 'up-to-date') && (
                <Button
                  onClick={() => void checkForUpdates()}
                  variant="outline"
                  size="sm"
                  disabled={isChecking}
                >
                  {isChecking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Check for Updates
                    </>
                  )}
                </Button>
              )}

              {status === 'available' && (
                <>
                  <Button onClick={() => void downloadAndInstall()} size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Download & Install
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
                    View Details
                  </Button>
                </>
              )}

              {status === 'downloaded' && (
                <Button onClick={() => void downloadAndInstall()} size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Restart Now
                </Button>
              )}

              {status === 'error' && (
                <Button onClick={retry} variant="outline" size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
              )}
            </div>

            {/* Version and last check info */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
              <div className="flex items-center gap-2">
                <Info className="h-3 w-3" />
                <span>Current Version: {currentVersion}</span>
              </div>
              <span>|</span>
              <span>Last checked: {formatLastCheck()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Update Preferences Card */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-muted p-3">
            <Settings2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h4 className="font-semibold mb-1">Update Preferences</h4>
              <p className="text-sm text-muted-foreground">
                Configure how the application checks for updates
              </p>
            </div>

            <div className="space-y-4">
              {/* Auto-check toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-check" className="text-sm font-medium">
                    Automatic Update Checks
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically check for updates when the app starts
                  </p>
                </div>
                <Switch
                  id="auto-check"
                  checked={autoCheckEnabled}
                  onCheckedChange={setAutoCheckEnabled}
                />
              </div>

              {/* Check interval */}
              {autoCheckEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="check-interval" className="text-sm font-medium">
                    Check Frequency
                  </Label>
                  <Select
                    value={checkIntervalHours.toString()}
                    onValueChange={(value) => setCheckIntervalHours(parseInt(value, 10))}
                  >
                    <SelectTrigger id="check-interval" className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Every hour</SelectItem>
                      <SelectItem value="6">Every 6 hours</SelectItem>
                      <SelectItem value="12">Every 12 hours</SelectItem>
                      <SelectItem value="24">Daily</SelectItem>
                      <SelectItem value="168">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Update Dialog */}
      <UpdateDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
