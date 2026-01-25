import React, { useCallback, useState } from 'react';
import { Upload, File, X, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/useToast';

const cn = (...classes: (string | undefined | false)[]) => classes.filter(Boolean).join(' ');

interface FileDropZoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  maxSize?: number; // In MB
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  onFilesSelected,
  accept = '*',
  maxSize = 10,
  maxFiles = 5,
  disabled = false,
  className,
}) => {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = useCallback(
    (file: File): boolean => {
      setError(null);

      if (file.size > maxSize * 1024 * 1024) {
        const errorMsg = `File "${file.name}" is too large. Maximum size is ${maxSize}MB.`;
        setError(errorMsg);
        toast({ title: 'File too large', description: errorMsg, variant: 'destructive' });
        return false;
      }

      if (accept !== '*') {
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
          const errorMsg = `File "${file.name}" has an invalid type. Accepted types: ${accept}`;
          setError(errorMsg);
          toast({ title: 'Invalid file type', description: errorMsg, variant: 'destructive' });
          return false;
        }
      }

      return true;
    },
    [maxSize, accept],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);
      const validFiles = files.filter(validateFile);

      if (validFiles.length + uploadedFiles.length > maxFiles) {
        const errorMsg = `You can only upload a maximum of ${maxFiles} files.`;
        setError(errorMsg);
        toast({ title: 'Too many files', description: errorMsg, variant: 'destructive' });
        return;
      }

      setError(null);
      setUploadedFiles((prev) => [...prev, ...validFiles]);
      onFilesSelected(validFiles);
    },
    [disabled, maxFiles, uploadedFiles.length, onFilesSelected, validateFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled || !e.target.files) return;

      const files = Array.from(e.target.files);
      const validFiles = files.filter(validateFile);

      if (validFiles.length + uploadedFiles.length > maxFiles) {
        const errorMsg = `You can only upload a maximum of ${maxFiles} files.`;
        setError(errorMsg);
        toast({ title: 'Too many files', description: errorMsg, variant: 'destructive' });
        return;
      }

      setError(null);
      setUploadedFiles((prev) => [...prev, ...validFiles]);
      onFilesSelected(validFiles);
      e.target.value = ''; // Reset input
    },
    [disabled, maxFiles, uploadedFiles.length, onFilesSelected, validateFile],
  );

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-6 transition-colors text-center cursor-pointer',
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="hidden"
          id="file-upload"
          multiple
          accept={accept}
          onChange={handleFileInput}
          disabled={disabled}
        />
        <label htmlFor="file-upload" className="cursor-pointer block">
          <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Drag & drop files here, or click to select
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {accept === '*' ? 'Any file type' : `Accepted: ${accept.replace(/,/g, ', ')}`}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Max size: {maxSize}MB per file | Max files: {maxFiles}
          </p>
        </label>
      </div>

      {/* Error Display */}
      {error && (
        <div
          className="mt-3 flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-800 rounded"
            aria-label="Dismiss error"
            type="button"
          >
            <X className="w-3 h-3 text-red-500" />
          </button>
        </div>
      )}

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Uploaded Files ({uploadedFiles.length}/{maxFiles})
          </h4>
          <div className="space-y-2">
            {uploadedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <File className="w-5 h-5 text-gray-400 shrink-0" />
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
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-gray-500 hover:text-red-500"
                  aria-label={`Remove ${file.name}`}
                  type="button"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
