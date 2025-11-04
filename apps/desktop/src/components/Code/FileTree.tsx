import { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Trash,
  Pencil,
  PlusCircle,
} from 'lucide-react';
import { ScrollArea } from '../ui/ScrollArea';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  expanded?: boolean;
}

interface FileTreeProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
  selectedFile?: string;
  className?: string;
}

type FileWatcherEvent =
  | { type: 'Created'; paths: string[] }
  | { type: 'Modified'; paths: string[] }
  | { type: 'Deleted'; paths: string[] }
  | { type: 'Renamed'; from: string; to: string };

const normalizePath = (path: string) => path.replace(/\\/g, '/');

const getSeparator = (path: string) => (path.includes('\\') ? '\\' : '/');

const joinPath = (base: string, name: string) => {
  const separator = getSeparator(base);
  return base.endsWith(separator) ? `${base}${name}` : `${base}${separator}${name}`;
};

const getNameFromPath = (path: string) => {
  const normalized = normalizePath(path);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
};

export function FileTree({ rootPath, onFileSelect, selectedFile, className }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    path: string;
    isDirectory: boolean;
    x: number;
    y: number;
  } | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());
  const refreshTimeout = useRef<number | null>(null);
  const normalizedRoot = useMemo(() => normalizePath(rootPath), [rootPath]);

  const fetchDirectoryEntries = async (path: string) => {
    const entries = await invoke<
      {
        path: string;
        name: string;
        is_file: boolean;
        is_dir: boolean;
        size: number;
        modified: number;
      }[]
    >('dir_list', { path });

    return entries
      .sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((entry) => ({
        name: entry.name,
        path: entry.path,
        isDirectory: entry.is_dir,
      }));
  };

  const buildTree = async (path: string, expandSet: Set<string>): Promise<FileNode> => {
    const entries = await fetchDirectoryEntries(path);
    const children: FileNode[] = [];

    for (const entry of entries) {
      if (entry.isDirectory) {
        const normalized = normalizePath(entry.path);
        const shouldExpand = expandSet.has(normalized);
        const child: FileNode = {
          name: entry.name,
          path: entry.path,
          isDirectory: true,
          expanded: shouldExpand,
          children: [],
        };
        if (shouldExpand) {
          const nested = await buildTree(entry.path, expandSet);
          child.children = nested.children ?? [];
        }
        children.push(child);
      } else {
        children.push({
          name: entry.name,
          path: entry.path,
          isDirectory: false,
        });
      }
    }

    return {
      name: getNameFromPath(path),
      path,
      isDirectory: true,
      expanded: true,
      children,
    };
  };

  const stopRefreshTimer = () => {
    if (refreshTimeout.current) {
      window.clearTimeout(refreshTimeout.current);
      refreshTimeout.current = null;
    }
  };

  const loadDirectory = async (
    path: string,
    options?: { preserveExpansion?: boolean; expansionOverride?: Set<string> },
  ) => {
    setLoading(true);
    try {
      const expandSet = options?.expansionOverride
        ? new Set(options.expansionOverride)
        : options?.preserveExpansion
          ? new Set(expandedPaths)
          : new Set<string>();

      expandSet.add(normalizePath(path));
      const root = await buildTree(path, expandSet);
      setTree(root);
      setExpandedPaths(expandSet);
    } catch (error) {
      console.error('Failed to load directory:', error);
      toast.error('Failed to load directory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setExpandedPaths(new Set([normalizedRoot]));
    void loadDirectory(rootPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedRoot]);

  useEffect(() => {
    let unlistenRef: UnlistenFn | null = null;
    let disposed = false;

    const startWatcher = async () => {
      try {
        await invoke('file_watch_start', { path: rootPath, recursive: true });
      } catch (error) {
        console.error('Failed to start file watcher', error);
      }

      try {
        unlistenRef = await listen<FileWatcherEvent>('file-event', (event) => {
          const payload = event.payload;
          const affectedPaths: string[] = [];
          if ('paths' in payload && Array.isArray(payload.paths)) {
            affectedPaths.push(...payload.paths);
          } else if ('from' in payload && 'to' in payload) {
            affectedPaths.push(payload.from, payload.to);
          }

          if (
            affectedPaths.some((p) => {
              const normalized = normalizePath(p);
              return normalized.startsWith(normalizedRoot);
            })
          ) {
            stopRefreshTimer();
            refreshTimeout.current = window.setTimeout(() => {
              void loadDirectory(rootPath, { preserveExpansion: true });
            }, 200);
          }
        });
      } catch (error) {
        console.error('Failed to subscribe to file events', error);
      }
    };

    void startWatcher();

    return () => {
      disposed = true;
      stopRefreshTimer();
      if (unlistenRef) {
        unlistenRef();
      }
      void invoke('file_watch_stop', { path: rootPath }).catch(() => {});
      if (!disposed) {
        setTree(null);
      }
    };
  }, [rootPath, normalizedRoot]);

  const toggleDirectory = async (node: FileNode) => {
    if (!node.isDirectory) return;
    const normalized = normalizePath(node.path);

    const nextExpanded = new Set(expandedPaths);
    if (nextExpanded.has(normalized)) {
      nextExpanded.delete(normalized);
    } else {
      nextExpanded.add(normalized);
    }

    setExpandedPaths(nextExpanded);
    await loadDirectory(rootPath, { expansionOverride: nextExpanded });
  };

  const handleRefresh = () => {
    void loadDirectory(rootPath, { preserveExpansion: true });
  };

  const handleCreate = async (targetPath: string, isDirectory: boolean) => {
    const label = isDirectory ? 'folder' : 'file';
    const name = window.prompt(`Enter ${label} name`);
    if (!name) {
      return;
    }

    if (name.includes('/') || name.includes('\\')) {
      toast.error('Name cannot contain path separators');
      return;
    }

    const fullPath = joinPath(targetPath, name);

    try {
      if (isDirectory) {
        await invoke('dir_create', { path: fullPath });
      } else {
        await invoke('file_write', { path: fullPath, content: '' });
      }
      toast.success(`${isDirectory ? 'Folder' : 'File'} created`);
      await loadDirectory(rootPath, { preserveExpansion: true });
    } catch (error) {
      console.error('Failed to create', error);
      toast.error(`Failed to create ${label}`);
    }
  };

  const handleRename = async (path: string) => {
    const currentName = getNameFromPath(path);
    const newName = window.prompt('Enter new name', currentName);
    if (!newName || newName === currentName) {
      return;
    }

    if (newName.includes('/') || newName.includes('\\')) {
      toast.error('Name cannot contain path separators');
      return;
    }

    const parent = path.slice(0, path.length - currentName.length);
    const newPath = joinPath(parent, newName);

    try {
      await invoke('file_rename', { oldPath: path, newPath });
      toast.success('Renamed successfully');
      await loadDirectory(rootPath, { preserveExpansion: true });
    } catch (error) {
      console.error('Failed to rename', error);
      toast.error('Failed to rename item');
    }
  };

  const handleDelete = async (path: string, isDirectory: boolean) => {
    const confirmMessage = isDirectory
      ? 'Delete this folder and all of its contents?'
      : 'Delete this file?';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      if (isDirectory) {
        await invoke('dir_delete', { path, recursive: true });
      } else {
        await invoke('file_delete', { path });
      }
      toast.success(isDirectory ? 'Folder deleted' : 'File deleted');
      await loadDirectory(rootPath, { preserveExpansion: true });
    } catch (error) {
      console.error('Failed to delete', error);
      toast.error('Failed to delete item');
    }
  };

  const getFileIcon = (node: FileNode) => {
    if (node.isDirectory) {
      return node.expanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />;
    }

    const ext = node.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
      case 'rs':
      case 'py':
      case 'go':
      case 'java':
      case 'cpp':
      case 'c':
      case 'cs':
      case 'rb':
      case 'php':
      case 'swift':
      case 'kt':
      case 'json':
      case 'yaml':
      case 'yml':
      case 'toml':
      case 'sql':
      case 'sh':
      case 'ps1':
      case 'bat':
      case 'cmd':
        return <FileCode className="h-4 w-4" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'svg':
      case 'webp':
        return <ImageIcon className="h-4 w-4" />;
      case 'md':
      case 'txt':
        return <FileText className="h-4 w-4" />;
      case 'jsonc':
        return <FileJson className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const filterTree = (node: FileNode | null, query: string): FileNode | null => {
    if (!node) return null;
    if (!query) return node;

    const lowerQuery = query.toLowerCase();
    const matches = node.name.toLowerCase().includes(lowerQuery);

    if (node.isDirectory && node.children) {
      const filteredChildren = node.children
        .map((child) => filterTree(child, query))
        .filter((child): child is FileNode => child !== null);

      if (filteredChildren.length > 0 || matches) {
        return {
          ...node,
          children: filteredChildren,
          expanded: true,
        };
      }
    }

    return matches ? { ...node, children: [] } : null;
  };

  const handleContextMenu = (event: React.MouseEvent, node: FileNode) => {
    event.preventDefault();
    const { clientX, clientY } = event;
    const menuWidth = 200;
    const menuHeight = node.isDirectory ? 176 : 130;
    const viewportPadding = 8;

    let x = clientX;
    let y = clientY;

    if (x + menuWidth + viewportPadding > window.innerWidth) {
      x = window.innerWidth - menuWidth - viewportPadding;
    }
    if (y + menuHeight + viewportPadding > window.innerHeight) {
      y = window.innerHeight - menuHeight - viewportPadding;
    }

    setContextMenu({ path: node.path, isDirectory: node.isDirectory, x, y });
  };

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const handleClose = () => setContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

  const displayTree = useMemo(() => filterTree(tree, searchQuery), [tree, searchQuery]);

  const renderNode = (node: FileNode, level = 0) => {
    const isSelected = selectedFile === node.path;
    const isExpanded = !!node.expanded;

    return (
      <div key={node.path}>
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-1 cursor-pointer rounded-md group transition-colors select-none',
            isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (node.isDirectory) {
              void toggleDirectory(node);
            } else {
              onFileSelect(node.path);
            }
          }}
          onContextMenu={(event) => handleContextMenu(event, node)}
        >
          {node.isDirectory ? (
            <span className="text-muted-foreground">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          ) : (
            <span className="w-4" />
          )}

          <span className="text-muted-foreground">{getFileIcon(node)}</span>
          <span className="flex-1 text-sm truncate font-mono">{node.name}</span>
        </div>

        {node.isDirectory &&
          isExpanded &&
          node.children &&
          node.children.map((child) => renderNode(child, level + 1))}
      </div>
    );
  };

  return (
    <div className={cn('flex flex-col h-full border-r border-border bg-muted/5', className)}>
      <div className="p-2 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Files</span>
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>
        <Input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-1">
          {loading && !tree ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : displayTree ? (
            renderNode(displayTree)
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">No files</div>
          )}
        </div>
      </ScrollArea>

      {contextMenu && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute z-50 w-52 rounded-md border border-border bg-background p-1 shadow-lg"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.isDirectory && (
              <>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    handleCreate(contextMenu.path, false);
                    setContextMenu(null);
                  }}
                >
                  <PlusCircle className="h-4 w-4" />
                  New file
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    handleCreate(contextMenu.path, true);
                    setContextMenu(null);
                  }}
                >
                  <Folder className="h-4 w-4" />
                  New folder
                </button>
                <div className="my-1 h-px bg-border/60" />
              </>
            )}
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                handleRename(contextMenu.path);
                setContextMenu(null);
              }}
            >
              <Pencil className="h-4 w-4" />
              Rename
            </button>
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted text-red-600"
              onClick={() => {
                handleDelete(contextMenu.path, contextMenu.isDirectory);
                setContextMenu(null);
              }}
            >
              <Trash className="h-4 w-4" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
