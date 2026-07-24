import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Download, ExternalLink, Loader2, ShieldAlert, X } from 'lucide-react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';

import { exportCloudAccountData } from '../../../api/cloudAccountData';
import { openDesktopCloudAccountWindow } from '../../../services/desktopCloudAccountWindow';
import { Button } from '@/components/ui/Button';
import { useIsMounted } from '@/hooks/useIsMounted';

export function CloudDataSection() {
  const isMounted = useIsMounted();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [openingAccount, setOpeningAccount] = useState(false);
  const successTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (successTimer.current) window.clearTimeout(successTimer.current);
    },
    [],
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    setExportSuccess(false);
    try {
      const json = await exportCloudAccountData();
      const savePath = await save({
        defaultPath: `agi-cloud-export-${new Date().toISOString().slice(0, 10)}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!savePath) return;
      await writeTextFile(savePath, json);
      if (!isMounted.current) return;
      setExportSuccess(true);
      if (successTimer.current) window.clearTimeout(successTimer.current);
      successTimer.current = window.setTimeout(() => {
        if (isMounted.current) setExportSuccess(false);
      }, 5000);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Could not export your Cloud account data.';
      if (isMounted.current) setExportError(message);
      toast.error('Cloud export failed', { description: message });
    } finally {
      if (isMounted.current) setExporting(false);
    }
  }, [isMounted]);

  const handleManageAccount = useCallback(async () => {
    setOpeningAccount(true);
    try {
      await openDesktopCloudAccountWindow('/settings/privacy', 'Manage AGI Cloud privacy');
    } catch (cause) {
      toast.error('Could not open Cloud privacy controls', {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      if (isMounted.current) setOpeningAccount(false);
    }
  }, [isMounted]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">Cloud account data</h3>
        <p className="text-sm text-muted-foreground">
          These controls use your authenticated AGI Cloud account. They never export or delete Local
          chats, device files, or provider keys.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-muted p-3">
            <Download className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold">Export Cloud account data</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Download the reviewed, tenant-scoped JSON export for your profile, subscription,
              billing records, managed usage summary, devices, and organization memberships.
            </p>
            <Button
              size="sm"
              className="mt-3"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting…
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export Cloud data
                </>
              )}
            </Button>
            {exportSuccess ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-emerald-500">
                <Check className="h-4 w-4" />
                Cloud data exported successfully.
              </p>
            ) : null}
            {exportError ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-red-500">
                <X className="h-4 w-4" />
                {exportError}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md bg-red-500/10 p-3">
            <ShieldAlert className="h-5 w-5 text-red-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-semibold text-red-500 dark:text-red-400">Account and deletion</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the canonical Cloud account controls before changing or deleting hosted data.
              Desktop will not report success from a device-only deletion marker.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              disabled={openingAccount}
              onClick={() => void handleManageAccount()}
            >
              {openingAccount ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening…
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Cloud privacy
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
