import { Copy, Download, FileText, FolderOpen, Loader2 } from 'lucide-react';
import { useMemo } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '../../../lib/tauri-mock';
import type { ToolResultProps } from './index';
import { Button } from '../../ui/Button';

interface DocumentGenerationData {
  title?: string;
  prompt?: string;
  format?: string;
  filePath?: string;
  file_path?: string;
  output_path?: string;
  downloadUrl?: string;
  download_url?: string;
  status?: string;
  success?: boolean;
  error?: string;
}

function inferExtension(filePath?: string, format?: string): string {
  if (filePath) {
    const dotIndex = filePath.lastIndexOf('.');
    if (dotIndex > -1 && dotIndex < filePath.length - 1) {
      return filePath.slice(dotIndex + 1).toLowerCase();
    }
  }
  if (format) {
    const normalized = format.toLowerCase();
    if (normalized.includes('word') || normalized.includes('docx')) return 'docx';
    if (normalized.includes('excel') || normalized.includes('xlsx')) return 'xlsx';
    if (normalized.includes('pdf')) return 'pdf';
  }
  return 'txt';
}

function inferFilename(path?: string, extension = 'txt'): string {
  if (!path) return `generated-document.${extension}`;
  const normalized = path.replace(/\\/g, '/');
  const name = normalized.split('/').pop();
  if (!name || !name.trim()) return `generated-document.${extension}`;
  return name;
}

export const InlineDocumentGeneration: React.FC<ToolResultProps> = ({ result, status }) => {
  const data = result?.data as DocumentGenerationData | undefined;

  const resolvedPath = data?.filePath || data?.file_path || data?.output_path;
  const downloadUrl = data?.downloadUrl || data?.download_url;
  const extension = useMemo(
    () => inferExtension(resolvedPath, data?.format),
    [resolvedPath, data?.format],
  );
  const fileName = useMemo(() => inferFilename(resolvedPath, extension), [resolvedPath, extension]);
  const success = data?.success ?? true;
  const failed = status === 'failed' || status === 'error' || !success || Boolean(data?.error);

  // Show error state if status indicates failure, even if data is null
  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">Document generation failed</p>
            {data?.error && <p className="text-xs text-muted-foreground mt-1">{data.error}</p>}
            {!data?.error && result?.error && (
              <p className="text-xs text-muted-foreground mt-1">{result.error}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-muted-foreground">Generating document...</span>
          {data.title && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{data.title}</p>
          )}
        </div>
      </div>
    );
  }

  if (failed || (!resolvedPath && !downloadUrl)) {
    return (
      <div className="mt-3 p-3 rounded-lg bg-surface-elevated border border-destructive/30">
        <div className="flex items-start gap-2">
          <FileText className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-300 font-medium">Document generation failed</p>
            {data.error && <p className="text-xs text-muted-foreground mt-1">{data.error}</p>}
          </div>
        </div>
      </div>
    );
  }

  const handleSaveAs = async () => {
    try {
      const targetPath = await save({
        defaultPath: fileName,
        filters: [{ name: 'Generated Document', extensions: [extension] }],
      });
      if (!targetPath) return;

      if (resolvedPath) {
        await invoke('file_copy', { src: resolvedPath, dest: targetPath });
        return;
      }

      if (downloadUrl) {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = fileName;
        link.click();
      }
    } catch (error) {
      console.error('[InlineDocumentGeneration] Save As failed', error);
    }
  };

  return (
    <div className="mt-3 rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
      <div className="px-3 py-2 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-medium text-muted-foreground">Generated Document</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{fileName}</p>
      </div>

      <div className="px-3 py-2 space-y-2">
        {resolvedPath && (
          <p className="text-[11px] text-muted-foreground break-all" title={resolvedPath}>
            {resolvedPath}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {resolvedPath && (
            <Button
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => void open(resolvedPath)}
            >
              <FolderOpen className="h-4 w-4" />
              Open
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={() => void handleSaveAs()}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
          {resolvedPath && (
            <Button
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => void navigator.clipboard.writeText(resolvedPath)}
            >
              <Copy className="h-4 w-4" />
              Copy Path
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
