import { homeDir } from '@tauri-apps/api/path';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
    ChevronLeft,
    ChevronRight,
    Copy,
    FileCode,
    FolderOpen,
    GitCompare,
    MoveLeft,
    MoveRight,
    Save,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import type { OpenFile } from '../../stores/codeStore';
import { useCodeStore } from '../../stores/codeStore';
import { Button } from '../ui/Button';
import { Dialog, DialogContent } from '../ui/Dialog';
import { CodeEditor } from './CodeEditor';
import { DiffViewer } from './DiffViewer';
import { FileTree } from './FileTree';

interface CodeWorkspaceProps {
  className?: string;
}

interface TabContextMenu {
  path: string;
  x: number;
  y: number;
}

export function CodeWorkspace({ className }: CodeWorkspaceProps) {
  const {
    openFiles,
    activeFilePath,
    rootPath,
    persistedOpenPaths,
    setRootPath,
    openFile,
    closeFile,
    closeAllFiles,
    closeOtherFiles,
    moveFile,
    setActiveFile,
    updateFileContent,
    saveFile,
    saveAllFiles,
    getFileByPath,
    revertFile,
    hydrateOpenFiles,
  } = useCodeStore();

  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarWidth] = useState(280);
  const [diffOpen, setDiffOpen] = useState(false);
  const [tabMenu, setTabMenu] = useState<TabContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const draggedTabPath = useRef<string | null>(null);
  const [pendingCloseFile, setPendingCloseFile] = useState<OpenFile | null>(null);
  const [pendingCloseSaving, setPendingCloseSaving] = useState(false);

  const activeFile = activeFilePath ? getFileByPath(activeFilePath) : undefined;
  const dirtyCount = useMemo(() => openFiles.filter((f) => f.isDirty).length, [openFiles]);

  const formatPathForToast = (filePath: string) => filePath.split(/[/\\]/).pop() ?? filePath;

  const persistFile = async (filePath: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      await saveFile(filePath);
      if (!silent) {
        toast.success(`Saved ${formatPathForToast(filePath)}`);
      }
    } catch (error) {
      console.error('Failed to save file', error);
      if (!silent) {
        toast.error(`Failed to save ${formatPathForToast(filePath)}`);
      }
      throw error;
    }
  };

  useEffect(() => {
    let mounted = true;

    if (!rootPath) {
      (async () => {
        try {
          const defaultDir = await homeDir();
          if (mounted) {
            setRootPath(defaultDir);
          }
        } catch (error) {
          console.warn('Failed to resolve home directory', error);
        }
      })();
    }

    return () => {
      mounted = false;
    };
  }, [rootPath, setRootPath]);

  useEffect(() => {
    if (openFiles.length === 0 && persistedOpenPaths.length > 0) {
      void hydrateOpenFiles();
    }
  }, [openFiles.length, persistedOpenPaths, hydrateOpenFiles]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isAccel = event.ctrlKey || event.metaKey;
      if (!isAccel || event.shiftKey || event.altKey) {
        return;
      }

      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) {
        return;
      }

      const index = digit - 1;
      const target = openFiles[index];
      if (target) {
        event.preventDefault();
        setActiveFile(target.path);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openFiles, setActiveFile]);

  useEffect(() => {
    if (!tabMenu) {
      return;
    }

    const handleClickAway = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setTabMenu(null);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setTabMenu(null);
      }
    };

    window.addEventListener('mousedown', handleClickAway);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClickAway);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [tabMenu]);

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

  const requestCloseTab = (path: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    const file = getFileByPath(path);
    if (file?.isDirty) {
      setPendingCloseFile(file);
      return;
    }
    closeFile(path);
  };

  const handleEditorSave = async (
    _content: string,
    { auto, path: targetPath }: { auto: boolean; path?: string },
  ) => {
    const resolvedPath = targetPath ?? activeFile?.path;
    if (!resolvedPath) {
      return;
    }
    await persistFile(resolvedPath, { silent: auto });
  };

  const handleSaveAll = async () => {
    try {
      await saveAllFiles();
      toast.success(`Saved ${dirtyCount} file${dirtyCount !== 1 ? 's' : ''}`);
    } catch (error) {
      toast.error('Failed to save all files');
    }
  };

  const handleCompareWithSaved = () => {
    if (!activeFile) return;
    setDiffOpen(true);
  };

  const handleAcceptDiff = () => {
    if (!activeFile) return;
    revertFile(activeFile.path);
    toast.success('Reverted to saved version');
    setDiffOpen(false);
  };

  const handleRejectDiff = () => {
    if (!activeFile) return;
    toast.info('Changes kept');
    setDiffOpen(false);
  };

  const handleTabContextMenu = (event: React.MouseEvent, path: string) => {
    event.preventDefault();
    const viewportPadding = 8;
    const menuWidth = 200;
    const menuHeight = 176; // approximate height
    let x = event.clientX;
    let y = event.clientY;

    if (x + menuWidth + viewportPadding > window.innerWidth) {
      x = window.innerWidth - menuWidth - viewportPadding;
    }
    if (y + menuHeight + viewportPadding > window.innerHeight) {
      y = window.innerHeight - menuHeight - viewportPadding;
    }

    setTabMenu({ path, x, y });
  };

  const handleTabDragStart = (path: string) => (event: React.DragEvent<HTMLDivElement>) => {
    draggedTabPath.current = path;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', path);
  };

  const handleTabDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleTabDrop = (index: number) => (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dragged = draggedTabPath.current;
    if (dragged) {
      moveFile(dragged, index);
    }
    draggedTabPath.current = null;
  };

  const handleTabDragEnd = () => {
    draggedTabPath.current = null;
  };

  const handleSaveAndClosePending = async () => {
    if (!pendingCloseFile) return;
    setPendingCloseSaving(true);
    try {
      await persistFile(pendingCloseFile.path);
      closeFile(pendingCloseFile.path);
      setPendingCloseFile(null);
    } catch {
      // keep dialog open to allow retry
    } finally {
      setPendingCloseSaving(false);
    }
  };

  const handleDiscardPending = () => {
    if (!pendingCloseFile) return;
    revertFile(pendingCloseFile.path);
    closeFile(pendingCloseFile.path);
    setPendingCloseFile(null);
  };

  const handleKeepEditingPending = () => {
    setPendingCloseFile(null);
  };

  const renderTabContextMenu = () => {
    if (!tabMenu) return null;
    const index = openFiles.findIndex((file) => file.path === tabMenu.path);
    const canMoveLeft = index > 0;
    const canMoveRight = index > -1 && index < openFiles.length - 1;

    const closeCurrent = () => {
      requestCloseTab(tabMenu.path);
      setTabMenu(null);
    };

    const closeOthers = () => {
      closeOtherFiles(tabMenu.path);
      setTabMenu(null);
    };

    const closeAll = () => {
      closeAllFiles();
      setTabMenu(null);
    };

    const moveLeft = () => {
      if (canMoveLeft) {
        moveFile(tabMenu.path, index - 1);
      }
      setTabMenu(null);
    };

    const moveRight = () => {
      if (canMoveRight) {
        moveFile(tabMenu.path, index + 1);
      }
      setTabMenu(null);
    };

    const saveTab = async () => {
      try {
        await persistFile(tabMenu.path);
      } catch {
        // notification handled in persistFile
      }
      setTabMenu(null);
    };

    const saveTabAsCopy = async () => {
      try {
        const file = getFileByPath(tabMenu.path);
        if (!file) return;
        await navigator.clipboard.writeText(file.content);
        toast.success('Copied file contents to clipboard');
      } catch (error) {
        toast.error('Failed to copy file contents');
      } finally {
        setTabMenu(null);
      }
    };

    return (
      <div className="fixed inset-0 z-40" onContextMenu={(e) => e.preventDefault()}>
        <div
          ref={menuRef}
          className="absolute z-50 w-52 rounded-md border border-border bg-background p-1 shadow-lg"
          style={{ left: tabMenu.x, top: tabMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={closeCurrent}
          >
            <X className="h-4 w-4" />
            Close tab
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={closeOthers}
          >
            Close others
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={closeAll}
          >
            Close all
          </button>
          <div className="my-1 h-px bg-border/60" />
          <button
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted',
              !canMoveLeft && 'cursor-not-allowed text-muted-foreground hover:bg-transparent',
            )}
            onClick={moveLeft}
            disabled={!canMoveLeft}
          >
            <MoveLeft className="h-4 w-4" />
            Move left
          </button>
          <button
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted',
              !canMoveRight && 'cursor-not-allowed text-muted-foreground hover:bg-transparent',
            )}
            onClick={moveRight}
            disabled={!canMoveRight}
          >
            <MoveRight className="h-4 w-4" />
            Move right
          </button>
          <div className="my-1 h-px bg-border/60" />
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={saveTab}
          >
            <Save className="h-4 w-4" />
            Save tab
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={saveTabAsCopy}
          >
            <Copy className="h-4 w-4" />
            Copy contents
          </button>
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'flex h-full overflow-hidden border border-border rounded-lg bg-background min-h-0 min-w-0',
        className,
      )}
    >
      {/* Sidebar */}
      <div
        className={cn(
          'flex shrink-0 flex-col border-r border-border bg-muted/10 transition-all duration-200',
          sidebarVisible ? 'opacity-100' : 'w-0 opacity-0',
        )}
        style={{ width: sidebarVisible ? sidebarWidth : 0 }}
      >
        {sidebarVisible && rootPath ? (
          <FileTree
            rootPath={rootPath}
            onFileSelect={handleFileSelect}
            {...(activeFilePath ? { selectedFile: activeFilePath } : { selectedFile: '' })}
            className="flex-1"
          />
        ) : null}
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
              onClick={() => setSidebarVisible((value) => !value)}
            >
              {sidebarVisible ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            <span className="text-sm font-medium">
              {activeFilePath
                ? activeFilePath.split(/[/\\]/).slice(-2).join('/')
                : 'No file selected'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleSelectFolder}>
              <FolderOpen className="mr-2 h-4 w-4" />
              {rootPath ? 'Switch Folder' : 'Open Folder'}
            </Button>

            {openFiles.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAll}
                  disabled={dirtyCount === 0}
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save All ({dirtyCount})
                </Button>
                {activeFile?.isDirty && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCompareWithSaved}
                    title="Compare with saved version"
                  >
                    <GitCompare className="h-4 w-4 mr-1" />
                    Compare
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Tab Bar */}
        {openFiles.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/5 overflow-x-auto">
            {openFiles.map((file, index) => {
              const isActive = file.path === activeFilePath;
              const fileName = file.path.split(/[/\\]/).pop() || file.path;

              return (
                <div
                  key={file.path}
                  draggable
                  onDragStart={handleTabDragStart(file.path)}
                  onDragOver={handleTabDragOver}
                  onDrop={handleTabDrop(index)}
                  onDragEnd={handleTabDragEnd}
                  onClick={() => setActiveFile(file.path)}
                  onContextMenu={(e) => handleTabContextMenu(e, file.path)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer',
                    'transition-colors group whitespace-nowrap select-none',
                    isActive ? 'bg-background border border-border shadow-sm' : 'hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'text-sm font-mono',
                      isActive && 'font-medium',
                      file.isDirty && 'text-amber-500',
                    )}
                  >
                    {fileName}
                    {file.isDirty && ' *'}
                  </span>

                  <button
                    onClick={(e) => requestCloseTab(file.path, e)}
                    className={cn(
                      'text-muted-foreground hover:text-foreground',
                      'transition-colors opacity-0 group-hover:opacity-100',
                      isActive && 'opacity-100',
                    )}
                    title="Close tab"
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
              onSave={handleEditorSave}
              className="h-full"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <div className="text-center space-y-4">
                <div className="text-6xl opacity-20">
                  <FileCode className="inline-block h-16 w-16" />
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

      {renderTabContextMenu()}

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden">
          {activeFile && (
            <DiffViewer
              originalValue={activeFile.originalContent}
              modifiedValue={activeFile.content}
              originalLabel="Saved version"
              modifiedLabel="Working copy"
              language={activeFile.language}
              readOnly={false}
              onAccept={handleAcceptDiff}
              onReject={handleRejectDiff}
              onClose={() => setDiffOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingCloseFile}
        onOpenChange={(open) => !open && !pendingCloseSaving && setPendingCloseFile(null)}
      >
        <DialogContent className="sm:max-w-lg space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Unsaved changes</h2>
            <p className="text-sm text-muted-foreground">
              {pendingCloseFile?.path
                ? `${pendingCloseFile.path} has unsaved changes. How would you like to proceed?`
                : 'This file has unsaved changes.'}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={handleKeepEditingPending}
              disabled={pendingCloseSaving}
            >
              Keep editing
            </Button>
            <Button variant="outline" onClick={handleDiscardPending} disabled={pendingCloseSaving}>
              Discard changes
            </Button>
            <Button onClick={handleSaveAndClosePending} disabled={pendingCloseSaving}>
              {pendingCloseSaving ? 'Saving…' : 'Save & Close'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
