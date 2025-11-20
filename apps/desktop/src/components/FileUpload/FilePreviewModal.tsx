import React, { useState, useEffect, useCallback } from 'react';
import { X, Download, Eye, FileText, Image as ImageIcon } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { DownloadableFile } from './FileDownloadButton';

interface FilePreviewModalProps {
  file: DownloadableFile | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload?: (file: DownloadableFile) => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  isOpen,
  onClose,
  onDownload,
}) => {
  const [previewContent, setPreviewContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    if (!file) return;

    try {
      setIsLoading(true);
      setError(null);

      // Handle different file types
      if (file.type.startsWith('image/')) {
        if (file.path) {
          setPreviewContent(convertFileSrc(file.path));
        } else if (file.content) {
          setPreviewContent(file.content); // Assume base64 data URL
        }
      } else if (
        file.type.startsWith('text/') ||
        file.type.includes('json') ||
        file.type.includes('xml')
      ) {
        if (file.path) {
          const content = await invoke<string>('file_read_text', {
            filePath: file.path,
          });
          setPreviewContent(content);
        } else if (file.content) {
          setPreviewContent(file.content);
        }
      } else if (file.type === 'application/pdf') {
        // PDFs require special handling
        setError('PDF preview not available. Please download to view.');
      } else {
        setError('Preview not available for this file type.');
      }
    } catch (err) {
      console.error('Preview error:', err);
      setError('Failed to load preview');
    } finally {
      setIsLoading(false);
    }
  }, [file]);

  useEffect(() => {
    if (file && isOpen) {
      loadPreview();
    } else {
      setPreviewContent('');
      setError(null);
    }
  }, [file, isOpen, loadPreview]);

  const renderPreview = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Loading preview...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-2 text-center">
            <Eye className="w-12 h-12 text-gray-400" />
            <p className="text-sm text-gray-500">{error}</p>
            {file && onDownload && (
              <button
                onClick={() => onDownload(file)}
                className="mt-2 px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Download className="w-4 h-4 mr-2 inline" />
                Download to View
              </button>
            )}
          </div>
        </div>
      );
    }

    if (!file) {
      return null;
    }

    if (file.type.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
          <img
            src={previewContent}
            alt={file.name}
            className="max-w-full max-h-[70vh] object-contain"
          />
        </div>
      );
    }

    if (file.type.startsWith('text/') || file.type.includes('json') || file.type.includes('xml')) {
      return (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 overflow-auto max-h-[70vh]">
          <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
            {previewContent}
          </pre>
        </div>
      );
    }

    return null;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col m-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {file?.type.startsWith('image/') ? (
              <ImageIcon className="w-5 h-5 text-gray-500" />
            ) : (
              <FileText className="w-5 h-5 text-gray-500" />
            )}
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate">
                {file?.name}
              </h2>
              {file && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {formatFileSize(file.size)} · {file.type}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {file && onDownload && (
              <button
                onClick={() => onDownload(file)}
                className="px-3 py-1.5 text-sm font-medium rounded-md border hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <Download className="w-4 h-4 mr-2 inline" />
                Download
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">{renderPreview()}</div>
      </div>
    </div>
  );
};
