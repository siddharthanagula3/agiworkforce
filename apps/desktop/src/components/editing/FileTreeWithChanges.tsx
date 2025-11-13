import { useMemo } from 'react';
import { FileTree, type FileNode } from '../Code/FileTree';
import { useEditingStore } from '../../stores/editingStore';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import { Plus, Minus, FileText } from 'lucide-react';

interface FileTreeWithChangesProps {
  rootPath: string;
  onFileSelect: (path: string) => void;
  selectedFile?: string;
  className?: string;
}

export function FileTreeWithChanges({
  rootPath,
  onFileSelect,
  selectedFile,
  className,
}: FileTreeWithChangesProps) {
  const { getChangedFiles } = useEditingStore();
  const changedFiles = getChangedFiles();

  // Create a map of file paths to their change status
  const changeMap = useMemo(() => {
    const map = new Map<string, 'modified' | 'added' | 'deleted'>();
    changedFiles.forEach(file => {
      map.set(normalizePath(file.path), file.type);
    });
    return map;
  }, [changedFiles]);

  // Custom render function that adds change indicators
  const renderNodeWithChanges = (node: FileNode, defaultRender: React.ReactNode) => {
    if (node.isDirectory) {
      return defaultRender;
    }

    const normalizedPath = normalizePath(node.path);
    const changeType = changeMap.get(normalizedPath);

    if (!changeType) {
      return defaultRender;
    }

    return (
      <div className="flex items-center gap-2 flex-1">
        {defaultRender}
        <ChangeIndicator type={changeType} />
      </div>
    );
  };

  return (
    <div className={cn('relative', className)}>
      {/* Summary Badge */}
      {changedFiles.length > 0 && (
        <div className="absolute top-2 right-2 z-10">
          <Badge variant="default" className="gap-1">
            {changedFiles.length} change{changedFiles.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      )}

      {/* File Tree */}
      <FileTree
        rootPath={rootPath}
        onFileSelect={onFileSelect}
        selectedFile={selectedFile}
        className={className}
      />

      {/* Custom styling for changed files */}
      <style jsx>{`
        .file-tree-node[data-changed="true"] {
          background-color: rgba(var(--primary-rgb), 0.1);
        }
      `}</style>
    </div>
  );
}

function ChangeIndicator({ type }: { type: 'modified' | 'added' | 'deleted' }) {
  switch (type) {
    case 'added':
      return (
        <Badge
          variant="outline"
          className="h-5 px-1.5 gap-0.5 bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400"
        >
          <Plus className="h-3 w-3" />
          <span className="text-xs font-mono">A</span>
        </Badge>
      );

    case 'deleted':
      return (
        <Badge
          variant="outline"
          className="h-5 px-1.5 gap-0.5 bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400"
        >
          <Minus className="h-3 w-3" />
          <span className="text-xs font-mono">D</span>
        </Badge>
      );

    case 'modified':
      return (
        <Badge
          variant="outline"
          className="h-5 px-1.5 gap-0.5 bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
        >
          <FileText className="h-3 w-3" />
          <span className="text-xs font-mono">M</span>
        </Badge>
      );
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}
