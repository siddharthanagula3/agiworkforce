import { FileTree } from '../Code/FileTree';
import { useEditingStore } from '../../stores/editingStore';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';

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
      <style>{`
        .file-tree-node[data-changed="true"] {
          background-color: rgba(var(--primary-rgb), 0.1);
        }
      `}</style>
    </div>
  );
}
