import React, { useCallback, useRef, useState } from 'react';
import { Upload, X, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface FileUploadButtonProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  accept?: string;
  multiple?: boolean;
  maxSize?: number; // In MB
  maxFiles?: number;
  showFeedback?: boolean;
}

interface FileError {
  file: string;
  message: string;
}

export const FileUploadButton: React.FC<FileUploadButtonProps> = ({
  onFilesSelected,
  disabled = false,
  accept = '*/*',
  multiple = true,
  maxSize = 100,
  maxFiles = 10,
  showFeedback = true,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<FileError[]>([]);
  const [selectedCount, setSelectedCount] = useState(0);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file size
      const fileSizeMB = file.size / (1024 * 1024);
      if (fileSizeMB > maxSize) {
        return `File "${file.name}" (${formatFileSize(file.size)}) exceeds ${maxSize}MB limit`;
      }

      // Check file type if accept is specified
      if (accept && accept !== '*/*') {
        const acceptedTypes = accept.split(',').map((t) => t.trim());
        const fileType = file.type;
        const fileExt = `.${file.name.split('.').pop()?.toLowerCase()}`;

        const isAccepted = acceptedTypes.some((type) => {
          if (type === '*/*') return true;
          if (type.endsWith('/*')) {
            // Handle wildcard types like "image/*"
            const prefix = type.replace('/*', '');
            return fileType.startsWith(prefix) || fileType === prefix;
          }
          return type === fileType || type.toLowerCase() === fileExt;
        });

        if (!isAccepted) {
          return `File "${file.name}" has unsupported format. Accepted: ${accept}`;
        }
      }

      return null;
    },
    [maxSize, accept],
  );

  const handleClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsLoading(true);
    setErrors([]);

    try {
      const newErrors: FileError[] = [];
      const validFiles: File[] = [];

      // Check max files limit
      if (files.length > maxFiles) {
        const errorMsg = `Too many files. Maximum is ${maxFiles} files at once`;
        newErrors.push({ file: 'Limit', message: errorMsg });
        if (showFeedback) {
          toast.error(errorMsg);
        }
        // Reset input and return early
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        setIsLoading(false);
        return;
      }

      // Validate each file
      for (const file of files) {
        const error = validateFile(file);
        if (error) {
          newErrors.push({ file: file.name, message: error });
        } else {
          validFiles.push(file);
        }
      }

      // Report errors
      setErrors(newErrors);
      const firstError = newErrors[0];
      if (firstError && showFeedback) {
        // Show first error as toast
        toast.error(firstError.message, {
          description: newErrors.length > 1 ? `and ${newErrors.length - 1} more issues` : undefined,
          duration: 4000,
        });
      }

      // Pass valid files to parent
      if (validFiles.length > 0) {
        setSelectedCount(validFiles.length);
        onFilesSelected(validFiles);
        if (showFeedback) {
          toast.success(`${validFiles.length} file${validFiles.length > 1 ? 's' : ''} selected`, {
            duration: 2000,
          });
        }
      }
    } finally {
      // Reset input to allow selecting same files again
      const input = fileInputRef.current;
      if (input) {
        input.value = '';
      }
      setIsLoading(false);
    }
  };

  const clearErrors = () => setErrors([]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          disabled={disabled || isLoading}
          className="hidden"
          aria-label="File upload input"
        />
        <button
          type="button"
          onClick={handleClick}
          disabled={disabled || isLoading}
          title="Upload files"
          aria-label="Upload files"
          className="p-2 rounded-md border border-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
        </button>

        {/* Selection indicator */}
        {selectedCount > 0 && (
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {selectedCount} file{selectedCount > 1 ? 's' : ''} selected
          </span>
        )}
      </div>

      {/* Error display */}
      {errors.length > 0 && (
        <div
          className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            {errors.map((err, idx) => (
              <p key={idx} className="text-red-700 dark:text-red-300">
                {err.message}
              </p>
            ))}
          </div>
          <button
            onClick={clearErrors}
            className="p-0.5 hover:bg-red-100 dark:hover:bg-red-800 rounded"
            aria-label="Dismiss errors"
            type="button"
          >
            <X className="w-3 h-3 text-red-500" />
          </button>
        </div>
      )}
    </div>
  );
};
