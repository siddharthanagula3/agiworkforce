'use client';

import { Spinner, useConfirmAction } from '@agiworkforce/ui';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ALLOWED_ATTACHMENT_ACCEPT,
  MAX_PROJECT_KNOWLEDGE_FILES,
  type ProjectKnowledgeFile,
  type ProjectKnowledgeIndexState,
} from '@agiworkforce/types';
import { FilePreviewModal } from './FilePreviewModal';
import { uploadProjectKnowledgeFile } from '../services/project-knowledge-upload';
import { getCsrfToken } from '@/lib/client/csrf';
import { toUserMessage } from '@/lib/user-error-message';
import { beginActiveUpload } from '@/features/workspaces/lib/active-uploads';

interface Props {
  projectId: string;
}

type LoadState = 'loading' | 'loaded' | 'error';

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; fileName: string; progress: number }
  | { status: 'error'; message: string };

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.startsWith('text/')) return '📝';
  if (mimeType === 'application/json') return '{ }';
  return '📁';
}

const INDEX_POLL_INTERVAL_MS = 5_000;
const MAX_INDEX_POLLS = 60;
const IN_PROGRESS_INDEX_STATUSES: ReadonlySet<ProjectKnowledgeIndexState['status']> = new Set([
  'pending',
  'indexing',
  'stale',
]);

function isIndexInProgress(file: ProjectKnowledgeFile): boolean {
  return file.indexing ? IN_PROGRESS_INDEX_STATUSES.has(file.indexing.status) : false;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function KnowledgeFilesPanel({ projectId }: Props) {
  const { confirm, dialog: confirmDialog } = useConfirmAction();
  const [files, setFiles] = useState<ProjectKnowledgeFile[]>([]);
  // Account-wide, not this project's total: the upload cap is account-wide, so
  // a per-project number would promise headroom the server will refuse.
  const [storage, setStorage] = useState<{
    usedBytes: number | null;
    limitBytes: number | null;
  } | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [isDragging, setIsDragging] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProjectKnowledgeFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const indexPollsRef = useRef(0);
  const [retryingFileId, setRetryingFileId] = useState<string | null>(null);

  const fetchFiles = useCallback(
    async (signal?: { cancelled: boolean }) => {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/knowledge-files`,
      );
      const body = (await response.json()) as {
        files?: ProjectKnowledgeFile[];
        storage?: { usedBytes: number | null; limitBytes: number | null };
      };
      if (signal?.cancelled) return;
      setFiles(body.files ?? []);
      setStorage(body.storage ?? null);
      setLoadState('loaded');
    },
    [projectId],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    setLoadState('loading');
    indexPollsRef.current = 0;
    fetchFiles(signal).catch(() => {
      if (!signal.cancelled) setLoadState('error');
    });
    return () => {
      signal.cancelled = true;
    };
  }, [fetchFiles]);

  const indexingInProgress = files.some(isIndexInProgress);
  useEffect(() => {
    if (!indexingInProgress || indexPollsRef.current >= MAX_INDEX_POLLS) return;
    const signal = { cancelled: false };
    const timer = setTimeout(() => {
      indexPollsRef.current += 1;
      fetchFiles(signal).catch(() => undefined);
    }, INDEX_POLL_INTERVAL_MS);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [indexingInProgress, files, fetchFiles]);

  async function handleRetryIndexing(file: ProjectKnowledgeFile) {
    setRetryingFileId(file.id);
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/knowledge-files/${encodeURIComponent(file.id)}/reindex`,
        { method: 'POST', headers: { 'x-csrf-token': csrfToken }, credentials: 'include' },
      );
      if (!res.ok) throw new Error(`Reindex failed (${res.status})`);
      const body = (await res.json()) as { indexing?: ProjectKnowledgeIndexState | null };
      indexPollsRef.current = 0;
      setFiles((current) =>
        current.map((entry) =>
          entry.id === file.id ? { ...entry, indexing: body.indexing ?? entry.indexing } : entry,
        ),
      );
    } catch {
      toast.error(`Couldn't restart indexing for ${file.fileName}. Try again.`);
    } finally {
      setRetryingFileId(null);
    }
  }

  async function handleDelete(file: ProjectKnowledgeFile) {
    const previous = files;
    setFiles((current) => current.filter((f) => f.id !== file.id));
    try {
      const csrfToken = await getCsrfToken();
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/knowledge-files/${encodeURIComponent(file.id)}`,
        { method: 'DELETE', headers: { 'x-csrf-token': csrfToken }, credentials: 'include' },
      );
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
    } catch {
      setFiles(previous);
      toast.error(`Couldn't remove ${file.fileName}. Try again.`);
    }
  }

  async function handleUpload(file: File) {
    setUploadState({ status: 'uploading', fileName: file.name, progress: 0 });

    try {
      const registeredFile = await uploadProjectKnowledgeFile({
        projectId,
        file,
        onProgress: (progress) =>
          setUploadState({ status: 'uploading', fileName: file.name, progress }),
      });
      setFiles((previous) => [registeredFile, ...previous]);
      setUploadState({ status: 'idle' });
    } catch (err) {
      setUploadState({
        status: 'error',
        message: toUserMessage(err, 'Upload failed.'),
      });
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleUpload(file);
  }

  const isUploading = uploadState.status === 'uploading';
  const uploadingFileName = uploadState.status === 'uploading' ? uploadState.fileName : null;

  useEffect(() => {
    if (!uploadingFileName) return;
    return beginActiveUpload(uploadingFileName);
  }, [uploadingFileName]);

  const totalBytes = files.reduce((s, f) => s + f.byteCount, 0);
  const totalKb = (totalBytes / 1024).toFixed(1);

  return (
    <div data-testid="knowledge-files-panel">
      {confirmDialog}
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--space-4)',
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--agi-ink)', margin: 0 }}>
          Knowledge Files
          {files.length > 0 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 400,
                color: 'var(--agi-ink-2)',
                marginLeft: 'var(--space-2)',
              }}
            >
              {/*
                The cap was invisible until the upload route refused the 21st
                file. A project holding 20 files is at its limit and the only
                way to learn that was to be told no.
              */}
              {files.length} of {MAX_PROJECT_KNOWLEDGE_FILES} files &middot; {totalKb} KB
              {storage && storage.usedBytes !== null && storage.limitBytes !== null ? (
                <>
                  {' '}
                  &middot;{' '}
                  <span
                    style={{
                      color:
                        storage.usedBytes / storage.limitBytes >= 0.9
                          ? 'var(--color-primary)'
                          : undefined,
                    }}
                  >
                    {formatBytes(storage.usedBytes)} of {formatBytes(storage.limitBytes)} storage
                    used
                  </span>
                </>
              ) : null}
              {files.length >= MAX_PROJECT_KNOWLEDGE_FILES && (
                <span style={{ color: 'var(--color-primary)', marginLeft: 'var(--space-2)' }}>
                  &middot; full, remove one to add another
                </span>
              )}
            </span>
          )}
        </p>
        <button
          type="button"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
          data-testid="knowledge-files-upload-btn"
          style={{
            padding: 'var(--space-2) var(--space-4)',
            borderRadius: 'var(--corner-pill)',
            border: '1px solid var(--agi-rule-strong)',
            background: 'transparent',
            color: isUploading ? 'var(--agi-ink-2)' : 'var(--agi-ink)',
            fontSize: 12,
            fontWeight: 500,
            cursor: isUploading ? 'not-allowed' : 'pointer',
            opacity: isUploading ? 0.6 : 1,
          }}
        >
          {isUploading ? `Uploading...` : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_ATTACHMENT_ACCEPT}
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
          data-testid="knowledge-files-input"
        />
      </div>

      {/* Upload progress / error banner */}
      {uploadState.status === 'uploading' && (
        <div
          style={{
            marginBottom: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--corner-field)',
            border: '1px solid var(--agi-rule)',
            background: 'var(--agi-bg-2)',
            fontSize: 12,
            color: 'var(--agi-ink-2)',
          }}
        >
          Uploading &ldquo;{uploadState.fileName}&rdquo;... {uploadState.progress}%
        </div>
      )}

      {uploadState.status === 'error' && (
        <div
          style={{
            marginBottom: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--corner-field)',
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            fontSize: 12,
            color: 'var(--agi-error)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-2)',
          }}
        >
          <span>{uploadState.message}</span>
          <button
            type="button"
            onClick={() => setUploadState({ status: 'idle' })}
            style={{
              flexShrink: 0,
              background: 'transparent',
              border: 0,
              padding: 0,
              color: 'var(--agi-error)',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Dropzone (shown when no files and not loading) */}
      {loadState === 'loaded' && files.length === 0 && uploadState.status !== 'uploading' && (
        <div
          data-testid="knowledge-files-dropzone"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Drop a file here or click to upload"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          style={{
            border: `2px dashed ${isDragging ? 'var(--color-primary)' : 'var(--agi-rule-strong)'}`,
            borderRadius: 'var(--corner-surface)',
            padding: 'var(--space-6) var(--space-4)',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragging
              ? 'color-mix(in srgb, var(--color-primary) 12%, transparent)'
              : 'transparent',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <p
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--agi-ink)',
              margin: '0 0 var(--space-2)',
            }}
          >
            No knowledge files yet
          </p>
          <p
            style={{
              fontSize: 12,
              color: 'var(--agi-ink-2)',
              margin: '0 auto',
              maxWidth: 480,
              lineHeight: 1.55,
            }}
          >
            Drop a file here or click Upload to add context files. Images, PDFs, text, and JSON are
            supported.
          </p>
        </div>
      )}

      {loadState === 'loading' && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--agi-ink-2)',
            textAlign: 'center',
            padding: 'var(--space-5) 0',
          }}
        >
          Loading...
        </p>
      )}

      {loadState === 'error' && (
        <p
          style={{
            fontSize: 12,
            color: 'var(--agi-ink-2)',
            textAlign: 'center',
            padding: 'var(--space-5) 0',
          }}
        >
          Failed to load knowledge files.
        </p>
      )}

      {/* File list */}
      {loadState === 'loaded' && files.length > 0 && (
        <ul
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            padding: 0,
            margin: 0,
          }}
          data-testid="knowledge-files-list"
        >
          {files.map((file) => (
            <li
              key={file.id}
              style={{
                listStyle: 'none',
                border: '1px solid var(--agi-rule)',
                borderRadius: 'var(--corner-surface)',
                padding: 'var(--space-3) var(--space-4)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                cursor: 'pointer',
              }}
              onClick={() => setPreviewFile(file)}
              role="button"
              tabIndex={0}
              aria-label={`Preview ${file.fileName}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setPreviewFile(file);
              }}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }} aria-hidden>
                {fileIcon(file.mimeType)}
              </span>
              <span
                style={{
                  flex: 1,
                  // Without minWidth a flex child refuses to shrink below its
                  // content, so a long file name pushes the size and delete
                  // controls out of the row instead of ellipsing.
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-1)',
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    color: 'var(--agi-ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {file.fileName}
                </span>
                <KnowledgeIndexStatus
                  indexing={file.indexing ?? null}
                  retrying={retryingFileId === file.id}
                  onRetry={() => void handleRetryIndexing(file)}
                />
              </span>
              <span style={{ fontSize: 12, color: 'var(--agi-ink-2)', flexShrink: 0 }}>
                {(file.byteCount / 1024).toFixed(1)} KB
              </span>
              <button
                type="button"
                data-testid="knowledge-files-delete"
                aria-label={`Remove ${file.fileName}`}
                title="Remove file"
                onClick={(e) => {
                  e.stopPropagation();
                  confirm({
                    title: `Remove ${file.fileName}?`,
                    description:
                      'The file is deleted from this project\u2019s knowledge and the assistant stops using it. This cannot be undone, the file would have to be uploaded again.',
                    confirmLabel: 'Remove file',
                    onConfirm: () => handleDelete(file),
                  });
                }}
                onKeyDown={(e) => {
                  e.stopPropagation();
                }}
                style={{
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--agi-ink-2)',
                  padding: 'var(--space-1)',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Drag-over overlay when files already exist */}
      {loadState === 'loaded' && files.length > 0 && (
        <div
          data-testid="knowledge-files-drop-overlay"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          style={{
            marginTop: 'var(--space-2)',
            border: `1px dashed ${isDragging ? 'var(--color-primary)' : 'var(--agi-rule)'}`,
            borderRadius: 'var(--corner-field)',
            padding: 'var(--space-2) var(--space-3)',
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--agi-ink-2)',
            cursor: 'default',
            transition: 'border-color 0.15s',
          }}
        >
          Drop another file to add it
        </div>
      )}

      {/* File preview modal */}
      <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
    </div>
  );
}

function KnowledgeIndexStatus({
  indexing,
  retrying,
  onRetry,
}: {
  indexing: ProjectKnowledgeIndexState | null;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (!indexing) return null;
  const inProgress = IN_PROGRESS_INDEX_STATUSES.has(indexing.status) || retrying;
  if (!inProgress && indexing.status === 'indexed') return null;

  const label = inProgress
    ? 'Indexing for search'
    : indexing.chunkCount > 0
      ? 'Keyword search only'
      : 'Not indexed';

  return (
    <span
      data-testid="knowledge-files-index-status"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--space-2)',
        fontSize: 12,
        color: !inProgress && indexing.chunkCount === 0 ? 'var(--agi-error)' : 'var(--agi-ink-2)',
      }}
    >
      {inProgress ? <Spinner size="sm" aria-label="Indexing" /> : null}
      <span>{inProgress ? label : (indexing.error ?? label)}</span>
      {!inProgress && indexing.status === 'failed' ? (
        <button
          type="button"
          data-testid="knowledge-files-retry-index"
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          onKeyDown={(event) => event.stopPropagation()}
          style={{
            background: 'transparent',
            border: 0,
            padding: 0,
            minHeight: 24,
            color: 'var(--agi-ink)',
            fontSize: 12,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          Retry indexing
        </button>
      ) : null}
    </span>
  );
}
