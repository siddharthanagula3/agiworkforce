import { RefreshCw, Download, Info } from 'lucide-react';
import { Button } from '../ui/Button';
import { useUpdate } from '../../hooks/useUpdate';

export function UpdateSettings() {
  const { status, error, progress, version, checkForUpdates, downloadAndInstall } = useUpdate();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-4">Software Update</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Check for updates to the AGI Workforce desktop application
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-primary/10 p-3">
            <RefreshCw className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h4 className="font-semibold mb-1">
                {status === 'noupdate' && 'You include the latest version'}
                {status === 'available' && 'Update Available'}
                {status === 'downloading' && 'Downloading Update...'}
                {status === 'downloaded' && 'Update Ready'}
                {status === 'error' && 'Update Check Failed'}
              </h4>
              <p className="text-sm text-muted-foreground">
                {status === 'noupdate' && 'No updates are currently available.'}
                {status === 'available' && `Version ${version} is available for download.`}
                {status === 'downloading' && `Downloading version ${version}... ${progress}%`}
                {status === 'downloaded' && 'Restart the application to apply the update.'}
                {status === 'error' && error}
              </p>
            </div>

            {status === 'downloading' && (
              <div className="w-full bg-secondary rounded-full h-2.5">
                <div
                  className="bg-primary h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            )}

            <div className="flex gap-3">
              {status === 'noupdate' && (
                <Button onClick={checkForUpdates} variant="outline" size="sm">
                  Check for Updates
                </Button>
              )}

              {status === 'available' && (
                <Button onClick={downloadAndInstall} size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Download & Install
                </Button>
              )}

              {status === 'downloaded' && (
                <Button onClick={downloadAndInstall} size="sm">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Restart Now
                </Button>
              )}

              {status === 'error' && (
                <Button onClick={checkForUpdates} variant="outline" size="sm">
                  Retry
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
              <Info className="h-3 w-3" />
              <span>Current Version: 5.0.0</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
