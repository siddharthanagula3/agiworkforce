import { AlertCircle, FolderPlus, FolderX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getSimpleErrorMessage } from '../../lib/errorMessages';
import { invoke, isTauri } from '../../lib/tauri-mock';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/AlertDialog';
import { Button } from '@/ui/Button';
import { ScrollArea } from '@/ui/ScrollArea';

export function AllowedDirectoriesSettings() {
  const { t } = useTranslation();
  const allowedDirectories = useSettingsStore((state) => state.allowedDirectories);
  const addAllowedDirectory = useSettingsStore((state) => state.addAllowedDirectory);
  const removeAllowedDirectory = useSettingsStore((state) => state.removeAllowedDirectory);
  const [error, setError] = useState<string | null>(null);
  const [removeDirPath, setRemoveDirPath] = useState<string | null>(null);

  const handleBrowse = async () => {
    setError(null);
    if (!isTauri) {
      toast.info('Folder selection requires the desktop app');
      return;
    }
    try {
      const selected = await invoke<string | null>('pick_folder', { purpose: 'allowed_folder' });
      if (selected === null) return;
      if (allowedDirectories.includes(selected)) {
        setError('Directory already added');
        return;
      }
      addAllowedDirectory(selected);
    } catch (e: unknown) {
      setError(getSimpleErrorMessage(e));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-h3 mb-2">{t('settings:allowedDirectories')}</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Specify which directories the agent is allowed to access. This restricts file operations
          (read/write/delete) to these paths for security.
        </p>
      </div>

      <div className="space-y-4">
        <Button variant="outline" onClick={handleBrowse}>
          <FolderPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t('add')}
        </Button>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-2 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="border rounded-md">
          <div className="p-3 bg-muted border-b text-sm font-medium">
            Allowed Paths ({allowedDirectories.length})
          </div>
          <ScrollArea className="h-[200px]">
            {allowedDirectories.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                <FolderX className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">No directories allowed yet.</p>
                <p className="text-xs">
                  The agent won't be able to access files until you add paths.
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {allowedDirectories.map((path) => (
                  <div
                    key={path}
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted group transition-colors"
                  >
                    <code className="text-xs font-mono break-all">{path}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoveDirPath(path)}
                      title="Remove path"
                      aria-label={`Remove allowed path ${path}`}
                    >
                      <FolderX className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      <AlertDialog
        open={removeDirPath !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveDirPath(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this directory?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent will lose access to files in this path.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (removeDirPath !== null) {
                  removeAllowedDirectory(removeDirPath);
                  setRemoveDirPath(null);
                }
              }}
            >
              {t('remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
