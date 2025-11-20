import React, { useCallback, useState } from 'react';
import { Upload, File, X } from 'lucide-react';

// Helper function for className merging
const cn = (...classes: (string | undefined | false)[]) => classes.filter(Boolean).join(' ');

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxSize?: number; // in MB
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  onFilesSelected,
  accept = '*/*',
  maxSize = 100,
  maxFiles = 10,
  disabled = false,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragging(true);
      }
    },
    [disabled],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const validateFile = (file: File): boolean => {
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSize) {
      console.warn(`File ${file.name} exceeds ${maxSize}MB limit`);
      return false;
    }

    if (accept !== '*/*') {
      const acceptedTypes = accept.split(',').map((t) => t.trim());
      const fileType = file.type;
      const fileExt = `.${file.name.split('.').pop()}`;

      const isAccepted = acceptedTypes.some(
        (type) =>
          type === fileType ||
          type === fileExt ||
          (type.endsWith('/*') && fileType.startsWith(type.replace('/*', ''))),
      );

      if (!isAccepted) {
        console.warn(`File ${file.name} type not accepted`);
        return false;
      }
    }

    return true;
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const droppedFiles = Array.from(e.dataTransfer.files);
      const validFiles = droppedFiles.filter(validateFile);

      if (validFiles.length + uploadedFiles.length > maxFiles) {
        console.warn(`Maximum ${maxFiles} files allowed`);
        validFiles.splice(maxFiles - uploadedFiles.length);
      }

      if (validFiles.length > 0) {
        const newFiles = [...uploadedFiles, ...validFiles];
        setUploadedFiles(newFiles);
        onFilesSelected(newFiles);
      }
    },
    [disabled, uploadedFiles, maxFiles, onFilesSelected, validateFile],
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const validFiles = selectedFiles.filter(validateFile);

    if (validFiles.length + uploadedFiles.length > maxFiles) {
      console.warn(`Maximum ${maxFiles} files allowed`);
      validFiles.splice(maxFiles - uploadedFiles.length);
    }

    if (validFiles.length > 0) {
      const newFiles = [...uploadedFiles, ...validFiles];
      setUploadedFiles(newFiles);
      onFilesSelected(newFiles);
    }

    // Reset input
    e.target.value = '';
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = uploadedFiles.filter((_, i) => i !== index);
    setUploadedFiles(newFiles);
    onFilesSelected(newFiles);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          'relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg transition-colors',
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/10'
            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <input
          type="file"
          id="file-upload"
          accept={accept}
          multiple={uploadedFiles.length < maxFiles}
          onChange={handleFileInputChange}
          disabled={disabled}
          className="hidden"
        />

        <label
          htmlFor="file-upload"
          className={cn(
            'flex flex-col items-center justify-center w-full h-full cursor-pointer',
            disabled && 'cursor-not-allowed',
          )}
        >
          <Upload
            className={cn('w-12 h-12 mb-4', isDragging ? 'text-blue-500' : 'text-gray-400')}
          />
          <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {accept === '*/*' ? 'Any file type' : `Accepted: ${accept.replace(/,/g, ', ')}`}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Max size: {maxSize}MB per file | Max files: {maxFiles}
          </p>
        </label>
      </div>

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Uploaded Files ({uploadedFiles.length}/{maxFiles})
          </h4>
          <div className="space-y-2">
            {uploadedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <File className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                  aria-label={`Remove ${file.name}`}
                  type="button"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
