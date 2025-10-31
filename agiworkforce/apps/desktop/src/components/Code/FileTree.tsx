import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
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

export function FileTree({ rootPath, onFileSelect, selectedFile, className }: FileTreeProps) {
  const [tree, setTree] = useState<FileNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadDirectory(rootPath);
  }, [rootPath]);

  const loadDirectory = async (path: string) => {
    setLoading(true);
    try {
      const entries = await invoke<{ path: string; name: string; is_file: boolean; is_dir: boolean; size: number; modified: number }[]>(
        'dir_list',
        { path }
      );

      const nodes: FileNode[] = entries
        .sort((a, b) => {
          // Directories first
          if (a.is_dir && !b.is_dir) return -1;
          if (!a.is_dir && b.is_dir) return 1;
          // Then alphabetically
          return a.name.localeCompare(b.name);
        })
        .map((entry) => ({
          name: entry.name,
          path: entry.path,
          isDirectory: entry.is_dir,
          children: entry.is_dir ? [] : undefined,
          expanded: false,
        }));

      setTree({
        name: path.split('/').pop() || path,
        path,
        isDirectory: true,
        children: nodes,
        expanded: true,
      });
    } catch (error) {
      console.error('Failed to load directory:', error);
      toast.error(`Failed to load ${path}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleDirectory = async (node: FileNode) => {
    if (!node.isDirectory) return;

    const updateNode = (n: FileNode): FileNode => {
      if (n.path === node.path) {
        return { ...n, expanded: !n.expanded };
      }
      if (n.children) {
        return { ...n, children: n.children.map(updateNode) };
      }
      return n;
    };

    if (tree) {
      const updated = updateNode(tree);
      setTree(updated);

      // Load children if expanding for the first time
      if (!node.expanded && (!node.children || node.children.length === 0)) {
        try {
          const entries = await invoke<{ path: string; name: string; is_file: boolean; is_dir: boolean; size: number; modified: number }[]>(
            'dir_list',
            { path: node.path }
          );

          const children: FileNode[] = entries
            .sort((a, b) => {
              if (a.is_dir && !b.is_dir) return -1;
              if (!a.is_dir && b.is_dir) return 1;
              return a.name.localeCompare(b.name);
            })
            .map((entry) => ({
              name: entry.name,
              path: entry.path,
              isDirectory: entry.is_dir,
              children: entry.is_dir ? [] : undefined,
              expanded: false,
            }));

          const updateWithChildren = (n: FileNode): FileNode => {
            if (n.path === node.path) {
              return { ...n, children, expanded: true };
            }
            if (n.children) {
              return { ...n, children: n.children.map(updateWithChildren) };
            }
            return n;
          };

          setTree(updateWithChildren(tree));
        } catch (error) {
          console.error('Failed to load children:', error);
          toast.error('Failed to load directory contents');
        }
      }
    }
  };

  const getFileIcon = (node: FileNode) => {
    if (node.isDirectory) {
      return node.expanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />;
    }

    const ext = node.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
      case 'ts':
      case 'jsx':
      case 'tsx':
      case 'py':
      case 'rs':
      case 'go':
      case 'java':
      case 'cpp':
      case 'c':
        return <FileCode className="h-4 w-4" />;
      case 'json':
      case 'yaml':
      case 'yml':
      case 'toml':
        return <FileJson className="h-4 w-4" />;
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
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const filterTree = (node: FileNode, query: string): FileNode | null => {
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

    return matches ? node : null;
  };

  const renderNode = (node: FileNode, level: number = 0) => {
    const isSelected = selectedFile === node.path;

    return (
      <div key={node.path}>
        <div
          className={cn(
            'flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-accent rounded-md group',
            isSelected && 'bg-primary/10 text-primary',
            'transition-colors'
          )}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (node.isDirectory) {
              toggleDirectory(node);
            } else {
              onFileSelect(node.path);
            }
          }}
        >
          {node.isDirectory && (
            <span className="text-muted-foreground">
              {node.expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          )}
          {!node.isDirectory && <span className="w-4" />}

          <span className="text-muted-foreground">{getFileIcon(node)}</span>

          <span className="flex-1 text-sm truncate font-mono">{node.name}</span>
        </div>

        {node.isDirectory && node.expanded && node.children && (
          <div>
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const displayTree = tree && searchQuery ? filterTree(tree, searchQuery) : tree;

  return (
    <div className={cn('flex flex-col h-full border-r border-border bg-muted/5', className)}>
      <div className="p-2 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Files</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => loadDirectory(rootPath)}
            disabled={loading}
          >
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
          {displayTree ? (
            renderNode(displayTree)
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">
              {loading ? 'Loading...' : 'No files'}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
