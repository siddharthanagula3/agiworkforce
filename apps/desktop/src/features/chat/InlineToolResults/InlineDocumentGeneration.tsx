import {
  Copy,
  Download,
  File,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Loader2,
  Share2,
  Shield,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { save } from '@tauri-apps/plugin-dialog';
import {
  summarizeGeneratedFileBundle,
  type ArtifactManifest,
  type ComputeSession,
  type GeneratedFile,
} from '@agiworkforce/types';
import { invoke, isTauri } from '../../../lib/tauri-mock';
import type { ToolResultProps } from './index';
import { Button } from '@/components/ui/Button';

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
  computeSession?: ComputeSession;
  generatedFile?: GeneratedFile;
  artifactManifest?: ArtifactManifest;
}

interface FileMetadata {
  sizeBytes: number;
  createdAt: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function fileUriToPath(uri?: string): string | undefined {
  if (!uri?.startsWith('file://')) return undefined;
  try {
    const url = new URL(uri);
    const decoded = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:/.test(decoded)) return decoded.slice(1);
    return decoded;
  } catch {
    return undefined;
  }
}

function getDocTypeInfo(ext: string): { icon: React.ReactNode; color: string; label: string } {
  switch (ext) {
    case 'pdf':
      return { icon: <FileText className="h-4 w-4" />, color: 'text-red-400', label: 'PDF' };
    case 'docx':
    case 'doc':
      return { icon: <File className="h-4 w-4" />, color: 'text-blue-400', label: 'Word' };
    case 'xlsx':
    case 'xls':
    case 'csv':
      return {
        icon: <FileSpreadsheet className="h-4 w-4" />,
        color: 'text-green-400',
        label: 'Excel',
      };
    default:
      return { icon: <FileText className="h-4 w-4" />, color: 'text-cyan-400', label: 'Document' };
  }
}

export const InlineDocumentGeneration: React.FC<ToolResultProps> = ({ result, status }) => {
  const data = result?.data as DocumentGenerationData | undefined;

  const generatedFilePath = fileUriToPath(data?.generatedFile?.uri);
  const resolvedPath = data?.filePath || data?.file_path || data?.output_path || generatedFilePath;
  const downloadUrl = data?.downloadUrl || data?.download_url;
  const primaryUri = data?.generatedFile?.uri || downloadUrl || resolvedPath;
  const success = data?.success ?? true;
  const failed = status === 'failed' || status === 'error' || !success || Boolean(data?.error);
  const extension = useMemo(
    () =>
      inferExtension(
        data?.generatedFile?.fileName ?? resolvedPath,
        data?.generatedFile?.kind ?? data?.format,
      ),
    [data?.generatedFile?.fileName, data?.generatedFile?.kind, resolvedPath, data?.format],
  );
  const fileName = useMemo(
    () => data?.generatedFile?.fileName ?? inferFilename(resolvedPath, extension),
    [data?.generatedFile?.fileName, resolvedPath, extension],
  );
  const fallbackComputeStatus = failed ? 'failed' : status === 'running' ? 'running' : 'completed';
  const generatedFileSummary = useMemo(
    () =>
      summarizeGeneratedFileBundle({
        computeSession: data?.computeSession,
        generatedFile: data?.generatedFile,
        artifactManifest: data?.artifactManifest,
        fallbackFileName: fileName,
        fallbackKind: extension,
        fallbackMimeType: data?.generatedFile?.mimeType,
        fallbackUri: primaryUri,
        fallbackStatus: fallbackComputeStatus,
      }),
    [
      data?.computeSession,
      data?.generatedFile,
      data?.artifactManifest,
      data?.generatedFile?.mimeType,
      fileName,
      extension,
      primaryUri,
      fallbackComputeStatus,
    ],
  );

  // Load file metadata (size + creation time) once the file path is available
  const [fileMeta, setFileMeta] = useState<FileMetadata | null>(null);
  useEffect(() => {
    if (!resolvedPath || failed) return;
    let cancelled = false;
    void (async () => {
      try {
        const meta = await invoke<FileMetadata>('file_get_metadata', { path: resolvedPath });
        if (!cancelled) setFileMeta(meta);
      } catch {
        // Metadata unavailable — silently skip
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvedPath, failed]);

  // Must be declared before all early returns to satisfy rules of hooks
  const createdAtDisplay = useMemo(() => {
    if (!fileMeta?.createdAt) return null;
    try {
      return new Date(fileMeta.createdAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return fileMeta.createdAt;
    }
  }, [fileMeta?.createdAt]);

  // Check running state before null guard so the spinner is reachable
  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-surface-elevated border border-border/50">
        <Loader2 className="h-5 w-5 animate-spin text-cyan-400" />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-muted-foreground">Generating document...</span>
          {data?.title && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{data?.title}</p>
          )}
        </div>
      </div>
    );
  }

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
      // Web fallback: use blob download or link
      if (!isTauri) {
        if (downloadUrl) {
          const link = document.createElement('a');
          link.href = downloadUrl;
          link.download = fileName;
          link.click();
        } else {
          toast.info('Save As requires the desktop app');
        }
        return;
      }

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
      toast.error(error instanceof Error ? error.message : 'Save As failed');
    }
  };

  const handleOpen = async () => {
    if (!resolvedPath) return;
    try {
      await invoke<void>('file_open_with_default_app', { path: resolvedPath });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open document');
    }
  };

  const handleShare = async () => {
    const shareTarget = primaryUri || resolvedPath;
    if (!shareTarget) return;
    const shareText = [
      `${generatedFileSummary.kindLabel}: ${generatedFileSummary.fileName}`,
      generatedFileSummary.privacyLabel
        ? `Privacy: ${generatedFileSummary.privacyLabel}`
        : undefined,
      generatedFileSummary.sourceSessionLabel,
      shareTarget,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (!isTauri && navigator.share) {
        await navigator.share({
          title: generatedFileSummary.title,
          text: shareText,
          url: shareTarget.startsWith('http') ? shareTarget : undefined,
        });
        return;
      }

      await navigator.clipboard.writeText(shareText);
      toast.success(
        generatedFileSummary.localOnly
          ? 'Local file reference copied. The file was not uploaded.'
          : 'Share reference copied',
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Share failed');
    }
  };

  const handleOpenInFinder = async () => {
    if (!resolvedPath) return;
    try {
      await invoke<void>('open_file_location', { path: resolvedPath });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open in Finder');
    }
  };

  const docType = getDocTypeInfo(extension);
  const fileSizeDisplay =
    generatedFileSummary.byteCountLabel ?? (fileMeta ? formatFileSize(fileMeta.sizeBytes) : null);

  return (
    <div className="mt-3 rounded-lg bg-surface-elevated border border-border/50 overflow-hidden">
      <div className="px-3 py-2 bg-surface-overlay/30 border-b border-border/30">
        <div className="flex items-center gap-2 mb-1">
          <span className={docType.color}>{docType.icon}</span>
          <span className="text-xs font-medium text-muted-foreground">
            Generated {docType.label}
          </span>
          <span className="rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {generatedFileSummary.statusLabel}
          </span>
          {generatedFileSummary.privacyShortLabel && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Shield className="h-3 w-3" />
              {generatedFileSummary.privacyShortLabel}
            </span>
          )}
          {fileSizeDisplay && (
            <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
              {fileSizeDisplay}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{fileName}</p>
        {createdAtDisplay && (
          <p className="text-[10px] text-muted-foreground mt-0.5">Created {createdAtDisplay}</p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {generatedFileSummary.providerLabel && (
            <span>Provider: {generatedFileSummary.providerLabel}</span>
          )}
          {generatedFileSummary.sourceSurfaceLabel && (
            <span>Source: {generatedFileSummary.sourceSurfaceLabel}</span>
          )}
          {generatedFileSummary.sourceSessionLabel && (
            <span>{generatedFileSummary.sourceSessionLabel}</span>
          )}
          {generatedFileSummary.checksumShort && (
            <span title={data?.generatedFile?.checksumSha256}>
              SHA-256: {generatedFileSummary.checksumShort}
            </span>
          )}
        </div>
        {generatedFileSummary.localOnly && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Local file. Share copies a reference only; AGI does not upload it.
          </p>
        )}
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
              onClick={() => void handleOpen()}
            >
              <FileText className="h-4 w-4" />
              Preview
            </Button>
          )}
          {resolvedPath && (
            <Button
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => void handleOpenInFinder()}
              title="Reveal in Finder"
            >
              <FolderOpen className="h-4 w-4" />
              Show in Finder
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            className="gap-2"
            onClick={() => void handleSaveAs()}
            disabled={!generatedFileSummary.canDownload && !downloadUrl && !resolvedPath}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
          {primaryUri && (
            <Button
              size="sm"
              variant="secondary"
              className="gap-2"
              onClick={() => void handleShare()}
              disabled={!generatedFileSummary.canShare}
            >
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          )}
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
