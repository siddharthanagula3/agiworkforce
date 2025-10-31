import { useState, useEffect } from 'react';
import { FileTree } from './FileTree';
import { CodeEditor } from './CodeEditor';
import { useCodeStore } from '../../stores/codeStore';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import {
  X,
  Save,
  FolderOpen,
  Split,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

interface CodeWorkspaceProps {
  className?: string;
}

export function CodeWorkspace({ className }: CodeWorkspaceProps) {
  const {
    openFiles,
    activeFilePath,
    rootPath,
    setRootPath,
    openFile,
    closeFile,
    closeAllFiles,
    setActiveFile,
    updateFileContent,
    saveFile,
    saveAllFiles,
    revertFile,
    getFileByPath,
  } = useCodeStore();

  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(280);

  const activeFile = activeFilePath ? getFileByPath(activeFilePath) : undefined;
  const dirtyCount = openFiles.filter((f) => f.isDirty).length;

  useEffect(() => {
    // Load default root path if not set
    if (!rootPath) {
      // Use current working directory as default
      const defaultPath = 'C:\\Users\\SIDDHARTHA NAGULA\\agiworkforce';
      setRootPath(defaultPath);
    }
  }, [rootPath, setRootPath]);

  const handleSelectFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select Project Folder',
      });

      if (selected && typeof selected === 'string') {
        setRootPath(selected);
        closeAllFiles();
        toast.success(`Opened folder: ${selected}`);
      }
    } catch (error) {
      console.error('Failed to select folder:', error);
      toast.error('Failed to open folder');
    }
  };

  const handleFileSelect = async (path: string) => {
    try {
      await openFile(path);
    } catch (error) {
      console.error('Failed to open file:', error);
      toast.error(`Failed to open: ${path}`);
    }
  };

  const handleCloseTab = (path: string, event: React.MouseEvent) => {
    event.stopPropagation();

    const file = getFileByPath(path);
    if (file?.isDirty) {
      // TODO: Show confirmation dialog for unsaved changes
      toast.warning('File has unsaved changes');
    }

    closeFile(path);
  };

  const handleSaveActive = async () => {
    if (!activeFilePath) return;

    try {
      await saveFile(activeFilePath);
      toast.success('File saved');
    } catch (error) {
      toast.error('Failed to save file');
    }
  };

  const handleSaveAll = async () => {
    try {
      await saveAllFiles();
      toast.success(`Saved ${dirtyCount} file${dirtyCount !== 1 ? 's' : ''}`);
    } catch (error) {
      toast.error('Failed to save all files');
    }
  };

  const handleRevert = () => {
    if (!activeFilePath) return;
    revertFile(activeFilePath);
    toast.info('Changes reverted');
  };

  const toggleSidebar = () => {
    setSidebarVisible(!sidebarVisible);
  };

  return (
    <div className={cn('flex h-full bg-background', className)}>
      {/* File Tree Sidebar */}
      {sidebarVisible && rootPath && (
        <div
          className="border-r border-border bg-muted/5 flex flex-col"
          style={{ width: `${sidebarWidth}px`, minWidth: '200px', maxWidth: '500px' }}
        >
          {/* Sidebar Header */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
            <span className="text-sm font-medium">Explorer</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSelectFolder}
                title="Open Folder"
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSidebar}
                title="Hide Sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* File Tree */}
          <FileTree
            rootPath={rootPath}
            onFileSelect={handleFileSelect}
            selectedFile={activeFilePath || undefined}
            className="flex-1"
          />
        </div>
      )}

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Toolbar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2">
            {!sidebarVisible && (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleSidebar}
                title="Show Sidebar"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}

            {!rootPath && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectFolder}
              >
                <FolderOpen className="h-4 w-4 mr-2" />
                Open Folder
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {dirtyCount > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveAll}
                  title={`Save all (${dirtyCount} files)`}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save All ({dirtyCount})
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tab Bar */}
        {openFiles.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/5 overflow-x-auto">
            {openFiles.map((file) => {
              const isActive = file.path === activeFilePath;
              const fileName = file.path.split(/[/\\]/).pop() || file.path;

              return (
                <div
                  key={file.path}
                  onClick={() => setActiveFile(file.path)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer',
                    'transition-colors group whitespace-nowrap',
                    isActive
                      ? 'bg-background border border-border shadow-sm'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <span
                    className={cn(
                      'text-sm font-mono',
                      isActive && 'font-medium',
                      file.isDirty && 'text-amber-500'
                    )}
                  >
                    {fileName}
                    {file.isDirty && ' •'}
                  </span>

                  <button
                    onClick={(e) => handleCloseTab(file.path, e)}
                    className={cn(
                      'text-muted-foreground hover:text-foreground',
                      'transition-colors opacity-0 group-hover:opacity-100',
                      isActive && 'opacity-100'
                    )}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Editor Content */}
        <div className="flex-1 overflow-hidden">
          {activeFile ? (
            <CodeEditor
              key={activeFile.path}
              defaultValue={activeFile.content}
              language={activeFile.language}
              path={activeFile.path}
              readOnly={false}
              onChange={(value) => {
                if (value !== undefined) {
                  updateFileContent(activeFile.path, value);
                }
              }}
              onSave={handleSaveActive}
              className="h-full"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="text-center space-y-4">
                <div className="text-6xl opacity-20">
                  <FileTree className="inline-block" />
                </div>
                <div>
                  <p className="text-lg font-medium mb-2">No File Open</p>
                  <p className="text-sm">
                    {rootPath
                      ? 'Select a file from the explorer to start editing'
                      : 'Open a folder to get started'}
                  </p>
                </div>
                {!rootPath && (
                  <Button onClick={handleSelectFolder} variant="outline">
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Open Folder
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
