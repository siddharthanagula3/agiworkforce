import {
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    Edit2,
    File,
    FileText,
    Folder,
    FolderOpen,
    Home,
    Info,
    Plus,
    RefreshCw,
    Save,
    Search,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useFilesystemStore, type DirEntry, type FileMetadata } from '../../stores/filesystemStore';
import { Button } from '../ui/Button';
import { useConfirm } from '../ui/ConfirmDialog'; // Updated Nov 16, 2025
import { Input } from '../ui/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';

interface FilesystemWorkspaceProps {
  className?: string;
}

export function FilesystemWorkspace({ className }: FilesystemWorkspaceProps) {
  const {
    currentPath,
    entries,
    selectedPath,
    fileContent,
    loading,
    error,
    history,
    historyIndex,
    navigateTo,
    goBack,
    goForward,
    goUp,
    readFile,
    writeFile,
    deleteFile,
    renameFile,
    createDirectory,
    deleteDirectory,
    searchFiles,
    getMetadata,
    setFileContent,
    clearError,
  } = useFilesystemStore();

  const [pathInput, setPathInput] = useState('C:\\Users');
  const [newFolderName, setNewFolderName] = useState('');
  const [renameInput, setRenameInput] = useState('');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [searchPattern, setSearchPattern] = useState('');
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [selectedMetadata, setSelectedMetadata] = useState<FileMetadata | null>(null);
  const [editingFile, setEditingFile] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm(); // Updated Nov 16, 2025

  // Initialize with a default path
  useEffect(() => {
    if (!currentPath) {
      navigateTo('C:\\Users').catch((err) => {
        console.error('Failed to initialize filesystem:', err);
        toast.error('Failed to load default directory');
      });
    }
  }, [currentPath, navigateTo]);

  // Sync path input with current path
  useEffect(() => {
    if (currentPath) {
      setPathInput(currentPath);
    }
  }, [currentPath]);

  // Clear error after showing toast
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleNavigate = async (path?: string) => {
    const targetPath = path || pathInput;
    if (!targetPath.trim()) {
      toast.error('Please enter a path');
      return;
    }

    try {
      await navigateTo(targetPath);
    } catch (error) {
      toast.error(`Failed to navigate: ${error}`);
    }
  };

  const handleEntryClick = async (entry: DirEntry) => {
    if (entry.is_dir) {
      await handleNavigate(entry.path);
    } else {
      try {
        await readFile(entry.path);
        setEditingFile(false);
        toast.success(`Opened: ${entry.name}`);
      } catch (error) {
        toast.error(`Failed to read file: ${error}`);
      }
    }
  };

  const handleSaveFile = async () => {
    if (!selectedPath) return;

    try {
      await writeFile(selectedPath, fileContent);
      setEditingFile(false);
      toast.success('File saved successfully');
    } catch (error) {
      toast.error(`Failed to save file: ${error}`);
    }
  };

  // Updated Nov 16, 2025 - Use accessible confirm dialog
  const handleDeleteEntry = async (entry: DirEntry, event: React.MouseEvent) => {
    event.stopPropagation();

    const confirmed = await confirm({
      title: `Delete ${entry.is_dir ? 'folder' : 'file'}?`,
      description: `Are you sure you want to delete "${entry.name}"?${
        entry.is_dir
          ? ' This will delete all contents. This action cannot be undone.'
          : ' This action cannot be undone.'
      }`,
      confirmText: 'Delete',
      variant: 'destructive',
    });

    if (!confirmed) return;

    try {
      if (entry.is_dir) {
        await deleteDirectory(entry.path, true);
      } else {
        await deleteFile(entry.path);
      }
      toast.success(`Deleted: ${entry.name}`);
    } catch (error) {
      toast.error(`Failed to delete: ${error}`);
    }
  };

  const handleRename = async (entry: DirEntry) => {
    if (!renameInput.trim()) {
      toast.error('Please enter a new name');
      return;
    }

    const dirPath = entry.path.substring(0, entry.path.lastIndexOf('\\') + 1);
    const newPath = dirPath + renameInput;

    try {
      await renameFile(entry.path, newPath);
      setRenamingPath(null);
      setRenameInput('');
      toast.success(`Renamed to: ${renameInput}`);
    } catch (error) {
      toast.error(`Failed to rename: ${error}`);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('Please enter a folder name');
      return;
    }

    const newPath = `${currentPath}\\${newFolderName}`;

    try {
      await createDirectory(newPath);
      setNewFolderName('');
      toast.success(`Created folder: ${newFolderName}`);
    } catch (error) {
      toast.error(`Failed to create folder: ${error}`);
    }
  };

  const handleSearch = async () => {
    if (!searchPattern.trim()) {
      toast.error('Please enter a search pattern');
      return;
    }

    try {
      if (!currentPath) return;
      const results = await searchFiles(currentPath, searchPattern);
      setSearchResults(results);
      toast.success(`Found ${results.length} files`);
    } catch (error) {
      toast.error(`Search failed: ${error}`);
    }
  };

  const handleShowMetadata = async (entry: DirEntry, event: React.MouseEvent) => {
    event.stopPropagation();

    try {
      const metadata = await getMetadata(entry.path);
      setSelectedMetadata(metadata);
    } catch (error) {
      toast.error(`Failed to get metadata: ${error}`);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  return (
    <>
      {confirmDialog}
      <div className={cn('flex flex-col h-full bg-background', className)}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">File System</span>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={goBack} disabled={!canGoBack || loading}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={goForward}
              disabled={!canGoForward || loading}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goUp} disabled={loading}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleNavigate('C:\\')}
              disabled={loading}
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleNavigate()} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Address Bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <Input
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
            placeholder="Enter path..."
            className="flex-1 font-mono text-sm"
            disabled={loading}
          />
          <Button variant="default" size="sm" onClick={() => handleNavigate()} disabled={loading}>
            Go
          </Button>
        </div>

        {/* Main Content */}
        <Tabs defaultValue="browse" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="px-3">
            <TabsTrigger value="browse">
              <Folder className="h-3 w-3 mr-1" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="editor" disabled={!selectedPath}>
              <FileText className="h-3 w-3 mr-1" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="search">
              <Search className="h-3 w-3 mr-1" />
              Search
            </TabsTrigger>
          </TabsList>

          {/* Browse Tab */}
          <TabsContent value="browse" className="flex-1 flex flex-col overflow-hidden">
            {/* Actions Bar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/5">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                placeholder="New folder name..."
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={handleCreateFolder} disabled={loading}>
                <Plus className="h-4 w-4 mr-1" />
                Create Folder
              </Button>
            </div>

            {/* File List */}
            <div className="flex-1 overflow-auto p-3">
              {entries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <FolderOpen className="h-16 w-16 mb-4 opacity-20" />
                  <p className="text-sm">Empty directory</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {entries.map((entry) => (
                    <div
                      key={entry.path}
                      onClick={() => handleEntryClick(entry)}
                      className={cn(
                        'flex items-center justify-between p-2 rounded-md cursor-pointer',
                        'hover:bg-muted/50 transition-colors group',
                        selectedPath === entry.path && 'bg-muted',
                      )}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {entry.is_dir ? (
                          <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        ) : (
                          <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        {renamingPath === entry.path ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              value={renameInput}
                              onChange={(e) => setRenameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRename(entry);
                                if (e.key === 'Escape') {
                                  setRenamingPath(null);
                                  setRenameInput('');
                                }
                              }}
                              autoFocus
                              className="h-7"
                            />
                            <Button variant="ghost" size="sm" onClick={() => handleRename(entry)}>
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setRenamingPath(null);
                                setRenameInput('');
                              }}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm truncate">{entry.name}</span>
                            {entry.is_file && (
                              <span className="text-xs text-muted-foreground flex-shrink-0">
                                {formatSize(entry.size)}
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleShowMetadata(entry, e)}
                          title="Show info"
                        >
                          <Info className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingPath(entry.path);
                            setRenameInput(entry.name);
                          }}
                          title="Rename"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => handleDeleteEntry(entry, e)}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Status Bar */}
            <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground bg-muted/10 border-t border-border">
              <span>{entries.length} items</span>
              <span>
                {entries.filter((e) => e.is_dir).length} folders,{' '}
                {entries.filter((e) => e.is_file).length} files
              </span>
            </div>
          </TabsContent>

          {/* Editor Tab */}
          <TabsContent value="editor" className="flex-1 flex flex-col overflow-hidden">
            {selectedPath ? (
              <>
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm font-medium truncate">
                      {selectedPath.split('\\').pop()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {editingFile ? (
                      <>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleSaveFile}
                          disabled={loading}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditingFile(false)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setEditingFile(true)}>
                        <Edit2 className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-3">
                  <textarea
                    value={fileContent}
                    onChange={(e) => setFileContent(e.target.value)}
                    readOnly={!editingFile}
                    className={cn(
                      'w-full h-full p-3 border border-border rounded-md',
                      'font-mono text-sm resize-none',
                      'focus:outline-none focus:ring-2 focus:ring-primary',
                      !editingFile && 'bg-muted/20 cursor-not-allowed',
                    )}
                    placeholder="File content..."
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <p className="text-sm">No file selected</p>
              </div>
            )}
          </TabsContent>

          {/* Search Tab */}
          <TabsContent
            value="search"
            className="flex-1 flex flex-col overflow-hidden p-4 space-y-4"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">Search Pattern (glob)</label>
              <div className="flex gap-2">
                <Input
                  value={searchPattern}
                  onChange={(e) => setSearchPattern(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g., **/*.ts"
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={loading}>
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </Button>
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="flex-1 overflow-auto border border-border rounded-md">
                <div className="p-2 space-y-1">
                  {searchResults.map((result) => (
                    <div
                      key={result}
                      onClick={() =>
                        readFile(result).catch((err) => toast.error(`Failed to read: ${err}`))
                      }
                      className="p-2 rounded-md hover:bg-muted cursor-pointer text-sm font-mono"
                    >
                      {result}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Metadata Modal */}
        {selectedMetadata && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setSelectedMetadata(null)}
          >
            <div
              className="bg-background border border-border rounded-lg p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">File Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Size:</span>
                  <span className="font-mono">{formatSize(selectedMetadata.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <span>{selectedMetadata.is_file ? 'File' : 'Directory'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Created:</span>
                  <span className="font-mono text-xs">{formatDate(selectedMetadata.created)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Modified:</span>
                  <span className="font-mono text-xs">{formatDate(selectedMetadata.modified)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Read-only:</span>
                  <span>{selectedMetadata.readonly ? 'Yes' : 'No'}</span>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => setSelectedMetadata(null)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
