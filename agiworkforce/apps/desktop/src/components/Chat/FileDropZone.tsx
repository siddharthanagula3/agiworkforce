import { useCallback, useState, DragEvent } from 'react';
import { Upload, FileWarning } from 'lucide-react';
import { cn } from '../../lib/utils';
import { validateFiles, MAX_FILE_SIZE } from '../../utils/fileUtils';

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  onError?: (errors: Array<{ file: File; error: string }>) => void;
  maxFiles?: number;
  className?: string;
  children?: React.ReactNode;
}

export function FileDropZone({
  onFilesSelected,
  onError,
  maxFiles = 5,
  className,
  children,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragOut = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;

      // Limit number of files
      const limitedFiles = files.slice(0, maxFiles);

      // Validate files
      const { valid, invalid } = validateFiles(limitedFiles);

      if (valid.length > 0) {
        onFilesSelected(valid);
      }

      if (invalid.length > 0 && onError) {
        onError(invalid);
      }
    },
    [maxFiles, onFilesSelected, onError]
  );

  if (children) {
    return (
      <div
        onDrag={handleDrag}
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={cn('relative', className)}
      >
        {children}
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-primary border-dashed rounded-lg backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Upload className="h-8 w-8" />
              <p className="text-sm font-medium">Drop files here</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onDrag={handleDrag}
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed transition-colors',
        isDragging
          ? 'border-primary bg-primary/10'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50',
        className
      )}
      role="button"
      tabIndex={0}
      aria-label="Drop files here to upload"
    >
      <div className={cn(
        'flex h-12 w-12 items-center justify-center rounded-full transition-colors',
        isDragging ? 'bg-primary/20' : 'bg-muted'
      )}>
        <Upload className={cn(
          'h-6 w-6',
          isDragging ? 'text-primary' : 'text-muted-foreground'
        )} />
      </div>
      <div className="text-center">
        <p className={cn(
          'text-sm font-medium',
          isDragging ? 'text-primary' : 'text-foreground'
        )}>
          {isDragging ? 'Drop files here' : 'Drag and drop files here'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          or click the attachment button to browse
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <FileWarning className="h-3.5 w-3.5" />
        <span>
          Max {maxFiles} files, {(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB each
        </span>
      </div>
    </div>
  );
}
