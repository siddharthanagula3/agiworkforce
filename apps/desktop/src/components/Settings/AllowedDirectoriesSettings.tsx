import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import { AlertCircle, FolderPlus, FolderX } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { isTauri } from '../../lib/tauri-mock';
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
} from '../ui/AlertDialog';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { ScrollArea } from '../ui/ScrollArea';

export function AllowedDirectoriesSettings() {
  // Use individual selectors to prevent re-renders on unrelated state changes
  const allowedDirectories = useSettingsStore((state) => state.allowedDirectories);
  const addAllowedDirectory = useSettingsStore((state) => state.addAllowedDirectory);
  const removeAllowedDirectory = useSettingsStore((state) => state.removeAllowedDirectory);
  const [manualPath, setManualPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [removeDirPath, setRemoveDirPath] = useState<string | null>(null);

  const handleAddManualPath = async () => {
    if (!manualPath.trim()) return;
    setError(null);

    const path = manualPath.trim();

    // On web, skip filesystem validation and just add the path
    if (!isTauri) {
      if (allowedDirectories.includes(path)) {
        setError('Directory already added');
        return;
      }
      addAllowedDirectory(path);
      setManualPath('');
      return;
    }

    try {
      const pathExists = await exists(path);
      if (!pathExists) {
        setError('Directory does not exist');
        return;
      }

      if (allowedDirectories.includes(path)) {
        setError('Directory already added');
        return;
      }

      addAllowedDirectory(path);
      setManualPath('');
    } catch (e) {
      // SET-003 fix: Don't add path if verification fails - require explicit user action
      console.error('Failed to validate path:', e);
      setError(
        'Could not verify path. Please check the path exists and try again, or use Browse to select.',
      );
    }
  };

  const handleBrowse = async () => {
    setError(null);
    if (!isTauri) {
      toast.info('Folder selection requires the desktop app');
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Allowed Directory',
      });

      if (selected && typeof selected === 'string') {
        if (allowedDirectories.includes(selected)) {
          setError('Directory already added');
          return;
        }
        addAllowedDirectory(selected);
      }
    } catch (e: unknown) {
      console.error('Failed to open directory picker:', e);
      setError('Failed to open directory picker. Please try again.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Allowed Directories</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Specify which directories the agent is allowed to access. This restricts file operations
          (read/write/delete) to these paths for security.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="manualPath">Add Directory Path</Label>
            <Input
              id="manualPath"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder="/path/to/directory"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddManualPath();
              }}
            />
          </div>
          <Button onClick={handleAddManualPath} disabled={!manualPath.trim()}>
            Add
          </Button>
          <Button variant="outline" onClick={handleBrowse}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Browse
          </Button>
        </div>

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
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoveDirPath(path)}
                      title="Remove path"
                    >
                      <FolderX className="h-4 w-4" />
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (removeDirPath !== null) {
                  removeAllowedDirectory(removeDirPath);
                  setRemoveDirPath(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
