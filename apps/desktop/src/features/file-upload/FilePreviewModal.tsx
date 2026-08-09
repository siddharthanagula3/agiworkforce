import { convertFileSrc, invoke } from '@/lib/tauri-mock';
import { Download, Eye, FileText, Image as ImageIcon } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/ui/Dialog';
import type { DownloadableFile } from './FileDownloadButton';
import { PDFViewer } from './PDFViewer';

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

      if (file.type.startsWith('image/')) {
        if (file.path) {
          setPreviewContent(convertFileSrc(file.path));
        } else if (file.content) {
          setPreviewContent(file.content);
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
        // PDF will be handled by the PDFViewer component
        if (file.path) {
          setPreviewContent(convertFileSrc(file.path));
        } else if (file.content) {
          setPreviewContent(file.content);
        }
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
        <div className="flex h-96 items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex h-96 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-center">
            <Eye className="h-12 w-12 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">{error}</p>
            {file && onDownload && (
              <button
                type="button"
                onClick={() => onDownload(file)}
                className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Download className="mr-2 inline h-4 w-4" />
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
        <div className="flex items-center justify-center overflow-hidden rounded-lg bg-muted/50">
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
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-muted/40 p-4">
          <pre className="whitespace-pre-wrap font-mono text-sm text-foreground">
            {previewContent}
          </pre>
        </div>
      );
    }

    if (file.type === 'application/pdf' && previewContent) {
      return (
        <PDFViewer
          src={previewContent}
          filePath={file.path}
          className="max-h-[70vh]"
          onError={(err) => {
            console.error('PDF viewer error:', err);
            setError('Failed to load PDF. Please download to view.');
          }}
        />
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[88vh] w-[min(780px,calc(100vw-48px))] max-w-none flex-col overflow-hidden border-border/70 bg-background p-0 shadow-2xl sm:rounded-xl">
        <DialogHeader className="border-b border-border px-6 py-5">
          <div className="flex min-w-0 items-start justify-between gap-4 pr-8">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {file?.type.startsWith('image/') ? (
                <ImageIcon className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-lg font-semibold">
                  {file?.name ?? 'File preview'}
                </DialogTitle>
                {file && (
                  <DialogDescription className="mt-1 text-sm text-muted-foreground">
                    {formatFileSize(file.size)} · {file.type}
                  </DialogDescription>
                )}
              </div>
            </div>
            {file && onDownload && (
              <button
                type="button"
                onClick={() => onDownload(file)}
                className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
              >
                <Download className="mr-2 inline h-4 w-4" />
                Download
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-background p-5">{renderPreview()}</div>
      </DialogContent>
    </Dialog>
  );
};
