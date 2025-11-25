import { invoke } from '@/lib/tauri-mock';
import { save } from '@tauri-apps/plugin-dialog';
import { CheckCircle, Download, File, FileText, Image as ImageIcon } from 'lucide-react';
import React, { useState } from 'react';

// Helper function for className merging
const cn = (...classes: (string | undefined | false)[]) => classes.filter(Boolean).join(' ');

export interface DownloadableFile {
  id: string;
  name: string;
  size: number;
  type: string; // MIME type
  path?: string; // For files already on disk
  content?: string; // For files to be created (base64 or text)
  created_at?: string;
}

interface FileDownloadButtonProps {
  file: DownloadableFile;
  variant?: 'button' | 'inline' | 'card';
  onDownloadComplete?: (filePath: string) => void;
  onDownloadError?: (error: string) => void;
  className?: string;
}

export const FileDownloadButton: React.FC<FileDownloadButtonProps> = ({
  file,
  variant = 'button',
  onDownloadComplete,
  onDownloadError,
  className,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);

  const getFileIcon = () => {
    if (file.type.startsWith('image/')) {
      return <ImageIcon className="w-4 h-4" />;
    }
    if (file.type.startsWith('text/') || file.type.includes('document')) {
      return <FileText className="w-4 h-4" />;
    }
    return <File className="w-4 h-4" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = async () => {
    try {
      setIsDownloading(true);

      // Ask user where to save the file
      const savePath = await save({
        defaultPath: file.name,
        filters: [
          {
            name: 'All Files',
            extensions: ['*'],
          },
        ],
      });

      if (!savePath) {
        setIsDownloading(false);
        return;
      }

      let downloadPath: string;

      if (file.path) {
        // File already exists on disk, copy it
        await invoke('file_copy', {
          sourcePath: file.path,
          destinationPath: savePath,
        });
        downloadPath = savePath;
      } else if (file.content) {
        // Create file from content
        await invoke('file_write_text', {
          filePath: savePath,
          content: file.content,
        });
        downloadPath = savePath;
      } else {
        throw new Error('No file path or content available');
      }

      setIsDownloaded(true);
      onDownloadComplete?.(downloadPath);

      // Reset downloaded state after 3 seconds
      setTimeout(() => setIsDownloaded(false), 3000);
    } catch (error) {
      console.error('Download error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown download error';
      onDownloadError?.(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  if (variant === 'inline') {
    return (
      <button
        onClick={handleDownload}
        disabled={isDownloading}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium',
          'text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300',
          'hover:bg-blue-50 dark:hover:bg-blue-900/10 rounded-md transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          className,
        )}
      >
        {isDownloaded ? (
          <>
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span>Downloaded</span>
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            <span>{isDownloading ? 'Downloading...' : 'Download'}</span>
          </>
        )}
      </button>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={cn(
          'flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700',
          'hover:border-gray-300 dark:hover:border-gray-600 transition-colors',
          className,
        )}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {getFileIcon()}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {file.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatFileSize(file.size)}
              {file.created_at && <> · {new Date(file.created_at).toLocaleDateString()}</>}
            </p>
          </div>
        </div>
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className={cn(
            'ml-3 px-3 py-1.5 text-sm font-medium rounded-md border transition-colors',
            'hover:bg-gray-100 dark:hover:bg-gray-800',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className,
          )}
        >
          {isDownloaded ? (
            <>
              <CheckCircle className="w-4 h-4 mr-2 text-green-500 inline" />
              Downloaded
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2 inline" />
              {isDownloading ? 'Downloading...' : 'Download'}
            </>
          )}
        </button>
      </div>
    );
  }

  // Default 'button' variant
  return (
    <button
      onClick={handleDownload}
      disabled={isDownloading}
      className={cn(
        'px-3 py-1.5 text-sm font-medium rounded-md border transition-colors',
        'hover:bg-gray-100 dark:hover:bg-gray-800',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      {isDownloaded ? (
        <>
          <CheckCircle className="w-4 h-4 mr-2 text-green-500 inline" />
          Downloaded
        </>
      ) : (
        <>
          <Download className="w-4 h-4 mr-2 inline" />
          {isDownloading ? 'Downloading...' : 'Download'}
        </>
      )}
    </button>
  );
};
