import { open } from '@tauri-apps/plugin-dialog';
import { exists } from '@tauri-apps/plugin-fs';
import { FolderPlus, FolderX, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { ScrollArea } from '../ui/ScrollArea';

export function AllowedDirectoriesSettings() {
  const { allowedDirectories, addAllowedDirectory, removeAllowedDirectory } = useSettingsStore();
  const [manualPath, setManualPath] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAddManualPath = async () => {
    if (!manualPath.trim()) return;
    setError(null);

    const path = manualPath.trim();

    try {
      // Validate path existence
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
      console.error('Failed to validate path:', e);
      // If validation fails (e.g. permission error), we might still want to add it or show error
      // For now, allow adding but show warning
      setError('Could not verify path existence. Added anyway.');
      addAllowedDirectory(path);
      setManualPath('');
    }
  };

  const handleBrowse = async () => {
    setError(null);
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
    } catch (e) {
      console.error('Failed to open directory picker:', e);
      setError('Failed to open directory picker');
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
          <div className="p-3 bg-muted/50 border-b text-sm font-medium">
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
                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group transition-colors"
                  >
                    <code className="text-xs font-mono break-all">{path}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      onClick={() => removeAllowedDirectory(path)}
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
    </div>
  );
}
